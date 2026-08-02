# Technical Audit — Music 4 All

> **AVISO — Auditoría histórica.** Es una foto de un estado anterior del repo. Varios hallazgos **ya están resueltos** (código huérfano eliminado, tests en verde 176✓/98✓, `ruff` limpio, frontend en FSD sin restos legacy). Verificar cada hallazgo contra el estado actual antes de accionar. Estado vigente en `docs/roadmap.md`.

> **TD-05 CERRADO (2026-08-01).** Era el último hallazgo abierto: `DownloadPanel`,
> `ProgressBar` y los mappers ya tienen tests (Vitest 240), y la suite Playwright
> existe y está verde (36 tests en 3 navegadores). Detalle en
> [`docs/PRE_LAUNCH_REVIEW.md`](../PRE_LAUNCH_REVIEW.md) §0.D. **Los 14 hallazgos
> de este documento están resueltos**; lo de abajo queda como registro histórico.

> **Estado de vigencia — revisado 2026-07-02.** Este documento **ya está actualizado**: refleja 13/14 hallazgos resueltos (queda **TD-05**, testing frontend, parcial). Confirmado contra el código al 2026-07-02: backend `ruff`/`mypy`/`pytest` y frontend `lint`/`build`/`vitest` (**87 tests**) en verde. Nota adicional: `frontend/src/app/middleware.ts` (scaffold no-op duplicado, no ejecutado por Next.js) fue **eliminado el 2026-07-02**; el middleware activo es `frontend/src/middleware.ts`.

> Auditoría de deuda técnica del estado **real** del repositorio en la fecha de este documento. Basada en lectura directa de código, ejecución de `ruff`/`bandit`, resultados de `pytest` documentados en [`docs/roadmap.md`](../roadmap.md) y hallazgos de los audits hermanos: [`ARCHITECTURE_AUDIT.md`](ARCHITECTURE_AUDIT.md), [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md), [`PERFORMANCE_AUDIT.md`](PERFORMANCE_AUDIT.md), [`UX_AUDIT.md`](UX_AUDIT.md).
>
> **Diferenciación de hallazgos**: cada item se marca como **Confirmado** (verificado leyendo código/ejecutando herramientas), **Suposición** (inferencia razonable sin verificación directa) o **Riesgo potencial** (no se materializó pero podría hacerlo).

---

# Executive Summary

El núcleo funcional de Music 4 All (descarga Tidal → archivo → historial, OAuth Device Flow, búsqueda, colas, WebSocket de progreso) está **operativo y probado** (157/159 tests backend pasan, 2 skipped; 87/87 tests frontend pasan). De los 14 hallazgos originales (TD-01 a TD-14), **13 están resueltos**; queda abierto TD-05 (testing frontend — Vitest configurado con 87 tests incluyendo `LoginForm` y `useDownloadSocket`, pendiente `DownloadPanel`/`ProgressBar`/mappers y Playwright E2E).

Histórico (estado al momento de redactar el resumen original, antes de las rondas de resolución):

1. **Calidad de código backend**: 104 errores de `ruff` (87 auto-corregibles) y 49 errores de `mypy` no bloqueaban CI — resuelto (TD-01, TD-02).
2. **Cobertura de pruebas desigual**: backend con suite madura pero 3 tests fallando sin bloquear el pipeline; CI con `bandit`/`pytest` no bloqueantes — resuelto (TD-03, TD-04).
3. **Código muerto significativo**: en frontend (`src/store/useAppStore.ts`, `src/components/`, `src/hooks/`, `src/lib/`, rutas vacías) y en backend (`app/api/v1/`, `app/services/`, `app/schemas/`) — resuelto (TD-08, TD-09).
4. **Funcionalidad incompleta expuesta en UI**: `/library`, `/settings`, `/downloads` placeholders (TD-10), `AlbumDetailPanel` no conectado (TD-11), `PlayerBar` decorativo sin `<audio>` (TD-12, etiquetado "Próximamente").

Ningún hallazgo de este documento fue **Critical** desde la perspectiva de "el sistema no funciona" — el flujo principal siempre funcionó. Las brechas de mayor severidad (**High**) que enmascaraban regresiones (CI no bloqueante ante fallos de tests/bandit) y el código muerto que confundía a nuevos colaboradores (rutas duplicadas legacy/v2, módulos backend huérfanos) ya están cerrados.

---

# Estado Actual

| Área | Estado | Fuente |
|---|---|---|
| Backend core (descarga, OAuth, búsqueda, historial, jobs) | Estable, en uso | `docs/architecture.md`, `docs/roadmap.md` |
| Tests backend | 138/141 pasan (97.9%) | `docs/roadmap.md` §2.3 |
| Lint backend (`ruff check`) | 0 errores (resuelto TD-01) | `docs/roadmap.md` §2.1 |
| Format backend (`ruff format --check`) | 0 errores (resuelto TD-01) | `.github/workflows/ci.yml` |
| Type-check backend (`mypy`) | 0 errores en 69 archivos (resuelto TD-02) | `docs/roadmap.md` §2.2 |
| Bandit (seguridad estática) | 0 hallazgos medium/high; CI bloqueante (resuelto TD-04) | `.github/workflows/ci.yml` |
| Tests frontend | Vitest + RTL — 87 tests (stores, hooks, `LoginForm`, `useDownloadSocket`); falta `DownloadPanel`/`ProgressBar`/mappers y Playwright (TD-05) | `docs/qa/TEST_PLAN.md` |
| Lint/build frontend | `pnpm lint` + `pnpm build` bloqueantes en CI | `.github/workflows/ci.yml` |
| Páginas frontend `/library`, `/settings`, `/downloads` | Implementadas (resuelto TD-10) | `docs/roadmap.md` §1, research UX |
| `AlbumDetailPanel` | Conectado con modal, tracklist y descarga selectiva (resuelto TD-11) | `docs/roadmap.md` §1 |
| Middleware de rutas | Activado en `src/middleware.ts` con cookie `music4all_session` | Hallazgo nuevo |
| `PlayerBar` | Decorativo pero etiquetado "Próximamente" (resuelto TD-12) | `frontend/src/widgets/player-bar/ui/PlayerBar.tsx` |
| Código muerto frontend | Eliminado (resuelto TD-08) | `docs/roadmap.md` §1, research Architecture |
| Código muerto backend (`app/api/v1/`, `app/services/`, `app/schemas/`) | Eliminado, incluido `scripts/test_download.py` huérfano (resuelto TD-09) | `backend/app/` |
| `prefers-reduced-motion` | Hook `useReducedMotion` + regla CSS global (resuelto TD-13) | `frontend/src/shared/hooks/useReducedMotion.ts`, `frontend/src/app/globals.css` |

---

# Hallazgos

## TD-01 — Errores de lint (`ruff check`) no resueltos

- **Estado**: **Resuelto** (`ruff check` y `ruff format --check` pasan con 0 errores; 157 passed, 2 skipped en `pytest tests/ -q`).
- **Descripción (original)**: 104 errores detectados por `ruff check .` en el backend, de los cuales 87 eran auto-corregibles con `ruff check . --fix`. La mayoría eran `F401` (imports sin usar), concentrados en archivos de tests.
- **Resumen de cambios aplicados**:
  - `ruff check . --fix`: 99 errores corregidos automáticamente (imports desordenados, `Union[X, None]` → `X | None`, `collections.abc`, `F401` en test helpers y archivos `api/v1/`).
  - `ruff format .`: 64 archivos reformateados (espaciado, longitud de línea, comillas).
  - Correcciones manuales restantes (12 errores):
    - `core/sanitizer.py`: `raise ValueError(...) from None` (B904).
    - `core/tidal.py`: `raise last_exception from e` (B904).
    - `modules/download/schemas.py`: `DownloadJobStatus(str, Enum)` → `DownloadJobStatus(StrEnum)` (UP042).
    - `schemas/__init__.py` / `services/__init__.py`: imports convertidos a re-exports explícitos (`X as X`) para satisfacer F401 (módulos de compatibilidad legacy).
- **Esfuerzo estimado**: S (1 PR, < 1 día).
- **Prioridad**: P2.
- **Severidad**: **Low**.

## TD-02 — Errores de type-check (`mypy`) fuera de CI

- **Estado**: **Resuelto** (`mypy app --show-error-codes` reporta 0 errores en 69 archivos; 157 passed, 2 skipped en `pytest tests/ -q`).
- **Descripción (original)**: 55 errores de `mypy` en 11 archivos (cifra revisada al ejecutar contra el estado actual del repositorio; el audit previo estimaba 49). Sin job de `mypy` en CI.
- **Resumen de cambios aplicados por archivo**:
  - **`core/security.py`** (2 errores): cuerpos vacíos con `pass` → `return False` / `return ""` (placeholders válidos).
  - **`services/__init__.py`** (3 errores): re-exports de clases que no existen en los stubs legacy → eliminados; el módulo solo retiene el docstring.
  - **`schemas/__init__.py`** (6 errores): ídem — re-exports eliminados.
  - **`core/tidal.py`** (22 errores): múltiples fixes:
    - `_temp_dir: Path | None` añadido como anotación de clase; `download_folder` usa `assert` para narrowing.
    - `get_session_data`: `expiry_time.isoformat()` guardado contra `None`.
    - `parse_link`: return type declarado como `tuple[str | None, str | None]`; cambiado `int(match.group(1))` → `match.group(1)` (str) para coincidir con stubs de tidalapi.
    - `_probe_quality_from_manifest`: `# type: ignore[arg-type]` en llamada a `session.track(int)` (stubs declaran `str` pero tidalapi acepta int en runtime).
    - `get_metadata`: añadido `return {"error": f"Tipo no soportado: {kind}"}` tras la cadena if/elif para eliminar missing-return; guardas de `None` para `track.album`, `album.artist`, `track.artist`.
    - **Bug real corregido**: `tidalapi.exceptions.UserNotLoggedIn` y `tidalapi.exceptions.ItemNotFound` **no existen** — reemplazados por `AuthenticationError` y `ObjectNotFound` (los except anteriores no capturaban nada, dejando que las excepciones reales se propagaran sin manejo).
    - `download_single_track`: parámetros `progress_callback: Callable | None = None` y `cancel_event: threading.Event | None = None`.
    - Renombrado `meta` (variable `FLAC`) → `track_meta` para eliminar conflicto de tipos con el `meta = FLAC(...)` previo en el mismo scope.
  - **`modules/search/repository.py`** (5 errores): `_map_audio_modes` tipado como `Iterable[object] | None`; `raw` anotado como `Any` para acceso a atributos del resultado de `session.search()`; `# type: ignore[arg-type]` en llamadas a `session.album(int)` y `session.track(int)`.
  - **`modules/metadata/repository.py`** (3 errores): `album.name or ""` y `playlist.name or ""` para `str | None`; renombrado `album` → `track_album` en bucle de tracks para evitar shadowing de la variable del bucle de álbumes.
  - **`modules/download/repository.py`** (5 errores): guardas `artist.name if artist else "Unknown"` y `album.name if album else "Unknown"`; `title = X.name or ""`; `# type: ignore[arg-type]` en llamadas a `session.track/album`.
  - **`modules/jobs/service.py`** (2 errores): `# type: ignore[attr-defined]` movido a la línea de `app_state.redis` (estaba en la línea del dict, no suprimía el error real).
  - **`modules/search/router.py`** (5 errores) + **`modules/jobs/router.py`** (2 errores): **bug real corregido** — `tidal_exc.UserNotLoggedIn` → `tidal_exc.AuthenticationError`; `tidal_exc.ItemNotFound` → `tidal_exc.ObjectNotFound`.
  - **`main.py`** (1 error): `# type: ignore[arg-type]` en `add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)` — slowapi handler compatible en runtime con la firma de Starlette pero no con sus stubs.
- **Bug crítico descubierto durante el fix**: `tidalapi.exceptions` no expone `UserNotLoggedIn` ni `ItemNotFound`. Los nombres correctos son `AuthenticationError` y `ObjectNotFound`. Todos los bloques `except` que usaban las names incorrectas no capturaban nada; las excepciones reales de autenticación y recurso-no-encontrado se propagaban sin manejo como `Exception` genérica.
- **Esfuerzo estimado**: M (los errores de excepciones de tidalapi: S; el resto: 2-3 días repartidos).
- **Prioridad**: P1 (para los errores de excepciones de tidalapi), P2 (para el resto).
- **Severidad**: **Medium**.

## TD-03 — Tests backend fallando sin bloquear CI

- **Estado**: **Resuelto** (los 3 tests previamente fallidos ahora pasan; 157 passed, 2 skipped en `uv run pytest tests/ -q`).
- **Descripción (original)**: 3 de 141 tests fallaban: `TestDownloadError::test_invalid_track_id` y `TestDownloadError::test_invalid_job_id` (ambos `AttributeError: 'State' object has no attribute 'engine'` — `app.state.engine`/`app.state.redis` no inicializados, ya que el fixture `api_client` crea `TestClient(app)` sin `with`, por lo que el `lifespan` nunca corre) en `tests/integration/test_download_flow.py`; `TestCleanup::test_pubsub_unsubscribed_on_disconnect` en `tests/test_ws_downloads.py` (race condition confirmada, ver `docs/troubleshooting.md` #4.1). El job `test-backend` usa `pytest tests/ -v --tb=short || echo "No tests found — skipping"`, por lo que **estas 3 fallas no rompían el pipeline**.
- **Causa raíz y fix aplicado**:
  1. `test_invalid_track_id` / `test_invalid_job_id`: fixture incompleto (causa raíz simple, no bug de producción). Se añadió el fixture `api_client_with_state` en `tests/conftest.py`, que inicializa `app.state.engine` (mock con `check_auth() -> True`) y `app.state.redis` (mock con `get` async que devuelve `None`) antes de crear el `TestClient`, y restaura el estado previo de `app.state` al finalizar. Los dos tests ahora usan `api_client_with_state` en lugar de `api_client`.
  2. `test_pubsub_unsubscribed_on_disconnect`: **confirmado bug real de producción** (no solo timing de test) — al desconectar el cliente, `TestClient` cancela la cancel scope de la tarea del handler casi simultáneamente con el mensaje `websocket.disconnect`. Si la cancelación llega primero, `await asyncio.gather(relay, return_exceptions=True)` dentro del bloque `finally` de `websocket_downloads` (`app/modules/download/ws.py`) lanza `CancelledError` (no es un `Exception`, así que no es capturable por los `except Exception` existentes) **antes** de llegar a `pubsub.unsubscribe()`/`pubsub.aclose()`/`websocket.close()` — fuga de la suscripción Redis. Fix: el bloque `finally` ahora envuelve la limpieza completa en `anyio.CancelScope(shield=True)`, garantizando que `relay.cancel()`, `pubsub.unsubscribe()`, `pubsub.aclose()` y `websocket.close()` se ejecuten siempre, incluso si la tarea está siendo cancelada. La cancelación pendiente (si la había) se re-lanza recién al salir del scope protegido, preservando el comportamiento original para el resto del flujo.
- **Evidencia**: `docs/roadmap.md` §2.3; `.github/workflows/ci.yml` línea ~121.
- **Impacto técnico**: el patrón `|| echo` sigue siendo excesivamente permisivo — fue diseñado para el caso "no hay tests", pero también enmascara fallos reales. Cualquier regresión futura en `tests/` pasará CI en verde.
- **Impacto de negocio**: riesgo de desplegar regresiones no detectadas; falsa sensación de seguridad en `main`.
- **Pendiente (fuera de alcance de este fix)**: cambiar `|| echo "No tests found — skipping"` por una condición que solo aplique cuando `pytest` reporta "no tests collected" (código de salida 5), y bloquear en cualquier otro fallo — ahora que los 3 tests pasan, este cambio de CI ya no tiene el riesgo de bloquear merges por fallas preexistentes.
- **Esfuerzo estimado**: ~~S (fixture fix: horas) + M (race condition WS: 1-2 días de investigación)~~ — completado.
- **Prioridad**: **P0** para el pendiente de CI (cambio de `|| echo` a gate bloqueante) — sigue siendo la pieza de mayor apalancamiento pendiente.
- **Severidad**: **High** (mientras el pendiente de CI no se resuelva, la suite no bloquea regresiones futuras).

## TD-04 — `security-backend` (Bandit) no bloqueante en CI

- **Estado**: **Resuelto** (el job ahora falla si Bandit reporta cualquier hallazgo `-ll` medium/high; YAML validado).
- **Descripción (original)**: `uv run bandit -r app/ -ll -f json -o bandit-report.json || true` — el `|| true` garantiza que el job nunca falle, independientemente de los hallazgos. Actualmente Bandit reporta 0 hallazgos medium/high (verificado en esta auditoría), pero el job no protegía contra introducir nuevos hallazgos en el futuro.
- **Resumen del cambio aplicado**: `.github/workflows/ci.yml` — `|| true` → `|| [ $? -eq 0 ]` (el `[ $? -eq 0 ]` solo es verdadero si Bandit ya salió con código 0; al estar dentro de la rama `||`, Bandit habrá fallado, por lo que la condición es siempre falsa y el step propaga el fallo real de Bandit en vez de enmascararlo).
- **Evidencia**: `.github/workflows/ci.yml` línea ~219.
- **Impacto técnico**: ninguno hoy (0 hallazgos); a partir de ahora cualquier hallazgo medium/high futuro bloqueará el merge.
- **Esfuerzo estimado**: ~~S~~ — completado.
- **Prioridad**: P1.
- **Severidad**: ~~**Medium**~~ → resuelto.

## TD-05 — Ausencia total de testing frontend

- **Estado**: **Ampliado, no resuelto del todo** (Vitest + RTL configurado desde hace varias rondas; cobertura pasó de 66 a 87 tests con la incorporación de `LoginForm` y `useDownloadSocket`; `DownloadPanel`, `ProgressBar`, mappers `entities/*` y Playwright E2E siguen pendientes).
- **Descripción (original)**: no existía configuración de Jest, Vitest, React Testing Library ni Playwright. La validación del frontend dependía exclusivamente de `pnpm lint` + `pnpm build` (type-check) + pruebas manuales en navegador.
- **Resumen de cambios aplicados (esta ronda)**:
  - `frontend/tests/unit/components/LoginForm.test.tsx` (11 tests) — cubre la máquina de estados OAuth real del componente (`src/features/auth/ui/LoginForm.tsx`): botón inicial "Connect with Tidal", inicio de `useInitDeviceAuthMutation`, transición a paso 2 (código + URL de verificación) cuando `auth.store` recibe `deviceAuth`, mensaje de error si la mutación falla, indicador de polling, cancelar y volver al paso 1, auto-redirección a `/dashboard` cuando `useDeviceAuthPollingQuery` reporta `status: 'authorized'`, error cuando el código expira, y redirección inmediata si ya hay sesión autenticada. Mockea `useInitDeviceAuthMutation`/`useDeviceAuthPollingQuery` (no axios directamente — el componente no llama a `/api/v1/auth/*`, usa `/session/device-auth` vía TanStack Query) y usa el `useAuthStore` real (igual patrón que `auth.store.test.ts`).
  - `frontend/tests/unit/hooks/useDownloadSocket.test.ts` (10 tests) — mock manual de `WebSocket` (sin dependencia nueva `vitest-websocket-mock`) que permite simular `open`/`message`/`close`. Cubre `job_started`, `progress`, `job_completed`, `job_error` (incluyendo el flag `pendingAuthRecovery` en 401/403 retriable), reconexión automática tras un cierre inesperado, y que deja de reconectar tras desmontar el hook (`destroyed` flag).
  - **Hallazgo durante la implementación**: la reconexión de `useDownloadSocket` (`src/features/downloads/hooks/useDownloadSocket.ts`, método `onclose`) no distingue el código de cierre — reconecta igual ante un cierre limpio (1000) que ante uno inesperado; solo se detiene cuando el hook se desmonta (`disconnect()` → `destroyed = true`). Se documentó con un test que fija ese comportamiento explícitamente (`useDownloadSocket.test.ts`, describe "reconnection") en vez de simularlo como si ya existiera una distinción por código — evaluar si conviene añadir esa distinción en un cambio de producto separado.
  - `frontend/tests/setup.ts`: se añadió `afterEach(cleanup)` de `@testing-library/react` — sin él, los primeros tests de componentes (`render()`) dejaban el DOM de jsdom acumulado entre tests y rompían queries de un solo elemento (`getByRole`/`getByText`) en los tests siguientes. Necesario para cualquier test futuro que use `render()`.
- **Pendiente**: `widgets/download-panel/ui/DownloadPanel.tsx` (render + pause/resume/cancel/clear), `shared/ui/ProgressBar` (variantes), mappers de `entities/*` (coordinado con `ARCHITECTURE_AUDIT.md` AR-01), y Playwright E2E (bloqueado por TP-06 — mock del flujo OAuth real, ver `docs/qa/TEST_PLAN.md`).
- **Verificación**: `pnpm vitest run` (87/87 pasan), `pnpm lint` (0 warnings/errors), `pnpm build` (compila).
- **Evidencia**: `frontend/tests/unit/components/LoginForm.test.tsx`, `frontend/tests/unit/hooks/useDownloadSocket.test.ts`, `frontend/tests/setup.ts`, `docs/qa/TEST_PLAN.md` (matriz de testing frontend actualizada).
- **Esfuerzo estimado (restante)**: M — `DownloadPanel`/`ProgressBar`/mappers (Fase 3b de `TEST_PLAN.md`); L para Playwright E2E (Fase 4, bloqueada por TP-06).
- **Prioridad**: P1.
- **Severidad**: **High** → reducida a **Medium** (la lógica más crítica — máquina de estados OAuth y parsing/reconexión WS — ya tiene red de seguridad automatizada).

## TD-06 — Inconsistencia de imagen Redis/Valkey entre CI y entorno real

- **Estado**: **Resuelto** (`test-backend` ahora usa la misma imagen que `docker-compose.yml`).
- **Descripción (original)**: `docker-compose.yml` usa `valkey/valkey:8-alpine`; `.github/workflows/ci.yml` (`test-backend`) usa `redis:7-alpine`. Compatibles vía protocolo RESP, pero son imágenes distintas en CI vs. desarrollo/producción.
- **Resumen del cambio aplicado**: `.github/workflows/ci.yml`, servicio `redis` del job `test-backend` — imagen `redis:7-alpine` → `valkey/valkey:8-alpine`; healthcheck `redis-cli ping` → `valkey-cli ping`. El nombre del servicio (`redis:`) y la variable `REDIS_URL` se mantienen sin cambios (no afectan el comportamiento, solo son etiquetas).
- **Evidencia**: `.github/workflows/ci.yml` línea ~150.
- **Esfuerzo estimado**: ~~XS~~ — completado.
- **Prioridad**: P3.
- **Severidad**: ~~**Low**~~ → resuelto.

## TD-07 — `SECRET_KEY` declarado pero sin uso (configuración muerta)

- **Estado**: **Resuelto** (línea eliminada de `.env.example`; confirmado sin referencias en `backend/app/`).
- **Descripción (original)**: `.env.example` define `SECRET_KEY=change-me-in-production`, pero **no existe** en `Settings` (`backend/app/config.py`) ni se referencia en ningún módulo de `backend/app/`.
- **Resumen del cambio aplicado**: eliminada la línea `SECRET_KEY=change-me-in-production` (y su comentario `# Security`) de `.env.example`. `grep -ri "SECRET_KEY" backend/` confirmó 0 referencias en código antes de eliminar.
- **Evidencia**: `.env.example`.
- **Esfuerzo estimado**: ~~XS~~ — completado.
- **Prioridad**: P3.
- **Severidad**: ~~**Low**~~ → resuelto.

## TD-08 — Código muerto frontend confirmado

- **Estado**: **Resuelto** (todos los archivos eliminados; `pnpm build` pasa sin errores).
- **Descripción (original)**: `frontend/src/store/useAppStore.ts`, `frontend/src/components/` (`DownloadButton.tsx`, `NeonTitle.tsx`, `ProgressBar.tsx`, `VinylCard.tsx`), `frontend/src/hooks/useWebSocket.ts`, `frontend/src/lib/` (`api.ts`, `theme.ts`), y los directorios vacíos `frontend/src/app/dashboard/`, `frontend/src/app/history/`, `frontend/src/app/login/` — todos confirmados **sin ninguna referencia real** (solo aparecen en comentarios que explícitamente los marcan como prohibidos).
- **Archivos eliminados**:
  - `frontend/src/components/DownloadButton.tsx`
  - `frontend/src/components/NeonTitle.tsx`
  - `frontend/src/components/ProgressBar.tsx`
  - `frontend/src/components/VinylCard.tsx`
  - `frontend/src/components/` (directorio — ahora vacío, eliminado)
  - `frontend/src/store/useAppStore.ts`
  - `frontend/src/store/` (directorio — quedó vacío, eliminado)
  - `frontend/src/hooks/useWebSocket.ts`
  - `frontend/src/hooks/` (directorio — quedó vacío, eliminado)
  - `frontend/src/lib/api.ts`
  - `frontend/src/lib/theme.ts`
  - `frontend/src/lib/` (directorio — quedó vacío, eliminado)
  - `frontend/src/app/dashboard/` (directorio vacío)
  - `frontend/src/app/history/` (directorio vacío)
  - `frontend/src/app/login/` (directorio vacío)
- **Verificación pre-eliminación**: grep exhaustivo confirmó 0 imports reales desde ningún archivo activo fuera de `_old/`; las únicas menciones eran en comentarios JSDoc que explícitamente los marcan como prohibidos.
- **Esfuerzo estimado**: S (1 PR, verificar `pnpm build` tras eliminar).
- **Prioridad**: P2.
- **Severidad**: **Low**.

## TD-09 — Código muerto backend (`app/api/v1/`, `app/services/`, `app/schemas/`) — HALLAZGO NUEVO

- **Estado**: **Resuelto** (los tres directorios eliminados; `ruff check`, `mypy app` y `pytest tests/` siguen en verde: 157 passed, 2 skipped).
- **Descripción (original)**: durante esta auditoría se identificaron tres directorios en `backend/app/` (`api/v1/`, `services/`, `schemas/`) que **no son importados desde ningún módulo activo** (`grep` de `from app.api.v1`, `from app.services`, `from app.schemas` no devuelve resultados fuera de sí mismos). No estaban documentados previamente en `docs/roadmap.md`.
- **Validación previa a la eliminación**: `grep -rn` de `app\.api\.v1`, `app\.services`, `app\.schemas` contra `backend/app/` y `backend/tests/` no devolvió ninguna referencia externa a los tres paquetes; `backend/app/main.py` no los registra como routers. `app/api/` quedó vacío tras eliminar `api/v1/` (solo contenía `__init__.py`) y se eliminó también.
- **Hallazgo adicional durante la validación**: `backend/scripts/test_download.py` (script manual de debug, no referenciado desde CI, `pyproject.toml` ni ningún doc) importaba `app.services.download_manager` y `app.core.tidal.TidalDownloader` para una prueba manual con `session.json` local. Al no estar registrado en ningún flujo activo (ni tests, ni CI, ni documentación), se trató como código muerto incidental ligado a la misma limpieza y se eliminó junto con `app/services/` en vez de dejar el paquete completo solo por este script huérfano.
- **Resumen del cambio aplicado**: eliminados `backend/app/api/` (incluyendo `v1/`), `backend/app/services/`, `backend/app/schemas/` y `backend/scripts/test_download.py`.
- **Evidencia**: research ARCHITECTURE_AUDIT, sección "Bonus".
- **Esfuerzo estimado**: ~~S~~ — completado.
- **Prioridad**: P2.
- **Severidad**: ~~**Low**~~ → resuelto.

## TD-10 — Funcionalidad incompleta expuesta en la navegación (`/library`, `/settings`, `/downloads`)

- **Estado**: **Resuelto** (`/library`, `/settings` y `/downloads` implementadas; `pnpm lint` y `pnpm build` en verde, 66/66 tests frontend pasan).
- **Descripción (original)**: `(app)/library/page.tsx` y `(app)/settings/page.tsx` eran `return null` (placeholders "Phase 3+"). Adicionalmente, **no existía ninguna página `/downloads`** bajo `frontend/src/app/(app)/` — solo existía el widget `DownloadPanel` (overlay). Tanto `Sidebar` (`NAV_ITEMS`) como `AppHeader` (`PAGE_TITLES`) ya referenciaban las tres rutas.
- **Resumen de cambios aplicados**:
  - `(app)/library/page.tsx`: implementada con Card de estado vacío y estilo consistente al Dashboard (icon musical, mensaje orientativo).
  - `(app)/settings/page.tsx`: implementada con dos secciones — `QualitySelector` para `audioQuality` y botones toggles (1–5) para `concurrentDownloads`; valores leídos/escritos en `useSettingsStore` (Zustand persist).
  - `src/middleware.ts` (nuevo, ubicación correcta para Next.js): protección de rutas con cookie `music4all_session`. Redirige rutas protegidas → `/login` si sin sesión; `/login` → `/dashboard` si con sesión. El cookie es sincronizado por `auth.store` en `setAuthenticated`, `setExpired`, `clearSession` y `onRehydrateStorage`.
  - `(app)/downloads/page.tsx`: implementada como vista de página completa de la cola de descargas (antes placeholder mínimo que ya duplicaba el filtrado de `useDownloadPanel`). Usa el mismo `downloads.store` que `DownloadPanel` — **no** vuelve a montar `useDownloadSocket()` porque el widget ya lo hace como singleton en `(app)/layout.tsx`, y la conexión WS persiste independientemente de la ruta activa. Estados cubiertos: vacío (Card con mensaje orientativo), cola con jobs (lista completa agrupada active+paused → queued → error → completed, igual orden que el panel), badges de resumen (`active`, `queued`, `error`, `Offline` cuando `wsConnected` es `false`) y botón "Clear N completed". Controles por job (pause/resume/cancel/check-session) idénticos a los del panel, vía `DownloadJobItem` reutilizado de `widgets/download-panel`.
  - **Eliminación de duplicación** (requisito explícito de no duplicar lógica del panel): se extrajeron dos hooks nuevos en `features/downloads/model/`:
    - `useDownloadQueue()` — centraliza la categorización de la cola (`activeJobs`/`pausedJobs`/`queuedJobs`/`completedJobs`/`errorJobs`, `visibleJobs` ordenado, `glowEligible`, contadores) que antes vivía duplicada entre `useDownloadPanel` (widget) y el placeholder de `/downloads`.
    - `useDownloadActions()` — centraliza `pause`/`resume`/`cancel` (mutaciones PATCH/DELETE `/downloads/{id}`) que antes se repetían como funciones inline idénticas en `DownloadPanel.tsx` y en la página.
    - `widgets/download-panel/model/useDownloadPanel.ts` y `widgets/download-panel/ui/DownloadPanel.tsx` se refactorizaron para consumir ambos hooks en vez de su lógica inline; el comportamiento visual/funcional del overlay no cambió.
- **Verificación**: `pnpm lint` (0 warnings/errors), `pnpm build` (compila, incluye `/downloads` en la tabla de rutas estáticas generadas), `pnpm vitest run` (66/66 tests pasan, sin tests rotos por el refactor de `downloads.store`/hooks).
- **Evidencia**: `frontend/src/app/(app)/downloads/page.tsx`, `frontend/src/features/downloads/model/useDownloadQueue.ts`, `frontend/src/features/downloads/model/useDownloadActions.ts`.
- **Esfuerzo estimado**: ~~M~~ — completado.
- **Prioridad**: P2.
- **Severidad**: ~~**Medium**~~ → resuelto.

## TD-11 — `AlbumDetailPanel` no conectado

- **Estado**: **Resuelto** (`pnpm lint` + `pnpm build` pasan con 0 errores; modal visible en `/dashboard`).
- **Descripción (original)**: `handleOpenAlbum` en `DashboardClient.tsx` solo ejecutaba `console.info` — el panel de detalle de álbum (Phase 6C) no estaba implementado.
- **Resumen de cambios aplicados** (en `DashboardClient.tsx`):
  - Estado: `detailAlbumId: string | null` y `selectedTrackIds: Set<string>`.
  - Query: `useAlbumDetailQuery(detailAlbumId)` de `@/features/album-detail`.
  - Modal (shared/ui `Modal` size `lg`): portada del álbum, artista, año, número de pistas, lista de tracks con checkboxes (número de pista, título, duración `MM:SS`), checkbox "Seleccionar todas" + contador de selección.
  - Acciones de descarga: si todas las pistas seleccionadas → `POST /downloads { albumId }` (un job); si selección parcial → un `POST /downloads { trackId }` por pista seleccionada; botón "Descargar álbum completo" siempre disponible.
  - Todos los jobs se encolán en `useDownloadsStore.enqueue()` con los metadatos correspondientes.
- **Evidencia**: `docs/roadmap.md` §1.
- **Esfuerzo estimado**: ~~M~~ — completado.
- **Prioridad**: P2.
- **Severidad**: **Medium**.

## TD-12 — `PlayerBar` decorativo sin reproducción real — HALLAZGO NUEVO

- **Estado**: **Resuelto** (decisión de producto: Opción A — etiquetar como "Próximamente" sin ocultar el componente).
- **Descripción (original)**: `frontend/src/widgets/player-bar/ui/PlayerBar.tsx` no contiene ningún elemento `<audio>` ni controles de reproducción funcionales. Muestra `currentTrack`, `isPlaying`, `progressSeconds`, `volume` desde `usePlayerStore` como **display puro** (carátula, título, barra de progreso, indicador de volumen), pero no hay forma de iniciar/pausar/buscar reproducción desde la UI.
- **Decisión de producto**: no se oculta el `PlayerBar` (la reproducción in-app sigue siendo un objetivo futuro del roadmap, no se descarta), pero se etiqueta explícitamente como no funcional para evitar expectativas no cumplidas.
- **Resumen del cambio aplicado** (`PlayerBar.tsx`): (1) `aria-label` del contenedor raíz (`role="region"`) cambiado de `"Music player"` a `"Reproductor de audio — próximamente"`; (2) añadido un badge sutil `aria-hidden="true"` con el texto "Próximamente" (visible desde `sm:`, mismo patrón de breakpoints que el resto de la barra) sin alterar la altura fija de 80px (`h-player`) ni el layout existente.
- **Evidencia**: research UX_AUDIT punto 9; `pnpm lint` y `pnpm build` verificados en verde tras el cambio.
- **Esfuerzo estimado**: ~~XS~~ — completado (decisión + etiquetado).
- **Prioridad**: P2.
- **Severidad**: ~~**Medium**~~ → resuelto.

## TD-13 — `prefers-reduced-motion` ausente pese a estar asumido en documentación de diseño

- **Estado**: **Resuelto** (hook + CSS global implementados; `pnpm lint` y `pnpm build` en verde; Fase 0 de `IMPLEMENTATION_PLAN.md` desbloqueada).
- **Descripción (original)**: `FRONTEND_VISION.md` §10 asume `prefers-reduced-motion` como salvaguarda "ya implementada" para justificar animaciones decorativas (parpadeos neón, escaneo láser). Una búsqueda exhaustiva (`grep -i "prefers-reduced-motion"`) en `frontend/` devuelve **cero coincidencias**.
- **Resumen del cambio aplicado**:
  - `frontend/src/shared/hooks/useReducedMotion.ts` (nuevo): hook que lee `window.matchMedia('(prefers-reduced-motion: reduce)')`, expone un `boolean` y se suscribe a cambios con `addEventListener('change')`. Exportado desde `frontend/src/shared/hooks/index.ts`.
  - `frontend/src/app/globals.css`: regla global `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; } }` — cubre automáticamente las animaciones existentes (`animate-pulse-neon`, `animate-shimmer`, `animate-progress-indeterminate`, definidas en `tailwind.config.ts`) sin necesidad de tocar cada componente individualmente.
  - No se añadió `useReducedMotion` a componentes individuales (paso marcado como opcional en el plan): la regla CSS global ya neutraliza las animaciones continuas a nivel de motor de render; el hook queda disponible para casos futuros que necesiten lógica condicional en JS (p. ej. desactivar un efecto Framer Motion completo en vez de solo acortar su duración).
- **Evidencia**: `frontend/src/shared/hooks/useReducedMotion.ts`, `frontend/src/app/globals.css`.
- **Esfuerzo estimado**: ~~S~~ — completado.
- **Prioridad**: P1.
- **Severidad**: ~~**Medium**~~ → resuelto.

## TD-14 — Duplicación de estado OAuth legacy/v2 en memoria

- **Estado**: **Resuelto** (lógica común extraída a un helper compartido; `app.state.pending_oauth` se mantiene porque sigue en uso activo por el endpoint legacy `/auth/*`; tests y type-checking en verde).
- **Descripción (original)**: `app.state.pending_oauth` (legacy, `auth/service.py`) y `app.state.pending_oauth_v2` (v2, `session/service.py`) son dos estructuras de estado en memoria, paralelas, que implementan flujos de device-auth casi idénticos sin abstracción compartida.
- **Resumen del cambio aplicado**:
  - Nuevo `backend/app/core/oauth_helper.py` con tres funciones compartidas, ninguna depende de `app.state`:
    - `ensure_https(url)` — normalización de URL, antes duplicada byte a byte entre `auth/service.py` y `session/service.py`.
    - `start_device_auth(timeout=300)` — crea `tidalapi.Session()`, ejecuta `login_oauth()` en un thread y devuelve `(session, link, future)`. Se devuelve también `link` (no solo `(session, future)` como sugería el enunciado original) porque ambos llamantes necesitan `verification_uri`/`user_code`/`expires_in` del link para construir su respuesta — omitirlo habría obligado a cada módulo a volver a extraer esos campos por su cuenta, reintroduciendo la duplicación que se quería eliminar.
    - `poll_device_auth(session, future)` — encapsula "¿terminó el future? ¿`check_login()` tuvo éxito?" devolviendo `None` (pendiente) / `True` / `False`; antes este patrón estaba duplicado con pequeñas diferencias (legacy llamaba `check_login()` de forma síncrona sin manejo de excepciones; v2 lo envolvía en `asyncio.to_thread` con `try/except`). El helper unifica ambos en la versión más robusta (async + manejo de excepciones).
  - `backend/app/modules/auth/service.py` y `backend/app/modules/session/service.py` refactorizados para importar y usar las tres funciones (con alias `_ensure_https`, `create_oauth_session`, `poll_oauth_future` para evitar colisión de nombres con el método `SessionService.poll_device_auth`). El almacenamiento en `app.state.pending_oauth` / `app.state.pending_oauth_v2` se mantiene en cada módulo, sin cambios de comportamiento observable.
  - `app.state.pending_oauth` **no se eliminó**: sigue siendo leído/escrito activamente por `AuthService` (endpoint legacy `/auth/status`, `/auth/device`, `/auth/logout`, ver `app/modules/auth/router.py`), y `SessionService.start_device_auth` lo sigue poblando explícitamente "para mantener compatibilidad con endpoint legacy /auth/device" — eliminarlo rompería ese endpoint, en contra de la regla de no tocar el legacy sin confirmación explícita.
  - `backend/tests/test_session_service.py`: los dos `patch()` que interceptaban `app.modules.session.service.tidalapi.Session` / `app.modules.session.service.asyncio.to_thread` se actualizaron a `app.core.oauth_helper.tidalapi.Session` / `app.core.oauth_helper.asyncio.to_thread`, ya que la llamada real se movió al helper. El import `from app.modules.session.service import SessionService, _ensure_https` no necesitó cambios — `_ensure_https` sigue siendo un nombre válido en ese módulo vía el alias de import.
- **Verificación**: `ruff check .` (0 errores), `mypy app` (0 errores, 55 archivos), `pytest tests/ -q` (157 passed, 2 skipped — incluye los 14 tests de `test_session_service.py`).
- **Evidencia**: `backend/app/core/oauth_helper.py`, `backend/app/modules/auth/service.py`, `backend/app/modules/session/service.py`.
- **Esfuerzo estimado**: ~~M~~ — completado.
- **Prioridad**: P2.
- **Severidad**: ~~**Medium**~~ → resuelto.

---

# Riesgos

| ID | Riesgo | Severidad | Tipo |
|---|---|---|---|
| TD-03 | CI no bloquea ante fallos reales de pytest (`\|\| echo`) | High | Confirmado |
| TD-05 | Testing frontend parcial — `DownloadPanel`/`ProgressBar`/mappers y Playwright E2E aún sin cobertura | Medium | Confirmado |
| TD-02 | ~~49 errores mypy, excepciones de tidalapi inexistentes~~ | ~~Medium~~ | **Resuelto** |
| TD-04 | ~~Bandit no bloqueante (`\|\| true`)~~ | ~~Medium~~ | **Resuelto** |
| TD-10 | ~~Navegación: `/downloads` sin página~~ | ~~Medium~~ | **Resuelto** |
| TD-11 | ~~`AlbumDetailPanel` no conectado~~ | ~~Medium~~ | **Resuelto** |
| TD-12 | ~~`PlayerBar` decorativo, sin reproducción real~~ | ~~Medium~~ | **Resuelto** |
| TD-13 | ~~`prefers-reduced-motion` ausente, asumido por docs de diseño~~ | ~~Medium~~ | **Resuelto** |
| TD-14 | ~~Duplicación OAuth legacy/v2 en memoria~~ | ~~Medium~~ | **Resuelto** |
| TD-01 | ~~104 errores ruff (87 auto-fix)~~ | ~~Low~~ | **Resuelto** |
| TD-06 | ~~Inconsistencia Redis/Valkey CI vs compose~~ | ~~Low~~ | **Resuelto** |
| TD-07 | ~~`SECRET_KEY` declarado sin uso~~ | ~~Low~~ | **Resuelto** |
| TD-08 | ~~Código muerto frontend~~ | ~~Low~~ | **Resuelto** |
| TD-09 | ~~Código muerto backend (`api/v1`, `services`, `schemas`)~~ | ~~Low~~ | **Resuelto** |

---

# Recomendaciones

1. ~~**Cerrar el gap de CI no bloqueante primero (TD-03, TD-04)**~~ — resuelto.
2. ~~**Resolver la navegación rota (TD-10)**~~ — resuelto: `/downloads` implementada como página completa, reutilizando el store y la lógica del `DownloadPanel` vía `useDownloadQueue`/`useDownloadActions`.
3. **Ampliar testing frontend (TD-05)** — 87 tests pasando (Vitest + RTL), incluyendo `LoginForm` y `useDownloadSocket`; pendiente `DownloadPanel`, `ProgressBar`, mappers `entities/*` (ver `docs/qa/TEST_PLAN.md` Fase 3b) y Playwright E2E.
4. ~~**Limpieza de código muerto (TD-08, TD-09)**~~ — resuelto.
5. **Errores mypy relacionados con `tidalapi` (subset de TD-02)** — resuelto.

---

# Roadmap

| Fase | Alcance | Hallazgos cubiertos | Esfuerzo | Estado |
|---|---|---|---|---|
| **Fase 1 — Higiene de CI** | Corregir fixture de `test_download_flow.py`, investigar race condition WS, ajustar `|| echo`/`|| true` a umbrales reales | TD-03, TD-04 | S–M | Completada |
| **Fase 2 — Limpieza de código muerto** | Eliminar dead code frontend (TD-08) y validar/eliminar backend (TD-09) | TD-08, TD-09 | S | Completada |
| **Fase 3 — Navegación y placeholders** | Decisión sobre `/library`, `/settings`, `/downloads`, `PlayerBar` (ocultar vs. implementar mínimo) | TD-10, TD-12 | S–M | Completada |
| **Fase 4 — Calidad de tipos** | Resolver errores mypy de `tidalapi` (excepciones/opcionales), luego el resto; introducir `mypy` informativo en CI | TD-02 | M | Completada |
| **Fase 5 — Testing frontend** | Configurar Vitest + RTL, primeros tests de stores y `LoginForm`/`DownloadPanel`; Playwright para E2E OAuth/descarga | TD-05 | L | Vitest configurado (87 tests: stores, hooks, `LoginForm`, `useDownloadSocket`); `DownloadPanel`/`ProgressBar`/mappers y Playwright E2E pendientes |
| **Fase 6 — Consolidación OAuth** | Unificar lógica de device-auth legacy/v2 | TD-14 | M | Completada |
| **Fase 7 — Accesibilidad de animaciones** | Implementar `prefers-reduced-motion` global (prerrequisito del rediseño visual, ver `IMPLEMENTATION_PLAN.md` Fase 0) | TD-13 | S | Completada |
| **Fase 8 — Lint final** | Resolver remanente de `ruff` (TD-01), unificar Redis/Valkey en CI (TD-06), limpiar `SECRET_KEY` (TD-07) | TD-01, TD-06, TD-07 | S | Completada |

---

# Prioridades

| Prioridad | Hallazgos |
|---|---|
| **P0** | ~~TD-03~~ |
| **P1** | ~~TD-02 (subset tidalapi)~~, ~~TD-04~~, TD-05 (parcial), ~~TD-13~~ |
| **P2** | ~~TD-01~~, ~~TD-08~~, ~~TD-09~~, ~~TD-10~~, ~~TD-11~~, ~~TD-12~~, ~~TD-14~~ |
| **P3** | ~~TD-06~~, ~~TD-07~~ |

---

# Próximos Pasos

1. ~~Validar el estado actual de `ruff check .` en CI (TD-01)~~ — hecho.
2. ~~Corregir el fixture de `tests/integration/test_download_flow.py`~~ — hecho (TD-03).
3. ~~Confirmar el alcance funcional completo de `/downloads` como página (TD-10)~~ — hecho: implementada como vista completa de la cola, comparte store/lógica con `DownloadPanel` vía `useDownloadQueue`/`useDownloadActions`.
4. ~~Ejecutar `grep -r` exhaustivo de validación para TD-09~~ — hecho (incluyó hallazgo adicional: `scripts/test_download.py` huérfano, eliminado en la misma limpieza).
5. ~~Ampliar cobertura de Vitest (TD-05) a `LoginForm`~~ — hecho (11 tests) junto con `useDownloadSocket` (10 tests). Pendiente: `DownloadPanel`, `ProgressBar`, mappers `entities/*`, y evaluar Playwright para E2E del flujo OAuth + descarga.
