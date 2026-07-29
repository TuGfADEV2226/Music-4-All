<div align="center">

# Music 4 All

**Descargador de música de Tidal, multiusuario y auto-alojado, con una interfaz web "tienda de discos neón".**

Inicia sesión con tu propia cuenta de Tidal, busca álbumes y canciones, elige la calidad de audio (hasta Hi-Res 24-bit), encola descargas y sigue el progreso en tiempo real. Instalable como PWA.

![License](https://img.shields.io/badge/license-MIT-22c55e)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0ea5e9?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-instalable-a855f7)

</div>

---

> [!IMPORTANT]
> Herramienta **no oficial**, sin afiliación con Tidal. Solo da acceso al contenido que **tu propia suscripción** ya te permite, para uso personal. Consulta los [Términos](frontend/src/app/legal/terms/page.tsx), la [política de Copyright/DMCA](frontend/src/app/legal/copyright/page.tsx) y el [Disclaimer](frontend/src/app/legal/disclaimer/page.tsx).

## Características

- **Login con Tidal (OAuth Device Flow)** — sin contraseñas propias; Tidal es el único proveedor de identidad.
- **Multiusuario y seguro** — sesión de app cifrada en Redis, tokens por usuario, historial y cuotas aislados por cuenta, rate limiting y anti-abuso.
- **Búsqueda tipo Tidal/Spotify** — mejor coincidencia, secciones por tipo y recomendaciones, con caché para proteger el `client_id` compartido.
- **Selección de calidad** — de AAC a FLAC Hi-Res 24-bit; el **16-bit lossless** se habilita conectando una sesión Hi-Fi (PKCE).
- **Progreso en tiempo real** — cola de descargas con WebSocket, pausa/cancelación/reintento e historial.
- **Reproductor integrado** — streaming, cola y controles del sistema (Media Session).
- **PWA** — instalable, app-shell offline y notificaciones push "descarga lista".
- **Observabilidad** — Prometheus, Grafana, Loki y OpenTelemetry.

## Stack

| Área | Tecnologías |
|---|---|
| Backend | FastAPI · Python 3.11 · AsyncIO · SQLAlchemy 2 + Alembic · tidalapi · [uv](https://docs.astral.sh/uv/) |
| Persistencia | PostgreSQL (historial/auditoría) · Redis/Valkey (sesión, cola, pub/sub) |
| Frontend | Next.js 14 (App Router) · React 18 · TypeScript 5.5 · Zustand · TanStack Query · Tailwind · Framer Motion · [pnpm](https://pnpm.io/) |
| Infraestructura | Docker + Compose · Nginx |
| Observabilidad | Prometheus · Grafana · Loki · Promtail · OpenTelemetry |

## Estructura del proyecto

```
music-4-all/
├── backend/           # API FastAPI (modular por dominio) + worker de descargas
├── frontend/          # Next.js 14 (Feature-Sliced Design)
├── infrastructure/    # Nginx, Prometheus, Grafana, Loki, Promtail
├── docs/              # Arquitectura, desarrollo, operaciones, auditorías, PWA, legal
├── tools/             # Utilidades manuales de análisis/validación
└── docker-compose.yml
```

## Puesta en marcha

### Entorno completo con Docker (recomendado)

```bash
docker compose up --build
```

| Servicio | URL |
|---|---|
| Aplicación | http://localhost |
| API | http://localhost:8000 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 |

> Redis/Valkey es **siempre** obligatorio (sesión OAuth, cola de jobs, pub/sub). En Docker el esquema lo aplica Alembic automáticamente vía el entrypoint del backend.

### Desarrollo local (sin Docker)

**Backend** — usa SQLite por defecto; requiere Redis/Valkey en marcha:

```bash
cd backend
uv sync
uv run alembic upgrade head          # crea/actualiza el esquema
uv run uvicorn app.main:app --reload # http://localhost:8000
```

**Frontend:**

```bash
cd frontend
pnpm install
pnpm dev                             # http://localhost:3000
```

## Configuración

Copia [`.env.example`](.env.example) a `.env` en la raíz y ajústalo. Variables clave:

- `SESSION_ENCRYPTION_KEY` — cifra los tokens de Tidal en reposo (obligatoria en producción).
- `DATABASE_URL` / `REDIS_URL` — Postgres y Valkey (los pone Docker Compose).
- `ENVIRONMENT=production` — activa comprobaciones de arranque estrictas (cookie segura, CORS, clave de cifrado).
- `VAPID_*` — claves de Web Push; vacías = notificaciones push desactivadas. Ver [`docs/PWA.md`](docs/PWA.md).

## Calidad de código

```bash
# Backend (desde backend/)
uv run ruff check .        # lint
uv run ruff format --check .
uv run pytest -q           # tests

# Frontend (desde frontend/)
pnpm lint
pnpm build                 # type-check + compilación
pnpm test                  # unit (Vitest)
pnpm test:e2e              # end-to-end (Playwright)
```

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Arquitectura backend/frontend/infra, diagramas y endpoints |
| [`docs/development.md`](docs/development.md) | Cómo levantar cada componente, tests, lint, migraciones |
| [`docs/PWA.md`](docs/PWA.md) | PWA: instalación, Media Session y notificaciones push |
| [`docs/operations/`](docs/operations/) | Runbook, respuesta a incidentes, monitoreo, DR |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | Problemas reales encontrados y sus soluciones |

## Licencia

[MIT](LICENSE) — © 2026 TuGfA.

El software se licencia MIT; no cubre ni autoriza el uso del contenido descargado, que se rige por tu suscripción de Tidal y las licencias de sus titulares.
