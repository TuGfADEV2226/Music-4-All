# PWA (P1) — instalable + notificaciones de descarga

Music 4 All es una PWA instalable con controles de reproducción del SO y
notificaciones push "descarga lista". Implementado en la rama `feat/pwa-p1`.

## Qué incluye

- **Instalable**: `app/manifest.ts` → `/manifest.webmanifest` (display standalone,
  start_url `/dashboard`, theme `#080B0F`, iconos SVG `any` + `maskable`). `apple-icon.svg`
  + `appleWebApp` metadata para iOS.
- **App-shell offline**: `public/sw.js` (service worker). Conservador para una app
  autenticada: **nunca cachea `/api` ni el WebSocket**, navegaciones network-first con
  `public/offline.html` de reserva, estáticos con hash cache-first.
- **Media Session**: `features/player/lib/useMediaSession` — metadatos y controles del
  SO (pantalla de bloqueo, auriculares, teclas de medios) → play/pause/prev/next.
- **Web Push**: notificación al terminar una descarga, por usuario y dispositivo.

## Activar las notificaciones push

El push está **feature-flagged**: desactivado hasta configurar claves VAPID.

1. Generar el par de claves (privada = base64url DER PKCS8; pública = applicationServerKey):

   ```bash
   cd backend && uv run python -c "from py_vapid import Vapid01; from cryptography.hazmat.primitives import serialization; import base64; v=Vapid01(); v.generate_keys(); b=lambda x: base64.urlsafe_b64encode(x).rstrip(b'=').decode(); print('VAPID_PRIVATE_KEY='+b(v.private_key.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))); print('VAPID_PUBLIC_KEY='+b(v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)))"
   ```

2. Poner `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y un `VAPID_SUBJECT=mailto:tu@dominio`
   reales en el `.env`. Con eso, `GET /push/public-key` devuelve `enabled: true` y en
   Ajustes aparece el toggle "Download notifications".

3. El usuario activa el toggle → el navegador pide permiso, se suscribe vía el service
   worker y guarda la suscripción en `POST /push/subscribe`. Al completar una descarga,
   el worker envía el push a las suscripciones del dueño.

## Límites y notas

- **El service worker solo se registra en producción** (`NODE_ENV=production`). En
  desarrollo (Next dev / HMR en Docker) no se registra, para no servir código viejo —
  por eso el toggle de notificaciones aparece deshabilitado ("Install the app…").
  Verificar con `pnpm build && pnpm start` (o el target de producción de Docker).
- **iOS**: sin auto-prompt de instalación (Add to Home Screen manual); el push solo
  funciona en la PWA **instalada** (iOS 16.4+) y puede desuscribirse solo. iOS ignora
  los iconos del manifest y usa `apple-icon`.
- **Iconos**: hoy son SVG. Un set PNG 192/512 (mejor soporte iOS/tiendas) es pulido
  posterior; requiere generar binarios desde el SVG.
- **P2 (no hecho)**: reproducción offline de descargas (IndexedDB/Cache) — opcional.
- **CSP**: `worker-src 'self'` y `manifest-src 'self'` añadidos en la CSP de nginx.

## Verificación en vivo del push (paso a paso)

El push solo se puede probar **en modo producción**: el service worker no se
registra en `next dev` (para no servir código viejo). El camino más fiable en local
es **backend en Docker + frontend compilado en producción**.

### 0. Requisitos (una sola vez)

- Claves VAPID en el `.env` de la raíz (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT=mailto:...`). Comprobar que el backend las ve:

  ```bash
  cd backend && uv run python -c "from app.config import settings; print('push_enabled =', settings.push_enabled)"
  ```

  Debe imprimir `push_enabled = True`.

### 1. Levantar el backend (con sus dependencias) en Docker

```bash
docker compose up -d backend      # arrastra postgres + valkey; reenvía VAPID_* desde el .env
docker compose ps                 # backend debe quedar (healthy)
```

### 2. Compilar y arrancar el frontend en producción

En una terminal aparte (no se levanta el frontend de Docker, para no chocar con el
`.next` del bind-mount):

```powershell
cd frontend
$env:NEXT_PUBLIC_WS_URL = "ws://localhost:8000"   # progreso en vivo contra el backend Docker
pnpm build
pnpm start                                         # http://localhost:3000 en modo produccion
```

> `localhost` es contexto seguro, así que el service worker **sí** se registra aquí.

### 3. Suscribirse y disparar la notificación

1. Abre **http://localhost:3000** e inicia sesión con Tidal.
2. **Ajustes → "Download notifications"**: activa el toggle → el navegador pide permiso
   → al aceptar, se suscribe (`POST /push/subscribe`). En DevTools → Application →
   Service Workers debe verse `sw.js` **activated**.
3. Encola una **descarga**. Al completarse, el worker envía el push al dueño y aparece
   la **notificación del sistema** "descarga lista".

### Comprobaciones y problemas frecuentes

- **No aparece el toggle** (o dice "Install the app…"): el SW no se registró → estás en
  dev en vez de `build && start`, o el navegador no soporta SW.
- **`/push/public-key` devuelve `enabled: false`**: faltan claves VAPID en el entorno
  del backend (revisar `.env` raíz + reenvío en `docker-compose.yml`).
- **No llega la notificación**: confirma que la descarga completó; mira logs del backend
  (métrica `push_notifications_total`; las suscripciones muertas se purgan con 404/410);
  revisa que concediste el permiso del navegador para el sitio.
- **iOS**: solo funciona en la PWA **instalada** (Add to Home Screen, iOS 16.4+) y la
  suscripción puede caducar sola.

### Alternativa: stack completo en producción (Docker)

Para validar también nginx/observabilidad en prod, hay que correr los targets
`production` de los Dockerfiles (backend `--workers 1`, frontend standalone). Hoy
`docker-compose.yml` usa `target: development`; un override `docker-compose.prod.yml`
que cambie ambos targets (y retire los bind-mounts de código) queda pendiente para el
despliegue público — no es necesario para esta verificación de push.
