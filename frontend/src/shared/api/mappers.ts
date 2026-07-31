import type { Album, AudioQuality, AudioMode } from '@/entities/album'
import type { Track } from '@/entities/track'
import type { DownloadProgress } from '@/entities/download-job'
import type { AlbumDTO, TrackDTO, WsProgressPayload } from '@/shared/types/api.types'

const TIDAL_IMAGE_BASE = 'https://resources.tidal.com/images'

// Tidal CDN solo sirve tamaños pre-renderizados: 80, 160, 320, 640, 750, 1080, 1280.
// 480 NO existe y CloudFront responde 403. 640 es el óptimo para miniaturas de la grid.
// NOTA: independiente de la carátula embebida en la descarga (backend, 1280x1280).
const TIDAL_COVER_SIZES = [80, 160, 320, 640, 750, 1080, 1280] as const

export function coverIdToUrl(coverId: string, size = 640): string {
  return `${TIDAL_IMAGE_BASE}/${coverId.replace(/-/g, '/')}/${size}x${size}.jpg`
}

/**
 * Reescribe una carátula de Tidal a otra de las tallas que sirve su CDN.
 *
 * Los mappers generan todo a 640x640 porque la misma URL se reutiliza en
 * contextos muy distintos (grid, reproductor, Media Session), pero una fila de
 * resultados la pinta a 40 px: son ~50 KB por fila para mostrar una miniatura, y
 * una búsqueda trae 50 filas. Pedirle al CDN la talla adecuada no nos cuesta nada
 * (las imágenes no pasan por nuestro servidor) y ahorra megas al usuario.
 *
 * `size` es el ancho en píxeles reales que se quiere descargar, no el tamaño CSS:
 * se pasa con holgura para pantallas de alta densidad. Si la URL no tiene el
 * patrón de talla de Tidal se devuelve intacta.
 */
export function coverAtSize(url: string, size: number): string {
  const snapped = TIDAL_COVER_SIZES.find((s) => s >= size) ?? TIDAL_COVER_SIZES[TIDAL_COVER_SIZES.length - 1]
  return url.replace(/\/\d+x\d+\.jpg$/, `/${snapped}x${snapped}.jpg`)
}

export function mapAlbumDTO(dto: AlbumDTO): Album {
  return {
    id: dto.id,
    title: dto.title,
    artist: dto.artist,
    coverUrl: dto.cover ? coverIdToUrl(dto.cover) : '',
    releaseYear: new Date(dto.release_date).getFullYear(),
    releaseDate: dto.release_date,
    numberOfTracks: dto.number_of_tracks,
    durationSeconds: dto.duration,
    audioQuality: dto.audio_quality as AudioQuality,
    audioModes: (dto.audio_modes ?? []) as AudioMode[],
    upc: dto.upc ?? '',
    label: dto.label ?? { id: '', name: '' },
    genre: dto.genre ?? null,
    type: dto.type ?? null,
  }
}

export function mapTrackDTO(
  dto: TrackDTO,
  albumCtx: Pick<Album, 'id' | 'title' | 'coverUrl'>
): Track {
  return {
    id: dto.id,
    title: dto.title,
    trackNumber: dto.track_number,
    durationSeconds: dto.duration,
    audioQuality: dto.audio_quality as AudioQuality,
    audioModes: (dto.audio_modes ?? []) as AudioMode[],
    isrc: dto.isrc ?? '',
    artist: dto.artist,
    albumId: albumCtx.id,
    albumTitle: albumCtx.title,
    coverUrl: albumCtx.coverUrl,
  }
}

export function mapWsMessageToProgress(msg: WsProgressPayload): DownloadProgress {
  return {
    jobId: msg.job_id,
    currentTrackFilename: msg.current_track_filename,
    completedTracks: msg.completed_tracks,
    totalTracks: msg.total_tracks,
    progressPercent: msg.progress_percent,
    speedMbps: msg.speed_mbps,
    etaSeconds: msg.eta_seconds,
  }
}
