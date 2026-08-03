# Revisión pre-lanzamiento (Fase 0)

Resultado de la fase de revisión y endurecimiento previa a exponer Music 4 All al
público. Sirve para **no volver a auditar lo mismo** en cada sesión: cada ítem
dice qué se hizo, qué se decidió no hacer y por qué.

Ramas: `chore/pre-launch-hardening` (0.A/0.B/0.C/0.G, 2026-07-31) y
`chore/pre-launch-hardening-2` (0.D/0.E/0.F, 2026-08-01).

Estado global de la suite:

| Gate | Resultado |
|---|---|
| Backend `pytest` | **373 passed**, 2 skipped (363 al cerrar 0.G, +10 en 0.F) |
| Backend `ruff check` + `format --check` | limpio |
| Backend `pip-audit` | **0 vulnerabilidades conocidas** |
| Frontend `pnpm test` (Vitest) | **240 passed** (175 al cerrar 0.G, +65 en 0.D) |
| Frontend `pnpm lint` + `pnpm build` | limpio |
| Frontend `pnpm test:e2e` (Playwright) | **36 passed** en chromium + firefox + webkit |
| Frontend `pnpm audit --prod` | **0 vulnerabilidades conocidas** |

---

## 0.A — Seguridad para exposición pública

### Dependencias (SEC-05) — RESUELTO

No había **nada** vigilando los CVE de las dependencias. Auditado por primera vez:

| Ámbito | Antes | Después |
|---|---|---|
| Backend (`pip-audit`) | 16 avisos en 4 paquetes | 0 |
| Frontend (`pnpm audit --prod`) | 35 avisos | 0 |

- Backend: `aiohttp` 3.13.5 → 3.14.3, `starlette` 1.2.1 → 1.3.1, `pydantic-settings`
  2.14.1 → 2.14.2, `python-dotenv` 1.0.0 → 1.2.2 (estaba clavado con `==`, que es
  lo que impedía recibir el arreglo).
- Frontend: `axios` 1.16.1 → 1.19.0 (arrastra `form-data` 4.0.6), `postcss` →
  8.5.25. Los 24 avisos restantes eran **todos de `next` 14.2.35**, sin parche en
  su rama → ver la migración a Next 15 más abajo.
- `.github/dependabot.yml` nuevo (uv, npm, github-actions, docker), con parches y
  menores agrupados en un PR semanal.
- CI: pasos `pip-audit` y `pnpm audit --prod` **informativos**. Deliberadamente no
  bloquean: un aviso publicado aguas arriba no debe tumbar un PR que no lo toca,
  pero tiene que verse en el log.

### Login CSRF (SEC-06) — HALLAZGO REAL, RESUELTO

Repasadas todas las mutaciones: van por POST/PATCH/DELETE con la cookie
`SameSite=Lax`, **salvo el polling del device flow** (`GET
/session/device-auth/{device_code}`), que es el único endpoint que **crea sesión y
emite la cookie** sin exigir una previa.

`SameSite=Lax` impide que la cookie **viaje** cross-site, no que se **fije**. Un
atacante que autorice un código con su propia cuenta Tidal y consiga que el
navegador de la víctima cargue esa URL (basta un `<img>` en cualquier página) la
deja navegando con la sesión de él: las búsquedas y descargas de la víctima acaban
en un historial ajeno. CORS no lo evita, porque el atacante no necesita leer la
respuesta, solo provocarla.

Arreglo: `backend/app/core/csrf.py`. Rechaza con 403 `CROSS_SITE_BLOCKED` si el
navegador declara `Sec-Fetch-Site: cross-site` (con `Origin` como respaldo para
navegadores sin Sec-Fetch-Metadata). Los clientes que no son navegadores no mandan
ninguna de las dos cabeceras y pasan sin más: el ataque solo existe dentro de un
navegador. Tests en `backend/tests/test_csrf_guard.py`.

### Cabeceras nginx (SEC-04) — RESUELTO

- **HSTS** vía `map $http_x_forwarded_proto`: se emite cuando el proxy de delante
  termina TLS y se omite en local por HTTP plano. Anunciar HSTS sin TLS dejaría al
  navegador sin poder volver a entrar, y era la razón de que estuviera comentado.
- **Permissions-Policy** nueva, negando las capacidades que la app no usa
  (cámara, micrófono, geolocalización, USB, pagos…), dejando `autoplay` y
  `fullscreen` en `self` para el reproductor.

### SEC-03 (no exponer puertos internos, password fuerte de Postgres)

**Pendiente por diseño**: se materializa en el `docker-compose.prod.yml` de la
Fase 1, porque el compose actual es el de desarrollo y sí necesita esos puertos.

---

## 0.B — Optimización de frontend

### PERF-06 (ReactQueryDevtools en el bundle) — MEDIDO: no era cierto

`QueryProvider` importaba `ReactQueryDevtools` sin gate, pero **el paquete v5 ya se
auto-anula** fuera de `development` (exporta `() => null`). Medición antes y
después del gate: **218 kB de first-load en `/dashboard` en ambos casos, 0 kB de
ahorro**. El gate se ha dejado igualmente como garantía explícita, para no depender
de un detalle interno del paquete, pero el hallazgo de la auditoría estaba
obsoleto.

### Imágenes — decisión tomada: NO activar el optimizador

`images.unoptimized: true` se mantiene, y ahora está documentado en
`next.config.mjs`. Las carátulas vienen del CDN de Tidal, que ya sirve tallas
pre-renderizadas (80/160/320/640/750/1080/1280) directamente al navegador.
Activar `next/image` las haría pasar por nuestro servidor: CPU de redimensionado,
ancho de banda de salida y caché en disco en una VM gratuita, para reempaquetar
algo que ya viene optimizado.

Lo que **sí** era un desperdicio real: todos los mappers generan la URL a 640×640
porque la misma carátula se reutiliza en contextos distintos, pero las filas de
resultados, el historial y la barra del reproductor la pintan a 40-48 px — unos
50 KB por miniatura, y una búsqueda trae 50 filas. Nuevo helper `coverAtSize()`
(`shared/api/mappers.ts`) que pide la talla adecuada al CDN, aplicado en
`TrackResults`, `HistoryItem`, `PlayerBar` y `AlbumTracksModal`.

### Bundle

First-load JS compartido: 87.4 kB con Next 14 → **103 kB con Next 15 + React 19**
(`/dashboard`: 218 → 223 kB). El crecimiento viene del runtime del framework, no
de código propio.

---

## 0.C — Performance / robustez backend

- **PERF-08 resuelto**: `pool_pre_ping=True` en el engine async. Tras un rato
  ocioso el socket puede estar cerrado por Postgres o por un intermediario; sin
  pre-ping la primera consulta falla con un error intermitente en vez de
  reconectar.
- **PERF-01 resuelto**: el único exportador OTel configurado es la consola con
  `SimpleSpanProcessor`, que exporta cada span de forma **síncrona en el event
  loop**. Sin collector no aporta nada en producción y sí infla los logs. Ahora el
  `TracerProvider` y `FastAPIInstrumentor` solo se montan si
  `settings.tracing_enabled` (por defecto: activo en desarrollo, inactivo en
  producción; `OTEL_TRACING_ENABLED` lo fuerza en cualquier sentido).
- **PERF-03 (límites de recursos)**: pendiente del `docker-compose.prod.yml`
  (Fase 1), con las cifras medidas en 0.G.

---

## 0.D — Tests

### La suite e2e llevaba rota desde la migración multiusuario — REPARADA

Hallazgo importante: `pnpm test:e2e` fallaba **desde el commit `a2a20a3`** (Fase
1p2 + 2). Los helpers sembraban la cookie `music4all_session` mientras que el
middleware pasó a exigir la httpOnly `m4a_sid`, así que la ruta protegida rebotaba
al login y la ejecución moría en el `global-setup`, antes del primer test. El job
`test-e2e` de CI estaba en rojo sin que nadie lo mirara.

Reparada entera — **36 tests verdes en chromium, firefox y webkit**:

| Causa | Arreglo |
|---|---|
| Cookie de sesión obsoleta | `m4a_sid` en `global-setup` y `utils/auth` |
| El mock del login no emitía la cookie | `Set-Cookie` en la respuesta del poll autorizado, como hace el backend real |
| `brandTitle` casaba con 3 elementos | `exact: true` (el aviso legal y el `<title>` también dicen "Music 4 All") |
| El botón que abre el Now Playing no existía | Ese botón es de la `PlayerBar`, **solo móvil** (en lg+ el reproductor es el Walkman del sidebar) → ese caso se audita en viewport móvil |
| El indicador de Next dev tools robaba los clics | `utils/devOverlay` lo oculta en los tests |
| WebKit fallaba las 4 pruebas de búsqueda | **Carrera de hidratación**: WebKit hidrata más lento y el `fill()` entraba antes de que React escuchara el input, así que el valor se descartaba y la búsqueda nunca se lanzaba. `utils/search` reintenta hasta que el valor sobrevive a un ciclo de render (verificado: con una espera previa pasaba; con el helper pasa sin dormir a ojo) |

### mypy — reconciliado

El roadmap decía 49 errores y la auditoría técnica decía 0. La cifra real hoy es
**13 errores en 5 archivos** (`uv run mypy app/`), y **ninguno es un fallo real**:

- `tidal.py:611-612` (`re.search(...).group()` sobre un `Match | None`) y
  `tidal.py:783/790` (`.info` de mutagen) están **dentro de `try/except`**: si no
  casa el patrón o el archivo no es legible, se devuelve el error controlado.
- `quotas.py` (`bytes | str`) es ruido: el cliente Redis va con
  `decode_responses=True`, así que en ejecución siempre son `str`.
- `session/service.py` (`samesite`) es un `str` de configuración contra un
  `Literal`; en ejecución el valor es válido.

mypy **no está en CI** y no se ha añadido: hacerlo exigiría limpiar o silenciar
estos 13 primero. Queda documentado para decidirlo aparte.

### TD-05 (cobertura de `DownloadPanel`, `ProgressBar`, mappers) — CERRADO

Los tres huecos que quedaban abiertos de la auditoría técnica. **65 tests nuevos**
(Vitest 175 → **240**), sin tocar los existentes:

| Archivo | Tests | Qué cubre |
|---|---|---|
| `tests/unit/components/ProgressBar.test.tsx` | 18 | ARIA (`role=progressbar`, rango, `aria-valuetext`), recorte de valores fuera de 0-100, ancho del relleno, variante `indeterminate` (sin `aria-valuenow`), colores por variante, glow del track en cola, respiración neón solo en `download` y **solo sin `prefers-reduced-motion`** |
| `tests/unit/components/DownloadPanel.test.tsx` | 25 | Que el **socket WS se monta aunque no haya nada que pintar** (el panel es el singleton del WS, `CLAUDE.md` §8), resumen colapsado, `aria-busy`, expandir/colapsar, aviso de reconexión, orden de la lista, estado vacío, limpiar completados, pausar/reanudar/cancelar con el **id de backend**, recuperación de sesión y reproducir una descarga de una sola pista |
| `tests/unit/entities/mappers.test.ts` | 15 | `coverIdToUrl`, `mapAlbumDTO`, `mapTrackDTO`, `mapWsMessageToProgress`: campos opcionales ausentes, carátula vacía, contexto de álbum y ceros del WebSocket (0 % / 0 MB/s no deben perderse) |
| `tests/unit/entities/entityUtils.test.ts` | 7 | `getAudioQualityLabel`, `getAudioModeLabel`, `formatTrackNumber`, `isJobActive`, `isJobTerminal` |

En `DownloadPanel` solo se sustituyen las piezas que salen del proceso (WebSocket,
mutaciones HTTP, modal de recuperación): el store y `useDownloadQueue` son los
reales, así que lo que se prueba es el comportamiento, no el mock.

#### Dos fallos reales encontrados al escribir los tests de mappers — CORREGIDOS

`mapAlbumDTO` calculaba el año con `new Date(dto.release_date).getFullYear()`:

1. **Año equivocado en lanzamientos del 1 de enero.** Una fecha sin hora
   (`"2020-01-01"`) se interpreta como medianoche **UTC** y `getFullYear()`
   responde en hora **local** → en cualquier huso negativo el álbum salía como
   **2019**. Afecta a todo usuario de América.
2. **`NaN` impreso en la ficha.** Cuando Tidal no publica fecha, el backend manda
   `""` (`_release_date_str` en `search/repository.py`); `new Date("")` es
   *Invalid Date* y la tarjeta pintaba literalmente `NaN`.

Corregido leyendo el año del propio texto `"YYYY-MM-DD"`. `Album.releaseYear`
pasa a ser `number | null` y los tres puntos que lo pintaban (tarjeta de álbum,
su `aria-label` y la cabecera de `/album/[id]`) **omiten el año** si no hay fecha.
Ambos casos quedan como test de regresión; el del 1 de enero **fuerza el huso**
(`process.env.TZ`) porque CI corre en UTC y allí el fallo no se reproduce.

---

## 0.E — UX y accesibilidad

### Contraste WCAG AA — CERRADO (roadmap 2.8)

El gate de axe llevaba `color-contrast` en `TRACKED_DEBT_RULES`: se analizaba y
se avisaba, pero **no bloqueaba**. Ahora la lista está **vacía** y el gate cubre
**9 vistas** (antes 5).

**Medido** (ratio de contraste sobre las superficies del sistema):

| Token | void | console | studio | rack | AA (4.5:1) |
|---|---|---|---|---|---|
| `text-primary` #E8EFF5 | 16.99 | 15.24 | 13.64 | 11.61 | ✅ |
| `text-secondary` #8FA3B8 | 7.60 | 6.82 | 6.10 | 5.19 | ✅ |
| `text-disabled` #4D6278 | 3.13 | 2.81 | 2.51 | 2.14 | ❌ |

Aclarar `text-disabled` hasta AA lo dejaría casi en `text-secondary` y aplanaría
la jerarquía de tres niveles del diseño. Se hizo lo otro: **reclasificar**. Pasó
a `text-secondary` el texto informativo que hay que leer — "Nothing playing",
"Now Playing", "No active downloads", "Waiting to start…", el año del álbum, la
nota del selector de calidad, los números de pista y la fecha del historial.
`text-disabled` se queda **solo** en iconos decorativos (`aria-hidden`) y en
estados `disabled:` de controles inactivos, que **WCAG 1.4.3 exime**.

### Segundo fallo, que la excepción tapaba: los colores semánticos como texto

Al quitar `color-contrast` de la lista, el gate falló en el dashboard por la
insignia de estado de sesión (#E84040 sobre su propio fondo al 15 % = **4.35:1**).
No era un caso aislado: los tokens semánticos están pensados como **relleno** y
de glifos se quedan cortos en todas las superficies.

| Como texto | rack (plano) | tinte 15 % sobre studio | tinte 15 % sobre rack |
|---|---|---|---|
| `error` #E84040 | 3.36 | 3.47 | 3.01 |
| `info` #3B82F6 | 3.66 | 3.55 | 3.05 |
| `queue` #8B5CF6 | 3.18 | 3.15 | 2.72 |
| **`error-on-dark` #EF7D7D** | **5.07** | **5.23** | **4.54** |
| **`info-on-dark` #72A5F9** | **5.43** | **5.27** | **4.52** |
| **`queue-on-dark` #B192F9** | **5.35** | **5.31** | **4.58** |

Se añadió la variante **`-on-dark`**, que se usa **solo cuando el color es
texto** (`text-semantic-*-on-dark`). Los rellenos, bordes y puntos mantienen el
color original: WCAG 1.4.3 no aplica a ellos y aclararlos deslavaría la barra de
progreso, el borde del error de login y los indicadores de estado. `success` y
`warning` ya cumplían; tienen la variante igualmente para que el uso sea uniforme
y nadie tenga que recordar cuáles sí y cuáles no.

### Ampliación del gate de accesibilidad

De 5 vistas a 9: se añadieron **historial**, **biblioteca**, **ajustes** y el
**panel de descargas con trabajos vivos** (un activo y uno fallido, conducidos
por el WebSocket como en `download-flow.spec`). El panel era el hueco importante:
las insignias de estado, la barra de progreso y el mensaje de error con
`role="alert"` no aparecen en ninguna otra vista, y son justo donde vive el color
semántico.

**Fallo de método corregido por el camino:** axe calcula el contraste sobre el
color **compuesto**, así que medir a mitad de un fade-in da un resultado que no
es el que ve nadie (`text-secondary` al 71 % de opacidad reporta 4.32:1, y recién
arrancado 1.1:1). El resultado dependía de cuándo llegase axe. Ahora
`settleAnimations()` espera a que terminen las animaciones de entrada antes de
medir; se excluyen las infinitas (shimmer, pulso neón) porque nunca terminan.

### Gate nuevo: layout móvil y consola limpia

`frontend/tests/e2e/mobile-layout.spec.ts` — 8 vistas a 390×844 (login,
dashboard con resultados, álbum, artista, historial, biblioteca, ajustes y el
cajón de navegación abierto). Comprueba dos cosas:

- **Sin desbordamiento horizontal**: `documentElement.scrollWidth` contra el
  ancho del viewport. Es el síntoma medible del "colapso de layout" que pedía el
  plan — si algo se sale, la página se arrastra de lado y parte del contenido
  queda fuera. Cuando falla, el mensaje nombra el elemento más ancho.
- **0 errores de consola** por vista (`console.error` + excepciones no
  capturadas). Se ignoran los errores de red, que en pruebas son de esperar (no
  hay backend). **Verificado que el gate falla** inyectando un `console.error`.

### Pendiente de 0.E: la pasada en vivo

El recorrido manual con el skill `ux-audit` sobre la app en **modo producción
local** (Docker) **queda pendiente**: necesita el stack levantado y una cuenta
Tidal real. Lo automatizable de esa pasada — axe sin Critical/Serious, layout
móvil y consola limpia — ya está cubierto arriba y corre en CI.

---

## 0.F — Estrés y capacidad

El load test que había **no medía nada**: `AuthenticatedUser` no tenía sesión
(`on_start: pass`), así que sus peticiones devolvían 401, y golpeaba rutas legacy
(`/metadata/search`, `/auth/status`) que el frontend ya no usa. Reescrito y
ampliado con descargas y WebSocket. Herramientas nuevas en `backend/tests/load/`:

| Archivo | Para qué |
|---|---|
| `seed_sessions.py` | Siembra N sesiones de app válidas en Redis (usuarios `loadtest-N` con una copia de los tokens Tidal de una cuenta real). Sin esto no se puede medir nada autenticado. `--purge` / `--purge-db` lo limpian todo |
| `locustfile.py` | Campaña sobre la API v2 real, con sesión por usuario simulado |
| `ws_load.py` | Abre N WebSockets a la vez y mide el coste en conexiones de Redis (PERF-02) |

**Cómo se acota el riesgo del `client_id` compartido**: la búsqueda usa un
conjunto **fijo y pequeño** de consultas, así que la carga golpea la caché de
Redis (Fase 4) y no a Tidal; y las descargas se encolan y se **cancelan** acto
seguido, salvo que se pida lo contrario con `LOADTEST_KEEP_DOWNLOADS=1`.

### Dos fallos serios encontrados al medir — CORREGIDOS

#### 1. Con ~100 usuarios conectados, **toda la API devolvía 500**

Cada WebSocket de progreso mantiene una suscripción Pub/Sub, es decir **una
conexión de Redis retenida mientras el usuario tenga la pestaña abierta**. Salía
del mismo pool que los comandos, y **redis-py 8 bajó el tamaño por defecto del
pool a 100** (antes era prácticamente ilimitado). Consecuencia medida con 120
conexiones:

```
/health          -> HTTP 200   (no toca Redis)
/session/status  -> HTTP 500   MaxConnectionsError: Too many connections
/history         -> HTTP 500
```

No era "el WebSocket número 101 falla": eran **~100 usuarios con la pestaña
abierta dejando la aplicación entera inservible**, sin tocar una sola descarga.
Es un bloqueante de lanzamiento y no lo habría visto ningún test unitario.

Tres cambios, cada uno con su motivo:

- **Pool separado para Pub/Sub** (`app.state.redis_pubsub`): las suscripciones
  largas ya no compiten con los comandos. El peor caso de los WebSocket pasa a
  ser rechazar WebSocket nuevos.
- **Aforo explícito** (`ws_max_connections`, 200): al llenarse se cierra con
  **1013 (Try Again Later)**, que es lo que un cliente sabe reintentar, en vez de
  reventar el handshake con un 500. Métricas `ws_connections_active` y
  `ws_connections_rejected_total`.
- **Pool de comandos bloqueante**: una ráfaga de peticiones simultáneas mayor que
  el pool ahora **espera** (con tope de 10 s) en vez de fallar. Sin esto, 120
  handshakes a la vez seguían tirando cuatro con 500.

Verificado con la misma prueba que lo destapó — 250 conexiones contra un aforo de
200:

```
200 abiertos · 50 rechazados por aforo (1013) · 0 fallidos
/health 200 · /session/status 200 · /history 200 · /history/stats 200
```

**PERF-02 cuantificado**: exactamente **1.00 conexiones de Redis por WebSocket**
(101 → 301 con 200 abiertos), y al cerrar vuelven a 101 → **no hay fuga**. El
fan-out compartido sigue diferido, pero ahora el coste está medido y acotado.

#### 2. Una llamada a Tidal **por cada petición autenticada**

`get_authenticated_engine` es dependencia de todos los endpoints con sesión y
llamaba a `check_auth()` → `session.check_login()`, que es **una petición HTTP a
Tidal**. Se veía como un suelo constante de ~130 ms en todo endpoint con sesión
*aunque la respuesta viniera de la caché de Redis*, y significaba una llamada al
`client_id` compartido por cada vista — justo lo que la caché de la Fase 4 existe
para evitar.

Se revalida como mucho una vez cada `engine_auth_recheck_interval` segundos (60)
por motor. Una sesión revocada se sigue detectando: el fallo aparece igual como
401 de la petición siguiente. `0` restaura el comportamiento anterior.

| p50 | antes | después |
|---|---|---|
| `/search` (cacheada) | 130 ms | **6 ms** |
| `/albums/{id}` | 130 ms | **5 ms** |
| `/artists/{id}` | 130 ms | **6 ms** |
| `/session/status` | 130 ms | **5 ms** |
| `POST /downloads` | 250 ms | **110 ms** |
| `DELETE /downloads/{id}` | 240 ms | **47 ms** |
| **Agregado** | **130 ms** | **6 ms** |

### Cifras medidas (stack de desarrollo, Docker local)

Campaña de 30 usuarios concurrentes, 90 s: **805 peticiones, 0 fallos (0.00 %)**,
9 req/s, **p50 6 ms / p95 110 ms**.

| Camino | Medida |
|---|---|
| `/health` | p50 4 ms |
| `/history`, `/history/stats` | p50 6-8 ms |
| `/search` con caché caliente | p50 6 ms |
| Descarga real de 1 pista (NORMAL/AAC) | **6 s** extremo a extremo |
| Descarga real de 1 pista (MASTER/hi-res) | **8 s**, **pico de CPU 90 %** de un núcleo |
| WebSockets simultáneos | **200** (aforo), 1.00 conexiones de Redis cada uno |
| RAM del backend con 200 WS | 222 MiB (≈60 kB por conexión) |
| RAM de Valkey con 200 WS | 11 MiB |

### Objetivos de capacidad (VM gratuita Ampere A1, 4 OCPU / 24 GB)

Se fijan a partir de lo medido, no a ojo:

| Objetivo | Valor | De dónde sale |
|---|---|---|
| Usuarios con la app abierta a la vez | **200** | Aforo de WS; por encima se rechaza con 1013, sin degradar al resto |
| Descargas simultáneas | **3** (`max_concurrent_downloads`) | Una descarga hi-res satura ~1 núcleo; 3 dejan uno libre para la API |
| Ritmo de descarga sostenible | ~**22 pistas/min** hi-res | 8 s por pista × 3 en paralelo |
| Peticiones de navegación | ≥ 9 req/s con p95 < 150 ms | Medido a 30 usuarios sin un solo fallo |
| Techo por usuario | 3 concurrentes / 50 al día | Cuotas ya existentes; se comprobó que el 429 aparece y **no** se contabiliza como error |

El límite real no es la máquina: son las **cuotas por usuario** y el `client_id`
compartido de Tidal. Con 200 usuarios conectados el backend gasta 222 MiB y la
CPU se va en las descargas, no en servir la API.

### Notas de método

- El primer intento medía **el propio medidor**: aiohttp limita a 100 conexiones
  simultáneas por defecto, así que aparecía un techo de ~100 WebSockets que era
  del cliente. Con `TCPConnector(limit=0)` sale el techo real del servidor.
- Los IDs de álbum/artista del fixture de los e2e son **inventados**: con ellos
  la campaña medía el camino de error (404 y 500). Se usan IDs reales de Tidal.
- Si a mitad de una campaña empiezan a salir 401, hay que **volver a sembrar**:
  las sesiones tienen TTL de inactividad y, en Docker Desktop, un suspender/
  reanudar del portátil salta el reloj del contenedor y expira de golpe todas las
  claves con TTL. Se comprobó que el TTL en sí baja con normalidad (1800 → 1708
  en 90 s): no es un fallo del producto.

### Pendiente de 0.F

**0.F.1 — prueba con otra persona por túnel** (Cloudflare Tunnel a `nginx:80`,
quitando `NEXT_PUBLIC_WS_URL` para que el WebSocket vaya same-origin). Requiere a
un tester con su propia cuenta Tidal.

---

## 0.G — Uso de recursos — MEDIDO

Medido con `docker stats` sobre el stack completo en reposo, y comparado con los
targets de **producción** de los Dockerfiles (construidos y ejecutados a mano para
esta medición). La conclusión importante: **lo que abulta es el modo desarrollo**,
no la aplicación.

| Servicio | RAM en desarrollo | RAM en producción | Imagen dev | Imagen prod |
|---|---|---|---|---|
| frontend | 815–925 MiB | **46.7 MiB** | 996 MB | **325 MB** |
| backend | 211 MiB | **120 MiB** | 1.88 GB | **800 MB** |
| postgres | 30.7 MiB | — | 395 MB | — |
| valkey | 6.9 MiB | — | 61 MB | — |
| nginx | 16.7 MiB | — | 74 MB | — |
| prometheus | 19.7 MiB | — | 352 MB | — |
| grafana | 50.0 MiB | — | 548 MB | — |
| promtail | 27.9 MiB | — | 286 MB | — |

- **Los ~500 MB que se observaron eran el modo desarrollo.** El stack de desarrollo
  completo ronda **1.3 GB**; el `next dev` solo ya son ~900 MB (dev server + watcher).
  El mismo frontend compilado a `standalone` ocupa **47 MiB**, casi 20 veces menos.
- **CPU en reposo**: el backend consumía un 4–16% sostenido en desarrollo. No es la
  cola (el worker usa `brpop` bloqueante, una consulta cada 2 s): es el
  `--reload` de uvicorn vigilando un bind-mount de Windows. El target de
  producción, sin reload, se queda en **0.13%**.
- Conclusión de dimensionado: la app **no necesita adelgazarse** para una VM
  gratuita. Lo que no debe hacerse es desplegar los targets de desarrollo.

### `mem_limit` de partida para `docker-compose.prod.yml` (PERF-03)

Cifras derivadas de lo medido, con holgura. Las de backend hay que revisarlas con
los resultados de 0.F, porque las descargas añaden ffmpeg (CPU) y buffers:

| Servicio | `mem_limit` propuesto | Base |
|---|---|---|
| backend | 1g | 120 MiB en reposo + hasta 3 descargas concurrentes con ffmpeg |
| frontend | 256m | 47 MiB en reposo, sin trabajo dinámico (SSR ligero) |
| postgres | 512m | 31 MiB con el historial actual, margen para crecer |
| valkey | 256m | 7 MiB; guarda sesiones, cola y caché de catálogo con TTL |
| nginx | 64m | 17 MiB |

Con la observabilidad apagada por defecto (`profiles: [observability]`), el techo
del despliegue queda en torno a **2 GB**, muy por debajo de una VM Ampere A1 gratuita.

### Fallos del empaquetado de producción encontrados al medir — RESUELTOS

Medir obligó a construir los targets de producción, y ninguno de los dos
funcionaba. **CI no lo detectaba porque compila el frontend con `target: builder`,
nunca `production`.**

1. **La imagen de producción del frontend no se podía construir.** El `Dockerfile`
   copia `.next/standalone`, pero `next.config.mjs` no declaraba
   `output: 'standalone'`, así que ese directorio no se generaba nunca. Añadido.
2. **El rewrite `/api` quedaba roto en producción.** `rewrites()` se evalúa durante
   `next build` y su resultado se hornea en `routes-manifest.json`: con
   `BACKEND_URL` sin definir en el build, quedaba fijado a `http://localhost:8000`,
   donde dentro del contenedor no escucha nadie. Pasar la variable en tiempo de
   ejecución no cambiaba nada. Verificado: `GET /api/health` devolvía **500**.
   Arreglado con `ARG BACKEND_URL` (default `http://backend:8000`) en el target
   `builder`; tras el arreglo, `GET /api/health` devuelve **200** con la respuesta
   real del backend.

   En el despliegue previsto nginx atiende `/api/` antes de que llegue a Next, así
   que el tráfico del navegador no dependía de esto — pero la imagen estaba mal
   configurada y habría mordido a la primera que alguien la usara sin nginx delante.

---

## Migración a Next 15 + React 19

Decidida durante la fase, al comprobar que los 24 avisos restantes del frontend
eran todos de `next` 14.2.35 y que **ninguno tiene parche en la rama 14**: todos
exigen 15.x. La rama 14 ya no recibe arreglos de seguridad.

De los avisos, varios no aplicaban a esta app (el bypass de middleware es de Pages
Router con i18n; los SSRF de rewrites y de Server Actions no aplican porque el
destino del rewrite es una variable de entorno fija y no se usan Server Actions),
pero quedaban varios de **denegación de servicio** en App Router que sí.

- `next` 14.2.35 → **15.5.22**, `react`/`react-dom` 18.3.1 → **19.2.8**.
- `params` pasa a ser una `Promise` en `/album/[id]` y `/artist/[id]`.
- `useFocusTrap` acepta `RefObject<HTMLElement | null>`: desde React 19,
  `useRef<T>(null)` se tipa incluyendo `null`.
- Overrides de pnpm para la copia de `postcss` (8.4.31) y el `sharp` opcional que
  empaqueta Next, que arrastraban los últimos 4 avisos. `sharp` ni siquiera se usa
  (el optimizador de imágenes está desactivado).

Nota para el futuro: `next lint` está **deprecado y desaparece en Next 16**. Cuando
toque subir, hay que migrar a la CLI de ESLint (`npx @next/codemod@canary
next-lint-to-eslint-cli .`).
