import atexit
import base64
import html
import io
import json
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
import zipfile
from collections.abc import Callable
from datetime import datetime
from functools import wraps
from pathlib import Path

import requests
import tidalapi
from mutagen.flac import FLAC
from mutagen.mp4 import MP4
from tidalapi.media import Quality
from tidalapi.session import Session

from app.core.metadata import apply_flac_metadata, apply_m4a_metadata, build_metadata
from app.core.quality import extension_for, is_lossless, resolve_quality


# ----------------- Decorador de reintentos -----------------
def retry(max_retries=3, backoff_factor=1.5, cancel_event=None):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            cancel_evt = kwargs.get("cancel_event", None) or cancel_event
            last_exception = None
            for attempt in range(max_retries):
                try:
                    if cancel_evt and cancel_evt.is_set():
                        raise RuntimeWarning("Cancelado por el usuario")
                    return func(*args, **kwargs)
                except requests.exceptions.HTTPError as e:
                    if e.response is not None and e.response.status_code == 429:
                        retry_after = int(e.response.headers.get("Retry-After", 5))
                        time.sleep(retry_after)
                        continue
                    raise
                except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
                    last_exception = e
                    if attempt < max_retries - 1:
                        sleep_time = backoff_factor**attempt
                        time.sleep(sleep_time)
                        continue
                    raise last_exception from e
                except RuntimeWarning:
                    raise
            if last_exception:
                raise last_exception

        return wrapper

    return decorator


class TidalDownloader:
    FFMPEG_BIN = Path("ffmpeg.exe")  # Se ajustará automáticamente en __init__
    _temp_dir: Path | None

    def __init__(
        self,
        log_callback=print,
        session_data: dict | None = None,
        is_pkce: bool = False,
        download_dir: str | Path | None = None,
    ):
        self.log = log_callback
        self.quality = Quality.hi_res_lossless
        # is_pkce marca la sesión como PKCE (16-bit): tidalapi refresca el token con
        # el cliente PKCE en vez del device-flow (ver Session.token_refresh). Sin esto,
        # una sesión PKCE cargada desde tokens intentaría refrescar con el client_id
        # equivocado y fallaría la autenticación al expirar.
        self.is_pkce = is_pkce
        self.session = self._load_session(session_data)
        # Guards the (set session.audio_quality → get_stream) critical section.
        # The engine/session is a shared singleton used by concurrent worker
        # downloads (max_concurrent_downloads) and API requests, so mutating
        # session.audio_quality is not thread-safe without this lock.
        self._stream_lock = threading.Lock()
        self._temp_dir = None
        self._setup_download_dir(download_dir)
        self._auto_detect_ffmpeg()

    # ---------- Directorio de descargas ----------
    def _setup_download_dir(self, download_dir: str | Path | None) -> None:
        """Elige dónde caen los ficheros descargados.

        Con `download_dir` los ficheros van a una carpeta **persistente** (en
        Docker, el volumen montado). Sin él se usa un temporal, que es lo que
        había siempre: el problema es que ese temporal se borra al evictar el
        motor (30 min sin uso) y al terminar el proceso, así que la música
        desaparecía sin avisar y, mientras existía, engordaba el disco del
        contenedor en vez del volumen — 4,2 GB medidos en una sola sesión de
        pruebas, con la carpeta montada vacía.
        """
        if download_dir:
            path = Path(download_dir)
            path.mkdir(parents=True, exist_ok=True)
            self._temp_dir = path
            self._is_temp_dir = False
            self.log(f"Directorio de descargas: {path}")
            return

        self._temp_dir = Path(tempfile.mkdtemp(prefix="tidal_dl_"))
        self._is_temp_dir = True
        atexit.register(self._cleanup_temp_dir)
        self.log(f"Directorio temporal de descargas: {self._temp_dir}")

    def _cleanup_temp_dir(self):
        """Borra el directorio **solo si es temporal**.

        Con una carpeta persistente esto no debe tocar nada: la evicción de un
        motor ocioso borraría la música ya descargada del usuario (y, si la
        carpeta fuera compartida, la de todos).
        """
        if not getattr(self, "_is_temp_dir", True):
            return
        if self._temp_dir and self._temp_dir.exists():
            shutil.rmtree(self._temp_dir, ignore_errors=True)
            self.log("Directorio temporal eliminado.")

    @property
    def download_folder(self) -> Path:
        assert self._temp_dir is not None, (
            "_setup_download_dir must be called before accessing download_folder"
        )
        return self._temp_dir

    # ---------- Detección automática de ffmpeg ----------
    def _auto_detect_ffmpeg(self):
        # Primero buscar en PATH
        ffmpeg_in_path = shutil.which("ffmpeg") or shutil.which("ffmpeg.exe")
        if ffmpeg_in_path:
            self.FFMPEG_BIN = Path(ffmpeg_in_path)
            self.log(f"ffmpeg encontrado en PATH: {self.FFMPEG_BIN}")
            return

        # Rutas comunes en Windows
        common = [
            Path("C:/ffmpeg/bin/ffmpeg.exe"),
            Path("C:/Program Files/ffmpeg/bin/ffmpeg.exe"),
            Path("C:/ffmpeg/ffmpeg.exe"),
        ]
        for candidate in common:
            if candidate.exists():
                self.FFMPEG_BIN = candidate
                self.log(f"ffmpeg encontrado en: {candidate}")
                return

        self.log("ffmpeg no encontrado. La conversión a FLAC fallará si no se configura el PATH.")

    # ---------- Autenticación ----------
    def _load_session(self, session_data: dict | None) -> Session:
        session = Session()
        if session_data:
            try:
                expiry = datetime.fromisoformat(session_data["expiry_time"])
                session.load_oauth_session(
                    session_data["token_type"],
                    session_data["access_token"],
                    session_data["refresh_token"],
                    expiry,
                    is_pkce=self.is_pkce,
                )
            except Exception as e:
                self.log(f"Error cargando sesión desde memoria: {str(e)}")
        return session

    def get_session_data(self) -> dict | None:
        if self.session and self.session.check_login():
            return {
                "token_type": self.session.token_type,
                "access_token": self.session.access_token,
                "refresh_token": self.session.refresh_token,
                "expiry_time": self.session.expiry_time.isoformat()
                if self.session.expiry_time
                else "",
            }
        return None

    def check_auth(self) -> bool:
        if not self.session:
            return False
        try:
            if self.session.check_login():
                return True
            else:
                if self.session.refresh_token and self.session.token_refresh(
                    self.session.refresh_token
                ):
                    return True
        except requests.exceptions.RequestException:
            return False
        except Exception as e:
            self.log(f"Error verificando estado de sesión: {str(e)}")
        return False

    # ---------- Parseo ----------
    def parse_link(self, link: str) -> tuple[str | None, str | None]:
        if not link or not isinstance(link, str):
            return None, None
        if "track/" in link:
            match = re.search(r"track/(\d+)", link)
            return "track", match.group(1) if match else None
        elif "album/" in link:
            match = re.search(r"album/(\d+)", link)
            return "album", match.group(1) if match else None
        elif "playlist/" in link:
            match = re.search(r"playlist/([0-9a-fA-F\-]+)", link)
            return "playlist", match.group(1) if match else None
        return None, None

    def _sanitize_filename(self, name: str) -> str:
        if not name:
            return "Unknown"
        cleaned = re.sub(r'[\\/*?:"<>|]', "-", name)
        return cleaned.strip()

    def _clean_title_for_search(self, name: str) -> str:
        if not name:
            return ""
        patterns = [
            r"\(feat\..*?\)",
            r"\(ft\..*?\)",
            r"\(featuring.*?\)",
            r"\(with.*?\)",
            r"-\s*Remaster(ed)?.*$",
            r"-\s*\d{4}\s*Remaster.*$",
            r"\(Remaster(ed)?.*?\)",
            r"\(Deluxe.*?\)",
            r"\(Bonus.*?\)",
            r"\(Live.*?\)",
            r"\(Radio Edit\)",
            r"\(Single Version\)",
        ]
        res = name
        for p in patterns:
            res = re.sub(p, "", res, flags=re.IGNORECASE)
        return res.strip()

    # ---------- Letras ----------
    @retry(max_retries=2)
    def _fetch_lyrics(self, artist: str, track_name: str, cancel_event=None) -> tuple[str, str]:
        clean_track = self._clean_title_for_search(track_name)
        headers = {"User-Agent": "Music4All-App/1.0 (Tidal downloader)"}

        def _get(track: str) -> tuple[str, str]:
            # /api/get: match directo. lrclib puede responder lento, así que un
            # timeout generoso + un reintento evita perder la letra por latencia
            # (causa real de que antes quedaran vacías con timeout=5s).
            params = {"artist_name": artist, "track_name": track}
            for attempt in range(2):
                try:
                    r = requests.get(
                        "https://lrclib.net/api/get", params=params, headers=headers, timeout=12
                    )
                    if r.status_code == 404:
                        return "", ""
                    r.raise_for_status()
                    data = r.json()
                    return data.get("syncedLyrics") or "", data.get("plainLyrics") or ""
                except requests.exceptions.RequestException:
                    if attempt == 0:
                        time.sleep(1)
            return "", ""

        def _search() -> tuple[str, str]:
            # /api/search: fuzzy. Útil cuando el título exacto no matchea (remasters,
            # sufijos). Prefiere el primer resultado con letra sincronizada.
            try:
                r = requests.get(
                    "https://lrclib.net/api/search",
                    params={"artist_name": artist, "track_name": clean_track},
                    headers=headers,
                    timeout=12,
                )
                r.raise_for_status()
                results = r.json() or []
                for d in results:
                    if d.get("syncedLyrics"):
                        return d["syncedLyrics"], ""
                for d in results:
                    if d.get("plainLyrics"):
                        return "", d["plainLyrics"]
            except requests.exceptions.RequestException:
                pass
            return "", ""

        for track in dict.fromkeys([clean_track, track_name]):  # dedup, conserva orden
            synced, plain = _get(track)
            if synced:
                return synced, ""
            if plain:
                return "", plain

        return _search()

    def _fetch_genre(self, artist: str, track_name: str, isrc: str = "", cancel_event=None) -> str:
        """Obtiene un género desde MusicBrainz (Tidal no expone género).

        Prioriza ISRC (preciso) → recording; si no, busca recording por
        artista+título; como último recurso usa el género del artista. Devuelve
        el género/tag más votado o "" si no hay match. Best-effort: no debe
        bloquear la descarga si MusicBrainz falla o va lento.
        """
        headers = {"User-Agent": "Music4All/1.0 (Tidal downloader; contact: local)"}
        base = "https://musicbrainz.org/ws/2"

        def _top(obj: dict) -> str:
            for key in ("genres", "tags"):
                items = obj.get(key) or []
                if items:
                    best = max(items, key=lambda g: g.get("count", 0) or 0)
                    name = (best.get("name") or "").strip()
                    if name:
                        return name.title()
            return ""

        def _recording_genre(rid: str) -> str:
            try:
                r = requests.get(
                    f"{base}/recording/{rid}",
                    params={"fmt": "json", "inc": "genres+tags"},
                    headers=headers,
                    timeout=8,
                )
                if r.ok:
                    return _top(r.json())
            except requests.exceptions.RequestException:
                pass
            return ""

        try:
            rid = None
            if isrc:
                r = requests.get(
                    f"{base}/isrc/{isrc}",
                    params={"fmt": "json"},
                    headers=headers,
                    timeout=8,
                )
                if r.ok:
                    recs = r.json().get("recordings") or []
                    if recs:
                        rid = recs[0].get("id")
            if rid is None:
                q = f'recording:"{track_name}" AND artist:"{artist}"'
                r = requests.get(
                    f"{base}/recording",
                    params={"query": q, "fmt": "json", "limit": 1},
                    headers=headers,
                    timeout=8,
                )
                if r.ok:
                    recs = r.json().get("recordings") or []
                    if recs:
                        rid = recs[0].get("id")
            if rid:
                genre = _recording_genre(rid)
                if genre:
                    return genre
            # Fallback: género del artista (suele existir aunque el recording no lo tenga).
            r = requests.get(
                f"{base}/artist",
                params={"query": f'artist:"{artist}"', "fmt": "json", "limit": 1},
                headers=headers,
                timeout=8,
            )
            if r.ok:
                artists = r.json().get("artists") or []
                if artists:
                    aid = artists[0].get("id")
                    ra = requests.get(
                        f"{base}/artist/{aid}",
                        params={"fmt": "json", "inc": "genres+tags"},
                        headers=headers,
                        timeout=8,
                    )
                    if ra.ok:
                        return _top(ra.json())
        except requests.exceptions.RequestException:
            pass
        return ""

    # ---------- Calidad ----------
    def _classify_quality(self, sample_rate: int, bit_depth: int) -> tuple[str, str]:
        if bit_depth <= 16 and sample_rate <= 44100:
            return "HIFI", f"{sample_rate / 1000:g}kHz / {bit_depth}bit"
        if bit_depth == 24 and sample_rate == 44100:
            return "HIFI", "44.1kHz / 24bit"
        if bit_depth >= 24 and sample_rate >= 48000:
            return "MAX", f"{sample_rate / 1000:g}kHz / {bit_depth}bit"
        return "HIFI", f"{sample_rate / 1000:g}kHz / {bit_depth}bit"

    def _format_quality_label(
        self, final_path: Path, s_rate: int, s_bits: int, lossless: bool
    ) -> str:
        """Etiqueta de calidad legible a partir del audio ya en disco.

        Es la etiqueta que se guarda en el historial. Se usa tanto tras descargar como
        cuando el archivo ya existía: antes, ese segundo caso devolvía el literal
        "EXISTE" y el historial mostraba "EXISTE" como si fuera un formato de audio.
        """
        if lossless:
            label = f"{s_rate / 1000:g}kHz / {s_bits}bit"
            if s_bits > 16 or s_rate > 44100:
                label += " (Hi-Res)"
            return label
        return self._aac_quality_label(final_path)

    def _probe_quality_from_manifest(self, track_id: int) -> tuple[str, str]:
        try:
            track = self.session.track(track_id)  # type: ignore[arg-type]  # tidalapi stubs declare str but accepts int
            # Critical section: quality + get_stream must be atomic on the shared session.
            with self._stream_lock:
                self.session.audio_quality = Quality.hi_res_lossless
                stream = track.get_stream()

            if stream.manifest_mime_type == "application/vnd.tidal.bts":
                decoded = base64.b64decode(stream.manifest).decode("utf-8")
                manifest = json.loads(decoded)
                aq = manifest.get("audioQuality", "LOSSLESS").upper()
                if aq in ("HI_RES", "HI_RES_LOSSLESS"):
                    return "MAX", "Hi-Res"
                if aq == "LOSSLESS":
                    return "LOSSLESS", "Lossless"
                return "LOSSLESS", aq

            if hasattr(stream, "audio_quality"):
                aq = str(stream.audio_quality).upper()
                if "HI_RES" in aq or "MASTER" in aq:
                    return "MAX", "Hi-Res"

            return "LOSSLESS", "Lossless"
        except Exception:
            return "LOSSLESS", "Lossless"

    # ---------- Metadatos ----------
    def _serialize_track_summary(self, track) -> dict:
        artist = getattr(track, "artist", None)
        album = getattr(track, "album", None)

        return {
            "id": getattr(track, "id", None),
            "name": getattr(track, "name", getattr(track, "title", "")),
            "title": getattr(track, "name", getattr(track, "title", "")),
            "track_num": getattr(track, "track_num", None),
            "duration": getattr(track, "duration", None),
            "artist": {
                "name": getattr(artist, "name", str(artist) if artist else "Desconocido"),
            },
            "artist_name": getattr(artist, "name", str(artist) if artist else "Desconocido"),
            "album": {
                "id": getattr(album, "id", None),
                "name": getattr(album, "name", ""),
            },
            "album_name": getattr(album, "name", ""),
        }

    def get_metadata(self, link: str) -> dict:
        if not self.check_auth():
            return {"error": "Sin Conexión a Tidal."}

        kind, item_id = self.parse_link(link)
        if not kind or not item_id:
            return {"error": "Enlace no reconocido."}

        try:
            if kind == "track":
                track = self.session.track(item_id)  # type: ignore[arg-type]  # tidalapi stubs declare str but accepts int/str
                if track.album is None:
                    return {"error": "Track sin álbum asociado."}
                album = self.session.album(track.album.id)  # type: ignore[arg-type]  # tidalapi stubs declare str but accepts int
                cover_id = album.cover or ""
                year = str(album.release_date.year) if album.release_date else "Unknown"
                album_artist = album.artist.name if album.artist else "Unknown"
                folder_name = self._sanitize_filename(f"{album_artist} - [{year}] {album.name}")
                badge_title, badge_desc = self._probe_quality_from_manifest(int(item_id))
                track_artist = track.artist.name if track.artist else "Unknown"

                return {
                    "type": "track",
                    "title": track.name,
                    "artist": track_artist,
                    "album": album.name,
                    "thumb_url": f"https://resources.tidal.com/images/{cover_id.replace('-', '/')}/320x320.jpg"
                    if cover_id
                    else None,
                    "hires_url": f"https://resources.tidal.com/images/{cover_id.replace('-', '/')}/1280x1280.jpg"
                    if cover_id
                    else None,
                    "items": [self._serialize_track_summary(track)],
                    "folder": folder_name,
                    "year": year,
                    "quality_badge": badge_title,
                    "quality_desc": badge_desc,
                    "tracks_count": 1,
                    "audio_format": "FLAC",
                }

            elif kind == "album":
                album = self.session.album(item_id)  # type: ignore[arg-type]  # tidalapi stubs declare str but accepts int/str
                tracks = album.tracks()
                cover_id = album.cover or ""
                year = str(album.release_date.year) if album.release_date else "Unknown"
                album_artist = album.artist.name if album.artist else "Unknown"
                folder_name = self._sanitize_filename(f"{album_artist} - [{year}] {album.name}")
                badge_title, badge_desc = self._probe_quality_from_manifest(tracks[0].id)

                return {
                    "type": "album",
                    "title": album.name,
                    "artist": album_artist,
                    "thumb_url": f"https://resources.tidal.com/images/{cover_id.replace('-', '/')}/320x320.jpg"
                    if cover_id
                    else None,
                    "hires_url": f"https://resources.tidal.com/images/{cover_id.replace('-', '/')}/1280x1280.jpg"
                    if cover_id
                    else None,
                    "items": [self._serialize_track_summary(track) for track in tracks],
                    "folder": folder_name,
                    "year": year,
                    "tracks_count": album.num_tracks,
                    "quality_badge": badge_title,
                    "quality_desc": badge_desc,
                    "audio_format": "FLAC",
                }

            elif kind == "playlist":
                playlist = self.session.playlist(item_id)
                tracks = playlist.tracks(limit=None)
                if not tracks:
                    return {"error": "La playlist está vacía o es privada."}

                thumb = None
                hires = None
                if (
                    hasattr(playlist, "picture")
                    and playlist.picture
                    and isinstance(playlist.picture, str)
                ):
                    thumb = f"https://resources.tidal.com/images/{playlist.picture.replace('-', '/')}/320x320.jpg"
                    hires = f"https://resources.tidal.com/images/{playlist.picture.replace('-', '/')}/1280x1280.jpg"

                if not thumb and len(tracks) > 0:
                    try:
                        first = tracks[0]
                        if hasattr(first, "album") and first.album and first.album.cover:
                            thumb = f"https://resources.tidal.com/images/{first.album.cover.replace('-', '/')}/320x320.jpg"
                            hires = f"https://resources.tidal.com/images/{first.album.cover.replace('-', '/')}/1280x1280.jpg"
                    except Exception:
                        pass

                badge_title = "PLAYLIST"
                badge_desc = "MIXED"
                if tracks:
                    bt, bd = self._probe_quality_from_manifest(tracks[0].id)
                    if bt == "MAX":
                        badge_title = "MAX"
                        badge_desc = "MIXED"

                folder_name = self._sanitize_filename(f"Playlist - {playlist.name}")
                return {
                    "type": "playlist",
                    "title": playlist.name,
                    "artist": "Varios Artistas",
                    "thumb_url": thumb,
                    "hires_url": hires,
                    "items": [self._serialize_track_summary(track) for track in tracks],
                    "folder": folder_name,
                    "year": "Playlist",
                    "tracks_count": playlist.num_tracks,
                    "quality_badge": badge_title,
                    "quality_desc": badge_desc,
                    "audio_format": "FLAC",
                }

            return {"error": f"Tipo no soportado: {kind}"}

        except tidalapi.exceptions.AuthenticationError:
            return {"error": "Token expirado. Por favor, vuelve a iniciar sesión en Tidal."}
        except tidalapi.exceptions.ObjectNotFound:
            return {"error": "Elemento no encontrado (Quizás fue borrado o es privado)."}
        except requests.exceptions.ConnectionError:
            return {
                "error": "Error de Red: No se pudo conectar a Tidal. Verifica tu conexión a internet."
            }
        except requests.exceptions.Timeout:
            return {"error": "Error de Red: Tidal tardó demasiado en responder (Timeout)."}
        except Exception as e:
            return {"error": f"Error inesperado: {str(e)}"}

    # ---------- Portada ----------
    @retry(max_retries=2)
    def _download_cover(self, album_obj, output_path: Path, cancel_event=None):
        if output_path.exists():
            return
        cover = getattr(album_obj, "cover", None)
        if not cover:
            return
        base = f"https://resources.tidal.com/images/{cover.replace('-', '/')}"
        # origin.jpg = resolución máxima disponible en Tidal; 1280x1280 como fallback
        # por si un cover no expone origin.
        for cover_url in (f"{base}/origin.jpg", f"{base}/1280x1280.jpg"):
            try:
                r = requests.get(cover_url, timeout=10)
                r.raise_for_status()
                with output_path.open("wb") as f:
                    f.write(r.content)
                return
            except Exception:
                continue

    # ---------- Obtener stream (solo FLAC normal) ----------
    @retry(max_retries=2)
    def _get_stream_url_and_type(self, track_obj, quality: str = "MASTER"):
        try:
            # Critical section: set the requested quality on the shared session and
            # fetch the stream atomically (see self._stream_lock in __init__). The
            # heavy byte download happens later in _download_raw_audio, outside the
            # lock, so concurrent downloads still parallelize the transfer.
            with self._stream_lock:
                self.session.audio_quality = resolve_quality(quality)
                stream = track_obj.get_stream()
        except Exception as e:
            return None, None, f"Error obteniendo stream: {str(e)}"

        if stream.manifest_mime_type == "application/dash+xml":
            xml = (
                base64.b64decode(stream.manifest).decode("utf-8")
                if not stream.manifest.startswith("<")
                else stream.manifest
            )
            try:
                url_init = html.unescape(re.search(r'initialization="([^"]+)"', xml).group(1))
                url_media = html.unescape(re.search(r'media="([^"]+)"', xml).group(1))
                return url_init, url_media, "DASH"
            except Exception as e:
                return None, None, f"Error DASH: {str(e)}"

        elif stream.manifest_mime_type == "application/vnd.tidal.bts":
            decoded = base64.b64decode(stream.manifest).decode("utf-8")
            js = json.loads(decoded)
            urls = js.get("urls")
            if not urls:
                return None, None, "Manifiesto BTS sin URLs."
            return None, urls[0], "DIRECT"

        return None, None, "Formato desconocido"

    # ---------- Fuente de streaming (reproducción sin descargar) ----------
    def get_stream_source(self, track_obj, quality: str = "NORMAL") -> tuple[str | None, str]:
        """Resuelve una URL de audio directamente reproducible para un track.

        Para NORMAL/AAC (`low_320k`) Tidal devuelve un manifiesto BTS → una única
        URL directa MP4/AAC (método "DIRECT"), consumible por un `<audio>` del
        navegador. Las calidades lossless resuelven a DASH segmentado (método
        "DASH"), que un `<audio>` plano no puede reproducir — los callers deben
        usar solo DIRECT. Devuelve `(url, method)` o `(None, method_o_error)`.
        Reutiliza `_get_stream_url_and_type`, que toma `_stream_lock` para
        mutar `session.audio_quality` de forma atómica.
        """
        _url_init, url_media, method = self._get_stream_url_and_type(track_obj, quality)
        if method in ("DIRECT", "DASH"):
            return url_media, method
        return None, method

    # ---------- Descarga raw ----------
    @retry(max_retries=2)
    def _download_raw_audio(
        self,
        url_init,
        url_media,
        method,
        output_path: Path,
        progress_callback=None,
        cancel_event=None,
    ):
        try:
            with output_path.open("wb") as f_out:
                if method == "DASH":
                    init_req = requests.get(url_init, timeout=15)
                    init_req.raise_for_status()
                    f_out.write(init_req.content)
                    # NOTA: el manifiesto DASH no expone el número total de segmentos,
                    # así que se descargan hasta encontrar un 404/segmento vacío. El tope
                    # de 300 es una salvaguarda (≈ pistas muy largas) y el progreso usa
                    # una estimación (seg/50) al no conocerse el total real por adelantado.
                    seg = 1
                    dl = 0
                    while seg < 300:
                        if cancel_event and cancel_event.is_set():
                            return False, "Cancelado"
                        url = url_media.replace("$Number$", str(seg))
                        r = requests.get(url, timeout=10)
                        if r.status_code == 404 or len(r.content) < 100:
                            break
                        r.raise_for_status()
                        f_out.write(r.content)
                        dl += len(r.content)
                        seg += 1
                        if progress_callback:
                            # Segundo argumento: bytes acumulados de esta pista. Es lo
                            # que permite calcular la velocidad real; sin él el
                            # medidor de la interfaz marcaba 0.0 MB/s siempre.
                            progress_callback(min(seg / 50.0, 0.99), dl)
                elif method == "DIRECT":
                    response = requests.get(url_media, stream=True, timeout=15)
                    response.raise_for_status()
                    total_length = int(response.headers.get("content-length", 0))
                    dl = 0
                    for chunk in response.iter_content(chunk_size=8192):
                        if cancel_event and cancel_event.is_set():
                            return False, "Cancelado"
                        if chunk:
                            dl += len(chunk)
                            f_out.write(chunk)
                            if progress_callback and total_length > 0:
                                progress_callback(dl / total_length, dl)
            return True, ""
        except requests.exceptions.ConnectionError:
            return False, "Conexión perdida."
        except requests.exceptions.Timeout:
            return False, "Timeout."
        except OSError as e:
            return False, f"Error escritura: {e}"
        except Exception as e:
            return False, f"Error: {e}"

    # ---------- ffmpeg ----------
    # ---------- Finalizar archivo raw a FLAC (solo si es necesario) ----------
    def _finalize_raw_to_flac(self, raw_path: Path, final_path: Path) -> tuple[bool, str]:
        """
        Convierte el archivo raw a FLAC solo si no es ya un FLAC válido.
        Si ya es FLAC, simplemente lo mueve sin transcodificar.
        Retorna (éxito, mensaje_error).
        """
        # Intentar leer como FLAC – mutagen lanzará excepción si no lo es
        try:
            FLAC(str(raw_path))
            # Es un FLAC válido → mover directamente
            raw_path.rename(final_path)
            return True, ""
        except Exception:
            pass

        # No es FLAC → necesitamos ffmpeg
        if not self.FFMPEG_BIN.exists():
            return False, "Falta ffmpeg. Asegúrate de que esté en el PATH."

        cmd = [
            str(self.FFMPEG_BIN),
            "-y",
            "-i",
            str(raw_path),
            "-c:a",
            "flac",
            "-compression_level",
            "5",
            "-loglevel",
            "error",
            str(final_path),
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True, text=True)
            return True, ""
        except subprocess.CalledProcessError as e:
            return False, f"FFMPEG: {e.stderr}"
        except Exception as e:
            return False, f"FFMPEG: {e}"

    def _extract_flac_from_mp4(self, source_path: Path) -> Path:
        """
        Si el archivo descargado es un MP4 que contiene FLAC (caso HI_RES_LOSSLESS),
        extrae el stream sin recodificar y devuelve la ruta del FLAC.
        Si ya es FLAC, lo devuelve sin cambios.
        """
        try:
            FLAC(str(source_path))
            return source_path
        except Exception:
            pass

        if not self.FFMPEG_BIN.exists():
            self.log("ffmpeg no disponible; no se puede extraer FLAC del contenedor.")
            return source_path

        tmp = source_path.with_suffix(".tmp.flac")
        cmd = [str(self.FFMPEG_BIN), "-y", "-i", str(source_path), "-c", "copy", str(tmp)]
        try:
            subprocess.run(cmd, check=True, capture_output=True, text=True)
            tmp.replace(source_path)
            return source_path
        except Exception as e:
            self.log(f"Falló extracción FLAC: {e}")
            return source_path

    # ---------- Info de audio ----------
    def _read_audio_info(self, path: Path) -> tuple[int, int] | None:
        """Devuelve (sample_rate, bits_per_sample) de un FLAC o M4A.

        None si el archivo no es audio legible por mutagen.
        """
        try:
            info = FLAC(str(path)).info
            return info.sample_rate, info.bits_per_sample
        except Exception:
            pass
        try:
            info = MP4(str(path)).info
            bits = int(getattr(info, "bits_per_sample", 0) or 16)
            return info.sample_rate, bits
        except Exception:
            return None

    def _aac_quality_label(self, path: Path) -> str:
        """Etiqueta legible del bitrate para archivos AAC/M4A (tier NORMAL)."""
        try:
            kbps = round(MP4(str(path)).info.bitrate / 1000)
            return f"AAC {kbps}kbps"
        except Exception:
            return "AAC"

    # ---------- Tags ----------
    # ---------- Descarga de un track (FLAC lossless o M4A/AAC según calidad) ----------
    def download_single_track(
        self,
        track_obj,
        folder_name: str = "",
        progress_callback: Callable | None = None,
        cancel_event: threading.Event | None = None,
        quality: str = "MASTER",
    ):
        try:
            folder_path = (
                self.download_folder / folder_name if folder_name else self.download_folder
            )
            folder_path.mkdir(parents=True, exist_ok=True)

            safe_name = self._sanitize_filename(track_obj.name)
            safe_track_num = track_obj.track_num if track_obj.track_num else 1

            # Formato destino según la calidad: FLAC (lossless) o M4A/AAC (NORMAL).
            lossless = is_lossless(quality)
            final_path = folder_path / f"{safe_track_num:02d}. {safe_name}{extension_for(quality)}"

            # Verificar si ya existe
            if final_path.exists():
                info = self._read_audio_info(final_path)
                if info is not None:
                    if progress_callback:
                        progress_callback(1.0)
                    label = self._format_quality_label(final_path, info[0], info[1], lossless)
                    return (True, str(final_path), label, info[0], info[1])

            # Obtener álbum y portada
            album = self.session.album(track_obj.album.id)
            cover_path = folder_path / f"cover_{album.id}.jpg"
            self._download_cover(album, cover_path, cancel_event=cancel_event)

            # Letras
            synced, plain = self._fetch_lyrics(
                track_obj.artist.name, track_obj.name, cancel_event=cancel_event
            )

            # Género (Tidal no lo expone → MusicBrainz, best-effort por ISRC/artista)
            genre = self._fetch_genre(
                track_obj.artist.name,
                track_obj.name,
                isrc=getattr(track_obj, "isrc", "") or "",
                cancel_event=cancel_event,
            )

            # Stream URL (calidad seleccionada)
            url_init, url_media, method = self._get_stream_url_and_type(track_obj, quality)
            if url_init is None and url_media is None:
                return False, f"Stream Error: {method}", "", 0, 0

            # Descarga raw — nombre único (uuid) para evitar colisiones entre jobs
            # concurrentes que descarguen el mismo track_id.
            temp_raw = (
                folder_path / f"temp_{track_obj.id}_{uuid.uuid4().hex[:8]}{extension_for(quality)}"
            )
            ok, err = self._download_raw_audio(
                url_init, url_media, method, temp_raw, progress_callback, cancel_event
            )
            if not ok:
                temp_raw.unlink(missing_ok=True)
                return False, err, "", 0, 0

            # Finalizar según formato
            if lossless:
                # Mover/convertir a FLAC si es necesario, y extraer de contenedor MP4.
                ok, err = self._finalize_raw_to_flac(temp_raw, final_path)
                if not ok:
                    temp_raw.unlink(missing_ok=True)
                    return False, err, "", 0, 0
                final_path = self._extract_flac_from_mp4(final_path)
            else:
                # Lossy (AAC/M4A): mover el raw tal cual, sin transcodificar a FLAC.
                temp_raw.replace(final_path)

            # Construir y aplicar metadatos
            track_meta = build_metadata(
                track=track_obj,
                album=album,
                synced_lyrics=synced,
                plain_lyrics=plain,
                cover_path=cover_path,
                genre=genre,
            )

            info = self._read_audio_info(final_path)
            s_rate, s_bits = info if info is not None else (44100, 16)
            calidad_txt = self._format_quality_label(final_path, s_rate, s_bits, lossless)

            track_meta.comment = f"Tidal Rip | {calidad_txt}"

            try:
                if lossless:
                    apply_flac_metadata(final_path, track_meta)
                else:
                    apply_m4a_metadata(final_path, track_meta)
            except Exception as e:
                self.log(f"Error aplicando metadatos: {e}")
                calidad_txt = "Tags Fallaron"

            # Limpiar temporal
            temp_raw.unlink(missing_ok=True)

            return True, str(final_path), calidad_txt, s_rate, s_bits

        except Exception as e:
            self.log(f"Error crítico en download_single_track: {e}")
            return False, f"Fallo Crítico: {str(e)}", "", 0, 0

    # ---------- ZIP ----------
    def pack_folder_to_zip(self, folder_path: str | Path) -> io.BytesIO | None:
        folder = Path(folder_path)
        audio_files = sorted([*folder.glob("*.flac"), *folder.glob("*.m4a")])
        if not audio_files:
            return None
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_STORED) as zf:
            for f in audio_files:
                zf.write(f, arcname=f.name)
        buffer.seek(0)
        return buffer

    # ---------- Limpieza ----------
    def cleanup_folder(self, folder_absolute: str | Path):
        folder_path = Path(folder_absolute)
        if folder_path.exists():
            for pattern in ("temp_*.flac", "temp_*.m4a"):
                for f in folder_path.glob(pattern):
                    f.unlink(missing_ok=True)

    def cleanup_on_cancel(self, folder_absolute: str | Path):
        self.cleanup_folder(folder_absolute)
