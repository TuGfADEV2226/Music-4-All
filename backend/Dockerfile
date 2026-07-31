FROM python:3.14-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Instalar uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Dependencias (cacheadas si pyproject.toml/uv.lock no cambian) ──────────
FROM base AS deps
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# ── Desarrollo (hot-reload + deps dev) ─────────────────────────────────────
FROM deps AS development
RUN uv sync --frozen
COPY . .
EXPOSE 8000
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
# El entrypoint aplica las migraciones antes de ejecutar el CMD (ver docker-entrypoint.sh).
# Se invoca con `sh` explícito: el bind-mount de ./backend en desarrollo sustituye
# /app y con él cualquier bit de ejecución que pusiera la imagen.
ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ── Producción ──────────────────────────────────────────────────────────────
FROM deps AS production
COPY . .
EXPOSE 8000
ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
# 1 worker a propósito: JobControlRegistry y pending_oauth* son estado in-memory por
# proceso. Con >1 worker, pausar/cancelar un job solo funcionaría si la petición cae en
# el worker que lo ejecuta, y el device-auth pendiente podría perderse entre procesos.
# Subir a varios workers requiere externalizar ese estado a Redis (fase Multi-réplica).
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
