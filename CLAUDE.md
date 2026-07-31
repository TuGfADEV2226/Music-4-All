# CLAUDE.md

Guía operativa para trabajar en el repositorio **Music 4 All**. Este documento resume lo esencial; el detalle vive en `docs/`.

## 1. Descripción del proyecto

**Music 4 All** es un descargador de música desde Tidal con interfaz web moderna. Permite autenticarse vía OAuth Device Authorization de Tidal, buscar álbumes/tracks, encolar descargas (con selección de calidad de audio), seguir el progreso en tiempo real (WebSocket) y consultar el historial de descargas.

El proyecto sigue un **Plan Maestro de migración por fases** hacia una arquitectura profesional: frontend reescrito en Next.js, backend FastAPI modular, persistencia en PostgreSQL + Redis/Valkey, infraestructura Docker con observabilidad (Prometheus/Grafana/Loki) y CI/CD en GitHub Actions. El backend "core" de descarga ya es estable; el trabajo actual se centra en profesionalizar plataforma, no en rehacer la lógica de descarga.

## 2. Stack tecnológico

| Área | Stack |
|---|---|
| Backend | FastAPI, Python 3.11, AsyncIO, SQLAlchemy 2 + Alembic, tidalapi, slowapi (rate limiting), gestor **uv** |
| Persistencia | PostgreSQL (historial/auditoría), Redis/Valkey (sesión OAuth, cola de jobs, pub/sub de progreso) |
| Frontend | Next.js 14 (App Router), React 18, TypeScript 5.5, Zustand 4.5 (+ persist), TanStack Query 5.51, Axios, Tailwind 3.4, Framer Motion 11.3, gestor **pnpm** |
| Infraestructura | Docker + Docker Compose, Nginx (reverse proxy + headers de seguridad) |
| Observabilidad | Prometheus, Grafana, Loki, Promtail, OpenTelemetry |
| CI/CD | GitHub Actions (lint, build, tests, bandit, docker build) |

## 3. Reglas obligatorias para modificaciones

1. **No romper el backend funcional existente.** El núcleo de descarga (Tidal → archivo → historial) es estable; cualquier cambio debe preservar ese flujo.
2. **Migrar por fases, manteniendo compatibilidad.** El backend mantiene routers **legacy** (`/auth`, `/download`, `/history`, `/ws/progress/{job_id}`) junto a routers **v2** (`/session/*`, `/search/*`, `/downloads`, `/ws/downloads`). No eliminar el legacy sin confirmación explícita — sigue en uso.
3. **Frontend: respetar Feature-Sliced Design (FSD).** Dirección de dependencias estricta: `app/ → widgets/ → features/ → entities/ → shared/`. Cada `features/*` expone su API vía `index.ts`.
4. **Frontend ya migrado a FSD (sin restos pre-FSD).** El código legacy pre-FSD ya fue eliminado: **no** recrear `src/store/`, `src/components/`, `src/hooks/`, `src/lib/` en la raíz de `src/`, ni carpetas de ruta sin agrupar. Las utilidades compartidas viven en `src/shared/` (`api`, `config`, `hooks`, `lib`, `types`, `ui`); los stores Zustand en `src/features/*/model/*.store.ts`; las rutas bajo `src/app/(app)/` y `src/app/(auth)/`.
5. **Seguridad desde el diseño**: secretos solo en variables de entorno (nunca hardcodeados), tokens OAuth en Redis con TTL, CORS estricto (no `allow_origins=["*"]` en producción), validar/sanitizar toda URL entrante (ver `_ensure_https` en `session/service.py`).
6. **Calidad de código obligatoria antes de mergear**: `ruff check` + `ruff format --check` (backend), `next lint` + `pnpm build` (frontend). Ver `docs/development.md` para comandos exactos y el estado actual de deuda técnica en `docs/roadmap.md`.
7. **No tocar `_old/`** — es la versión previa monolítica, mantenida solo como referencia.
8. **Antes de implementar cambios visuales/UX grandes**, analizar compatibilidad y complejidad contra la arquitectura actual antes de escribir código (no asumir que un rediseño es un "reemplazo total"). Ver `docs/frontend/FRONTEND_VISION.md`, `docs/frontend/DESIGN_SYSTEM_VISION.md` y `docs/frontend/IMPLEMENTATION_PLAN.md` para la visión, el sistema de diseño y el roadmap por fases ya analizados del rediseño "tienda de discos neón".

## 4. Arquitectura general (resumen)

- **Backend** (`backend/app/`): FastAPI con arquitectura modular por dominio (`modules/{auth,session,search,metadata,download,jobs,history}`, cada uno con `router → service → repository → schemas`). Infra transversal en `core/` (DB, Redis, Tidal, worker, métricas, seguridad). Worker en background consume una cola Redis (FIFO) y publica progreso vía Pub/Sub, retransmitido por `/ws/downloads`.
- **Frontend** (`frontend/src/`): Next.js App Router con grupos de rutas `(app)` (autenticado: dashboard, downloads, history, library, settings) y `(auth)` (login). Estado con Zustand (`auth.store`, `downloads.store`, `player.store`, `settings.store`) + TanStack Query para estado de servidor.
- **Infraestructura**: `docker-compose.yml` orquesta `postgres`, `valkey`, `backend`, `frontend`, `nginx`, `prometheus`, `grafana`, `loki`, `promtail`.

Detalle completo, diagramas y endpoints: **`docs/architecture.md`**.

## 5. Flujo de trabajo Git

- `main` es la rama base estable. Trabajar en ramas con prefijo según tipo de cambio: `feat/...`, `fix/...`, `chore/...`.
- Mantener la rama actualizada con `main`:
  ```bash
  git fetch origin
  git merge origin/main   # o: git rebase origin/main
  ```
- Mensajes de commit en formato **Conventional Commits**: `tipo(alcance): descripción` (`feat`, `fix`, `chore`, `docs`, etc.), en español o inglés según el commit previo en esa área.
- Los merges a `main` se han hecho preferentemente con **fast-forward** (`git merge --ff-only`).
- Commits con asistencia de Claude Code incluyen `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- No usar `--no-verify`, `--force` ni `git reset --hard` salvo instrucción explícita del usuario.

## 6. Comandos frecuentes

```bash
# Backend (desde backend/)
uv sync                                    # instalar dependencias
uv run alembic upgrade head                # crear/actualizar el esquema (la app ya no lo hace)
uv run uvicorn app.main:app --reload       # levantar API (http://localhost:8000)
uv run pytest -q                           # todos los tests
uv run pytest tests/test_ws_downloads.py -v  # un archivo
uv run pytest -k "nombre" -v               # tests que coincidan con la expresión
uv run ruff check .                        # lint
uv run ruff format --check .               # formato

# Frontend (desde frontend/)
pnpm install
pnpm dev                                   # http://localhost:3000
pnpm lint
pnpm build                                 # type-check + compilación
pnpm test                                  # unit tests (Vitest)
pnpm test:e2e                              # end-to-end (Playwright)

# Entorno completo
docker compose up --build
```

> **Dev local sin Docker:** el backend usa **SQLite** por defecto (`database_url = "sqlite+aiosqlite:///./dev.db"` en `app/config.py`); PostgreSQL solo se activa al pasar `DATABASE_URL` (Docker Compose lo hace). **Redis/Valkey sí es requerido siempre** (sesión OAuth, cola de jobs, Pub/Sub de progreso).

> **El esquema lo crea solo Alembic.** La app ya no llama a `create_all` al arrancar (no altera tablas existentes → las bases desplegadas se quedaban sin las columnas nuevas). En Docker lo aplica `backend/docker-entrypoint.sh`; en local hay que ejecutar `alembic upgrade head`. Si tocas `app/core/models.py`, **escribe su migración**: `tests/test_migrations_match_models.py` compara ambos esquemas y falla si divergen. Ver `docs/development.md` §7.

Detalle de cada comando, migraciones Alembic y convenciones: **`docs/development.md`**.

## 7. Referencias

- **`docs/architecture.md`** — arquitectura backend/frontend/devops, observabilidad, CI/CD, dependencias críticas, diagramas Mermaid.
- **`docs/development.md`** — cómo levantar cada componente, pruebas, lint, migraciones, convenciones de código.
- **`docs/troubleshooting.md`** — problemas reales encontrados (Docker+uv+venv, certifi, OAuth device flow, WebSocket, Valkey) con causa raíz y solución aplicada.
- **`docs/e2e-validation.md`** — checklist de validación end-to-end del sistema completo.
- **`docs/roadmap.md`** — pendientes, deuda técnica, mejoras futuras y riesgos conocidos.
- **`docs/frontend/DESIGN_SYSTEM_VISION.md`** — fuente de verdad del sistema visual (paleta, tipografía, animaciones, accesibilidad, performance).
- **`docs/frontend/FRONTEND_VISION.md`** — visión creativa del rediseño "tienda de discos neón nocturna" (Login y Dashboard).
- **`docs/frontend/IMPLEMENTATION_PLAN.md`** — roadmap por fases del rediseño visual, con riesgos técnicos identificados (WS singleton, persistencia, a11y, etc.).

- **`docs/PRE_LAUNCH_REVIEW.md`** — resultado de la revisión pre-lanzamiento (Fase 0): qué se arregló, qué se decidió no hacer y por qué, con las cifras medidas. **Es la lectura que evita reauditar lo que ya está cerrado**; las auditorías de abajo son históricas.

### Auditorías (`docs/audits/`)

- **`docs/audits/TECHNICAL_AUDIT.md`** — deuda técnica (TD-01 a TD-14): código huérfano, tests fallando, configuración no bloqueante en CI, rutas/navegación rotas, etc.
- **`docs/audits/ARCHITECTURE_AUDIT.md`** — violaciones FSD, estado en memoria (no apto para múltiples réplicas), god-dependency `core/tidal.py`, duplicación OAuth legacy/v2 (AR-01 a AR-08).
- **`docs/audits/SECURITY_AUDIT.md`** — postura de seguridad real (SEC-01 a SEC-09): CORS, rate limiting, credenciales hardcodeadas, CSP, dependencias sin escaneo.
- **`docs/audits/PERFORMANCE_AUDIT.md`** — cuellos de botella y riesgos de capacidad (PERF-01 a PERF-08): OTel síncrono, WS sin límite de conexiones, sin límites de recursos Docker.
- **`docs/audits/UX_AUDIT.md`** — estado real de UX/accesibilidad vs `FRONTEND_VISION.md` (UX-01 a UX-10): ruta `/downloads` inexistente, sin navegación móvil, PlayerBar decorativo.

### Calidad y QA (`docs/qa/`)

- **`docs/qa/QA_STRATEGY.md`** — objetivos de calidad, KPIs, niveles de testing, política de cobertura, roles, DoR/DoD/Release Readiness (QA-01 a QA-07).
- **`docs/qa/TEST_PLAN.md`** — matriz de testing por módulo (backend/frontend), Testing Pyramid, plan de adopción Vitest/Playwright/Contract Testing (TP-01 a TP-07).
- **`docs/qa/E2E_VALIDATION.md`** — checklist empresarial por escenario de negocio (OAuth, búsqueda, descarga track/álbum/ZIP, historial, WS, cancelación, reintento, reconexión, expiración), Smoke Tests y Regression Tests (E2E-01 a E2E-06). Complementa `docs/e2e-validation.md` (checklist técnica de `docker compose up`).
- **`docs/qa/QUALITY_GATES.md`** — criterios obligatorios de Merge/Release/Production/Rollback Gates (QG-01 a QG-24).

### Operaciones (`docs/operations/`)

- **`docs/operations/RUNBOOK.md`** — operación diaria: levantar el sistema, verificar salud, logs/métricas, reiniciar/restaurar servicios, comandos frecuentes (RB-01 a RB-06).
- **`docs/operations/INCIDENT_RESPONSE.md`** — severidades P1-P4 y árboles de decisión para backend/frontend/Postgres/Valkey caídos, WS roto, OAuth roto, descargas fallando (IR-01 a IR-04).
- **`docs/operations/MONITORING.md`** — estado real de Prometheus/Grafana/Loki/Promtail/OTel, métricas disponibles/faltantes, dashboards y alertas recomendadas (MON-01 a MON-07).
- **`docs/operations/SLO_SLI_SLA.md`** — SLIs medibles con métricas actuales, SLOs propuestos (sin datos históricos que los validen) y aclaración de que no aplica SLA (SLO-01 a SLO-04).
- **`docs/operations/DISASTER_RECOVERY.md`** — escenarios de pérdida de PostgreSQL/Valkey/VPS/Docker/observabilidad/descargas, RTO/RPO y estrategia de backup (DR-01 a DR-05; **sin backup de `./downloads` es el hallazgo P1**).

## 8. Restricciones arquitectónicas críticas

### WebSocket Singleton

- DownloadPanel monta useDownloadSocket().
- No desmontar DownloadPanel durante navegación.
- No envolver DownloadPanel en AnimatePresence con key dinámica.
- No reinicializar conexiones WebSocket durante cambios de ruta.

### Persistencia de estado

- Zustand stores deben mantenerse persistentes.
- No reinicializar auth.store.
- No reinicializar downloads.store.
- No reinicializar player.store.

### OAuth Device Flow

- Mantener compatibilidad con Tidal Device Authorization Flow.
- verification_uri y verification_uri_complete deben normalizarse mediante _ensure_https().
- Nunca asumir que Tidal devolverá URLs con esquema.
- Mantener compatibilidad con endpoints legacy y v2.

### Docker / uv

- Nunca montar el .venv de Windows dentro de contenedores Linux.
- backend_venv es obligatorio.
- UV_LINK_MODE=copy debe mantenerse.

### Accesibilidad

- Respetar prefers-reduced-motion.
- Mantener aria-live.
- Mantener focus-visible.
- Mantener roles ARIA existentes.

### Performance

- Las animaciones decorativas nunca deben depender de Zustand.
- Las animaciones decorativas nunca deben depender de WebSocket.
- Utilizar transform y opacity como primera opción.