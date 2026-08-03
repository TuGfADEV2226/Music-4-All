FROM node:26-alpine AS base

RUN npm install -g pnpm

WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["pnpm", "dev"]

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `rewrites()` de next.config.mjs se evalúa durante `next build` y su resultado se
# hornea en routes-manifest.json, así que BACKEND_URL tiene que estar definida
# AQUÍ: pasarla como variable de entorno al contenedor ya no cambia nada. El
# default apunta al servicio del compose, nunca a localhost (dentro del
# contenedor no hay ningún backend escuchando ahí).
ARG BACKEND_URL=http://backend:8000
ENV BACKEND_URL=$BACKEND_URL
RUN pnpm build

FROM base AS production
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
