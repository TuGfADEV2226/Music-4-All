# Performance Audit — Music 4 All

> **AVISO — Auditoría histórica.** Es una foto de un estado anterior del repo; varios hallazgos pueden estar ya resueltos. Verificar cada uno contra el estado actual antes de accionar. Estado vigente en `docs/roadmap.md`.

> **PERF-02 MEDIDO Y ACOTADO (2026-08-02, Fase 0.F).** Ya no es una estimación:
> es **1.00 conexión de Redis por WebSocket**, y con el pool único que había
> **~100 usuarios con la pestaña abierta dejaban toda la API en 500**
> (`MaxConnectionsError`; redis-py 8 bajó el pool por defecto a 100). Resuelto con
> pool separado para Pub/Sub, aforo explícito (`ws_max_connections`, rechazo con
> 1013) y pool de comandos bloqueante. El fan-out compartido sigue diferido, pero
> el coste está medido y el fallo ya no es catastrófico. También se corrigió **una
> llamada a Tidal por cada petición autenticada** (p50 agregado 130 ms → 6 ms).
> Cifras y objetivos de capacidad en [`docs/PRE_LAUNCH_REVIEW.md`](../PRE_LAUNCH_REVIEW.md) §0.F.
> Con esto, el "**no existen datos de carga real**" del párrafo de abajo **ya no aplica**.

> **Estado de vigencia — revisado 2026-07-02.** Documento puntual (~jun-2026). Sus hallazgos son de backend/infra (OTel síncrono, Redis Pub/Sub por WS, sin límites Docker, sin caché, load testing incompleto) que **no se modificaron** desde la redacción; se consideran **vigentes**. Nota: **PERF-06** cita `AudioWaves` como componente futuro — aún **no existe** en el código. Verificar contra el código actual antes de accionar.

> Auditoría de rendimiento de backend (FastAPI/asyncio, PostgreSQL, Redis/Valkey, WebSockets, descargas/ffmpeg) y frontend (Next.js). Basada en lectura directa de código y configuración. **No existen datos de carga real** (sin métricas de producción, sin resultados documentados de `locustfile.py`) — todas las cifras de capacidad se marcan explícitamente como `[Estimación]` o `[NO VERIFICABLE]`. Complementa [`docs/operations/MONITORING.md`](../operations/MONITORING.md) (qué se mide hoy) y [`TECHNICAL_AUDIT.md`](TECHNICAL_AUDIT.md).

---

# Executive Summary

El sistema está dimensionado para **un usuario / pocas descargas concurrentes** (`max_concurrent_downloads=3` por defecto), uso al que responde adecuadamente según el diseño del código. Los riesgos de rendimiento identificados son principalmente **riesgos de escalado** (qué pasa si aumenta el número de usuarios/conexiones WebSocket/descargas concurrentes), no problemas de rendimiento observados hoy:

1. **OpenTelemetry usa `SimpleSpanProcessor(ConsoleSpanExporter)`** — exportación síncrona de cada span a stdout en una app async; bajo carga real esto introduce latencia por request (PERF-01).
2. **Cada conexión WebSocket (`/ws/downloads` y `/ws/progress/{job_id}`) abre su propia suscripción Redis Pub/Sub dedicada**, sin límite de pool — con muchas conexiones concurrentes esto es la vía más directa a agotamiento de conexiones Redis/Valkey (PERF-02).
3. **Sin límites de recursos (CPU/memoria) en ningún contenedor** de `docker-compose.yml`, combinado con re-encodes FLAC de ffmpeg que son intensivos en CPU — riesgo de que descargas concurrentes saturen el host sin contención (PERF-03).
4. **Sin caché de búsqueda/metadata** — cada búsqueda repetida re-consulta la API de Tidal (PERF-04).
5. **El test de carga existente (`locustfile.py`) no ejercita descargas ni WebSocket** — los caminos más costosos del sistema son `[NO VERIFICABLE]` bajo carga (PERF-05).

Ninguno de estos hallazgos es Critical en el uso actual documentado (autohospedado, pocos usuarios). Se clasifican como High aquellos que **se agravan rápidamente** si crece el número de usuarios/conexiones concurrentes sin cambios de configuración.

---

# Estado Actual

| Componente | Configuración actual | Fuente |
|---|---|---|
| Middleware FastAPI | SlowAPI → GZip (min_size=1000) → CORS → Prometheus Instrumentator → OTel (FastAPIInstrumentor) | `backend/app/main.py` |
| OTel exporter | `SimpleSpanProcessor(ConsoleSpanExporter())` — síncrono, solo FastAPI instrumentado | `backend/app/main.py:48-51,134-135` |
| DB engine | `create_async_engine` (asyncpg), sin `pool_size`/`max_overflow`/`pool_pre_ping` explícitos → defaults SQLAlchemy (5+10) | `backend/app/core/database.py:7-11` |
| Modelos/índices | `DownloadRecord` (idx en `downloaded_at`, `job_id`), `AuditLog` (idx en `event`, `created_at`) | `backend/app/core/models.py`, `alembic/versions/001_initial_tables.py` |
| Redis/Valkey client | `aioredis.from_url(decode_responses=True)`, sin `max_connections` | `backend/app/core/redis_client.py:18-19` |
| Cola de descargas | Lista Redis FIFO (`LPUSH`/`BRPOP timeout=2`) | `redis_client.py:9,63-74` |
| Pub/Sub progreso | Doble publicación: canal por-job (legacy) + canal unificado `music4all:progress:all` (v2) | `redis_client.py:11,13,92-98` |
| Concurrencia de descargas | `asyncio.Semaphore(max_concurrent_downloads)`, default **3** | `backend/app/core/worker.py:46-47`, `config.py:18` |
| ffmpeg | `subprocess.run` bloqueante dentro de `asyncio.to_thread` — FLAC re-encode (`-compression_level 5`) o stream-copy (`-c copy`) según formato fuente | `backend/app/core/tidal.py:511,515,541,544` |
| WebSocket `/ws/downloads` | 1 conexión Redis Pub/Sub dedicada por cliente WS + heartbeat 35s | `backend/app/modules/download/ws.py:78-182` |
| WebSocket `/ws/progress/{job_id}` (legacy) | 1 Pub/Sub por conexión, polling `get_message` cada 1s | `ws.py:29-72` |
| Frontend build | Sin `images.unoptimized`, sin bundle analyzer, sin `next/dynamic` | `frontend/next.config.mjs`, grep en `frontend/src` |
| Caché de búsqueda/metadata | Ninguna (`asyncio.to_thread` directo a Tidal por cada request) | `search/service.py`, `metadata/service.py` |
| Límites de recursos Docker | Ninguno (`deploy.resources` ausente en todos los servicios) | `docker-compose.yml` |
| Load testing | `tests/load/locustfile.py` — solo `/health`, `/auth/status`, `/metrics`, `/metadata/search`, `/history`, `/history/stats` | `backend/tests/load/locustfile.py` |

---

# Hallazgos

## PERF-01 — Exportador OpenTelemetry síncrono (`SimpleSpanProcessor` + `ConsoleSpanExporter`)

- **Descripción**: `backend/app/main.py:48-51` configura `TracerProvider().add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))`, y `FastAPIInstrumentor.instrument_app(app)` (línea 134-135) instrumenta cada request. `SimpleSpanProcessor` exporta **de forma síncrona y bloqueante** en el mismo hilo que procesa la request — `ConsoleSpanExporter` escribe a stdout por cada span.
- **Evidencia**: research PERFORMANCE_AUDIT punto 1.
- **Impacto técnico**: cada request HTTP genera al menos un span, y cada span genera una escritura síncrona a stdout. En un servidor `uvicorn` con event loop asyncio, una operación de I/O síncrona bloqueante en el hilo del loop **retrasa el procesamiento de otras requests concurrentes** durante esa escritura. Bajo tráfico bajo (uso actual, autohospedado) el impacto es imperceptible; bajo tráfico alto, esto se convierte en un cuello de botella de latencia y además infla los logs de contenedor (ya recolectados por Promtail — ver `MONITORING.md`).
- **Impacto de negocio**: hoy ninguno perceptible. Si el volumen de requests crece (más usuarios, polling de WS más frecuente), la latencia p95/p99 de la API se vería afectada de forma difusa y difícil de diagnosticar (porque las trazas mismas son la causa).
- **Recomendación**: (1) **a corto plazo**, considerar deshabilitar OTel tracing en producción si no se consume (`ConsoleSpanExporter` no tiene valor operativo real — ver `MONITORING.md`), o (2) **a medio plazo**, sustituir por `BatchSpanProcessor` (exporta de forma asíncrona/por lotes) con un exportador OTLP real hacia un collector (Tempo/Jaeger), lo cual también resuelve el gap operativo documentado en `docs/roadmap.md` §2.6.
- **Esfuerzo estimado**: XS (deshabilitar) / M (BatchSpanProcessor + collector OTLP).
- **Prioridad**: P2.
- **Severidad**: **High** (bajo carga creciente; **Low** en el uso actual).

## PERF-02 — Conexión Redis Pub/Sub dedicada por cliente WebSocket, sin límite de pool

- **Descripción**: cada conexión a `/ws/downloads` abre su propio `redis.pubsub()` suscrito a `music4all:progress:all` (`download/ws.py:105-106`) y ejecuta una tarea `relay_redis()` dedicada (`:112-140`). `/ws/progress/{job_id}` (legacy) hace lo mismo por job, con polling `get_message` cada 1s (`:48-55`). El cliente Redis (`aioredis.from_url(decode_responses=True)`, `redis_client.py:18-19`) **no define `max_connections`** — el pool por defecto de `redis-py` async es efectivamente ilimitado.
- **Evidencia**: research PERFORMANCE_AUDIT punto 6.
- **Impacto técnico**: cada pestaña/cliente del frontend que mantiene `DownloadPanel` montado (que es **siempre**, por el singleton WS — ver CLAUDE.md §8) consume al menos una conexión Redis adicional para Pub/Sub, más la conexión HTTP normal del request-response. Con N usuarios/pestañas simultáneas, el número de conexiones a Valkey crece linealmente con N, sin tope configurado ni en el cliente ni en el servidor Valkey (`valkey.conf` por defecto permite hasta `maxclients 10000`, pero esto no se ha confirmado — `[NO VERIFICABLE]`).
- **Impacto de negocio**: para el caso de uso actual (pocos usuarios/pestañas) esto no es un problema. Es el **principal riesgo de escalado** identificado en esta auditoría para WebSockets — si Music 4 All se usa desde múltiples dispositivos/pestañas simultáneamente de forma habitual, este patrón es el primer límite que se alcanzaría.
- **Recomendación**: (1) **a corto plazo**, documentar el límite implícito y monitorizar `valkey-cli info clients` (connected_clients) — añadir como métrica en `MONITORING.md`; (2) **a medio plazo**, si el número de conexiones WS concurrentes crece, considerar un único Pub/Sub subscriber compartido a nivel de proceso backend que haga fan-out en memoria a las conexiones WS activas (en lugar de 1 Pub/Sub por WS) — reduce conexiones Redis de O(N) a O(1) por proceso backend.
- **Esfuerzo estimado**: XS (monitorización) / L (fan-out compartido, refactor no trivial).
- **Prioridad**: P2 (monitorizar ahora), P3 (refactor solo si se observa el límite en métricas).
- **Severidad**: **High** (riesgo de escalado) / **Low** (uso actual).

## PERF-03 — Sin límites de recursos en contenedores + ffmpeg intensivo en CPU

- **Descripción**: `docker-compose.yml` no define `deploy.resources.limits`/`reservations` para ningún servicio. `_finalize_raw_to_flac` (`backend/app/core/tidal.py:511,515`) re-encodea a FLAC con `-c:a flac -compression_level 5` cuando la fuente no es ya FLAC — operación CPU-bound. `_extract_flac_from_mp4` (`:541,544`) usa `-c copy` (stream-copy, barato) para contenedores MP4 de HI_RES_LOSSLESS.
- **Evidencia**: research PERFORMANCE_AUDIT puntos 5 y 9.
- **Impacto técnico**: con `max_concurrent_downloads=3` (default), hasta 3 procesos `ffmpeg` de re-encode FLAC pueden ejecutarse simultáneamente, cada uno consumiendo un núcleo de CPU de forma sostenida durante la duración de la conversión. Sin límites de recursos, esto puede competir por CPU con `postgres`, `valkey`, y el propio `backend` (event loop), afectando la latencia de la API y del WebSocket durante descargas activas.
- **Impacto de negocio**: en un host con recursos limitados (p. ej. un VPS pequeño), 3 descargas simultáneas con re-encode podrían degradar la respuesta de la UI durante varios minutos.
- **Recomendación**: (1) establecer `deploy.resources.limits.cpus`/`memory` para `backend` (acotando el impacto de ffmpeg), `postgres` y `valkey` — valores iniciales conservadores basados en el hardware del host objetivo, ajustables; (2) considerar si `max_concurrent_downloads=3` es apropiado para el hardware típico de despliegue, documentándolo como parámetro de tuning en `docs/development.md`/`RUNBOOK.md`.
- **Esfuerzo estimado**: S (límites en compose) / XS (documentación de tuning).
- **Prioridad**: P2.
- **Severidad**: **High** (riesgo de saturación del host sin contención) / **Medium** (probabilidad real en uso típico).

## PERF-04 — Sin caché de búsqueda/metadata

- **Descripción**: `search/service.py` y `metadata/service.py` llaman `asyncio.to_thread(self._repo.search/...)` directamente a la API de Tidal en cada request, sin `lru_cache`/`cachetools`/caché Redis. Grep de `lru_cache`/`cachetools`/`@cache` en `backend/` → 0 resultados.
- **Evidencia**: research PERFORMANCE_AUDIT punto 10.
- **Impacto técnico**: búsquedas repetidas (incluyendo el propio `locustfile.py`, que repite las mismas dos queries) generan llamadas redundantes a la API externa de Tidal, cada una ocupando un hilo del thread-pool de `asyncio.to_thread` (tamaño por defecto ~`min(32, os.cpu_count()+4)` en Python) durante la latencia de red a Tidal.
- **Impacto de negocio**: latencia innecesaria en búsquedas populares/repetidas; mayor exposición a rate-limiting del lado de Tidal si el volumen de búsquedas crece.
- **Recomendación**: añadir una caché de corta duración (TTL 60-300s) para resultados de `search`/`metadata` — Redis (ya disponible) es la opción natural dado que el TTL nativo de Redis simplifica la invalidación, o `cachetools.TTLCache` en memoria si se prefiere simplicidad para instancia única.
- **Esfuerzo estimado**: S–M.
- **Prioridad**: P2.
- **Severidad**: **Medium**.

## PERF-05 — Load testing no cubre descargas ni WebSocket

- **Descripción**: `backend/tests/load/locustfile.py` define `AnonymousUser` (`/health`, `/auth/status`, `/metrics`) y `AuthenticatedUser` (`/metadata/search` ×2 queries, `/history`, `/history/stats`, `/auth/status`), con ejemplo documentado `-u 20 -r 5 --run-time 60s`. **No** ejercita `/download`, `/downloads` (jobs), ni `/ws/downloads`/`/ws/progress/{job_id}`.
- **Evidencia**: research PERFORMANCE_AUDIT punto 8. Sin resultados de ejecución documentados en `docs/`.
- **Impacto técnico**: los componentes con mayor riesgo identificado en este audit (PERF-01, PERF-02, PERF-03) son precisamente los que el test de carga existente **no mide**. No hay datos empíricos sobre el comportamiento del sistema bajo descargas concurrentes o múltiples conexiones WS.
- **Impacto de negocio**: cualquier afirmación sobre "cuántos usuarios/descargas concurrentes soporta el sistema" es **[NO VERIFICABLE]** hasta que se ejecute un test de carga que cubra estos caminos.
- **Recomendación**: extender `locustfile.py` con: (a) un escenario que encole descargas (`POST /downloads` con un álbum pequeño/track de prueba) y mida tiempos de cola/finalización bajo `max_concurrent_downloads` variable; (b) un escenario WebSocket (Locust soporta WS via `websocket-client` o plugins) que abra N conexiones a `/ws/downloads` y mida conexiones Redis resultantes (correlacionando con `valkey-cli info clients`).
- **Esfuerzo estimado**: M.
- **Prioridad**: P2.
- **Severidad**: **Medium**.

## PERF-06 — Frontend: sin code-splitting para dependencias pesadas

- **Descripción**: `frontend/package.json` incluye `framer-motion@^11.3.0` (animaciones, usado extensamente y con más uso planeado por `IMPLEMENTATION_PLAN.md`), `@tanstack/react-query@^5.51.0` (+ devtools), `zustand@^4.5.0`. Grep de `next/dynamic` en `frontend/src` → 0 resultados — ningún componente usa carga diferida.
- **Evidencia**: research PERFORMANCE_AUDIT punto 7.
- **Impacto técnico**: el bundle de JS inicial incluye Framer Motion y React Query Devtools (si no están excluidos del build de producción — `[REQUIERE VALIDACIÓN]`) en el bundle principal, incrementando el tiempo de carga inicial (TTI/FCP), especialmente relevante para el rediseño visual planeado (`IMPLEMENTATION_PLAN.md`), que añade más animaciones Framer Motion.
- **Impacto de negocio**: percepción de "app lenta al cargar" en conexiones lentas; relevante para la fase de rediseño visual.
- **Recomendación**: (1) confirmar que `@tanstack/react-query-devtools` se excluye del bundle de producción (patrón estándar: import condicional por `NODE_ENV`); (2) al implementar las fases de `IMPLEMENTATION_PLAN.md` que añaden componentes decorativos pesados (NeonParticles, AudioWaves, etc.), usar `next/dynamic` con `ssr: false` para cargarlos solo en cliente y de forma diferida.
- **Esfuerzo estimado**: S (validar devtools) / incremental (aplicar `next/dynamic` durante el rediseño, no requiere PR separada).
- **Prioridad**: P2 (validar devtools), P3 (code-splitting, ligado al rediseño).
- **Severidad**: **Medium**.

## PERF-07 — `Base.metadata.create_all` en cada arranque

- **Descripción**: `backend/app/main.py:58-59` ejecuta `await conn.run_sync(Base.metadata.create_all)` en el lifespan de **cada** arranque del backend, además de las migraciones Alembic manuales.
- **Evidencia**: research PERFORMANCE_AUDIT punto 1; research OPERATIONS punto 12.
- **Impacto técnico**: `create_all` es idempotente (no recrea tablas existentes) pero realiza introspección del esquema en cada arranque — coste adicional de unos pocos round-trips a Postgres en el arranque, no en operación estable.
- **Impacto de negocio**: ninguno perceptible — solo afecta tiempo de arranque del contenedor `backend` (relevante para `docker compose up` y reinicios, no para operación en caliente).
- **Recomendación**: aceptable como está para el modelo actual (Alembic + `create_all` como red de seguridad). Si se desea eliminar la duplicidad, condicionar `create_all` a un flag de entorno (`AUTO_CREATE_TABLES`, default true en dev, false en producción donde Alembic es la única fuente de verdad) — **no urgente**.
- **Esfuerzo estimado**: XS.
- **Prioridad**: P3.
- **Severidad**: **Low**.

## PERF-08 — Pool de conexiones DB por defecto + sesión nueva por track descargado

- **Descripción**: el engine async no fija `pool_size`/`max_overflow`/`pool_pre_ping` (defaults SQLAlchemy: pool_size=5, max_overflow=10, sin pre-ping). El worker abre una `AsyncSessionLocal()` nueva por cada track completado dentro de un job (`worker.py:188-196`).
- **Evidencia**: research PERFORMANCE_AUDIT puntos 2 y 4.
- **Impacto técnico**: con `max_concurrent_downloads=3` y álbumes de muchas pistas, en el peor caso 3 jobs concurrentes podrían abrir sesiones DB de forma intercalada — bien dentro del límite de 15 (5+10) conexiones por defecto. Sin `pool_pre_ping`, una conexión que Postgres cierre por inactividad (timeout) podría producir un error en el primer uso tras un periodo idle (típicamente recuperable con retry, pero no confirmado si el código tiene retry — `[REQUIERE VALIDACIÓN]`).
- **Impacto de negocio**: bajo en el uso actual; el riesgo de `pool_pre_ping` se manifestaría como errores intermitentes tras periodos de inactividad prolongados (p. ej. tras "dormir" el contenedor de Postgres).
- **Recomendación**: añadir `pool_pre_ping=True` al engine (cambio de una línea, elimina una clase entera de errores intermitentes). Mantener el pool por defecto salvo que las métricas (`MONITORING.md`) muestren agotamiento.
- **Esfuerzo estimado**: XS.
- **Prioridad**: P2.
- **Severidad**: **Low**.

---

# Riesgos

| ID | Riesgo | Severidad (escalado) | Severidad (uso actual) |
|---|---|---|---|
| PERF-02 | Conexión Redis Pub/Sub por WS, sin límite de pool | High | Low |
| PERF-03 | Sin límites de recursos + ffmpeg CPU-intensivo | High | Medium |
| PERF-01 | OTel `SimpleSpanProcessor`/`ConsoleSpanExporter` síncrono | High | Low |
| PERF-04 | Sin caché de búsqueda/metadata | Medium | Medium |
| PERF-05 | Load test no cubre descargas/WS — capacidad real [NO VERIFICABLE] | Medium | Medium |
| PERF-06 | Sin code-splitting frontend para deps pesadas | Medium | Low |
| PERF-08 | Sin `pool_pre_ping` en engine DB | Low | Low |
| PERF-07 | `create_all` en cada arranque | Low | Low |

---

# Recomendaciones

1. **Quick wins de bajo esfuerzo y riesgo** (PERF-08 `pool_pre_ping`, PERF-01 deshabilitar/ajustar OTel, PERF-06 validar exclusión de devtools) — agrupables en una sola PR de "performance hardening" de bajo riesgo.
2. **PERF-05 (extender load testing)** debería preceder a cualquier decisión de cambiar `max_concurrent_downloads` o añadir límites de recursos (PERF-03) — sin datos, los valores serían `[Estimación]` no informada.
3. **PERF-02** no requiere acción inmediata pero debe **monitorizarse** (`MONITORING.md` — añadir métrica de conexiones Valkey) como indicador temprano de cuándo abordar el refactor de fan-out compartido.
4. **PERF-04 (caché de búsqueda)** es la mejora con mejor relación esfuerzo/beneficio para la experiencia de usuario percibida (búsquedas repetidas más rápidas).

---

# Roadmap

| Fase | Alcance | Hallazgos | Esfuerzo |
|---|---|---|---|
| **Fase 1 — Quick wins** | `pool_pre_ping=True`, validar exclusión de React Query Devtools en build de prod, ajustar/deshabilitar `ConsoleSpanExporter` | PERF-08, PERF-06, PERF-01 | S |
| **Fase 2 — Caché de búsqueda/metadata** | TTL cache (Redis o `cachetools`) para `search`/`metadata` | PERF-04 | S–M |
| **Fase 3 — Extender load testing** | Escenarios de descarga (`/downloads`) y WebSocket (`/ws/downloads`) en `locustfile.py`; ejecutar y documentar resultados | PERF-05 | M |
| **Fase 4 — Límites de recursos** | `deploy.resources` en `docker-compose.yml`, informado por resultados de Fase 3 | PERF-03 | S |
| **Fase 5 — Monitorización de conexiones Redis** | Métrica/alerta de `connected_clients` en Valkey (ver `MONITORING.md`) | PERF-02 | S |
| **Fase 6 — Tracing real (si se decide)** | `BatchSpanProcessor` + collector OTLP | PERF-01 (alternativa a deshabilitar) | M |

---

# Prioridades

| Prioridad | Hallazgos |
|---|---|
| **P2** | PERF-01, PERF-02 (monitorizar), PERF-03, PERF-04, PERF-05, PERF-06 (validar), PERF-08 |
| **P3** | PERF-06 (code-splitting completo), PERF-07 |

*(Nota: ningún hallazgo de este audit alcanza P0/P1 — todos son mejoras de eficiencia o mitigación de riesgos de escalado, no defectos funcionales activos.)*

---

# Próximos Pasos

1. Ejecutar Fase 1 (quick wins) — bajo riesgo, mejora inmediata de robustez (`pool_pre_ping`).
2. Diseñar y ejecutar Fase 3 (extender `locustfile.py`) **antes** de tomar decisiones sobre `max_concurrent_downloads` o límites de recursos — convierte `[Estimación]`/`[NO VERIFICABLE]` en datos reales.
3. Añadir la métrica de conexiones Valkey a `docs/operations/MONITORING.md` como parte de la Fase 5, para tener visibilidad continua de PERF-02.
4. Revisar PERF-04 (caché) como parte de cualquier trabajo futuro en `search`/`metadata`.
