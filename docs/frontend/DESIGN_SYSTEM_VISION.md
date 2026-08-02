# Design System vNext — Music 4 All

Fuente de verdad del sistema visual. Define cómo se extiende el design system actual (`frontend/tailwind.config.ts` + `frontend/src/app/globals.css`) para soportar la dirección creativa "tienda de discos neón nocturna de los 90" descrita en `FRONTEND_VISION.md`, sin crear un segundo sistema paralelo.

Este documento es normativo: cualquier componente nuevo o rediseñado descrito en `FRONTEND_VISION.md` y planificado en `IMPLEMENTATION_PLAN.md` debe poder trazarse a un token definido aquí.

---

## 0. Relación con los documentos existentes

- **Estado real del código** (componentes, props, contratos): `docs/architecture.md`, `docs/development.md`.
- **Visión creativa** (qué se quiere construir): `FRONTEND_VISION.md`.
- **Roadmap de ejecución** (cómo y en qué orden): `IMPLEMENTATION_PLAN.md`.
- **Este documento**: el "cómo se ve" formal — tokens, tipografía, animación, accesibilidad, performance.

---

## 1. Principio fundamental: un solo sistema de diseño

El repositorio ya tiene **dos generaciones de tokens de color**:

1. **Canónico (vigente)** — `colors.surface-*`, `colors.primary/secondary/disabled/ghost` (texto), `colors.teal.*`, `colors.semantic.*`, `colors.synthwave.*`, `borderColor.*`, definidos en `tailwind.config.ts` y replicados como CSS vars en `globals.css` (`--color-*`).
2. **Legacy (solo compatibilidad)** — `colors.neon.*` (`green`/`magenta`/`cyan` en hex puro `#00ff00` etc.), `colors.dark.*`, y las utilidades `.text-neon-*` / `.border-neon-*` en `globals.css`. Marcados explícitamente en el código como "mantenidos para compatibilidad" / "NO eliminar hasta que los componentes legacy sean migrados".

**Regla vNext**: todo lo nuevo se construye **exclusivamente sobre el sistema canónico (1)**. El sistema legacy (2) no se extiende, no se usa como referencia de valores nuevos y no se elimina en este esfuerzo (eso es limpieza de deuda técnica, ver `docs/roadmap.md`). No se crea un tercer sistema "neón 90s" con sus propios hex.

---

## 2. Paleta cromática oficial

### 2.1 Tokens canónicos actuales (sin cambios)

| Grupo | Token Tailwind | Valor | Uso |
|---|---|---|---|
| A — Superficies | `surface-void` | `#080B0F` | Fondo raíz (`<body>`, login `<main>`) |
| | `surface-abyss` | `#0D1117` | Paneles grandes (PlayerBar) |
| | `surface-console` | `#131920` | Tarjetas (AlbumCard) |
| | `surface-studio` | `#1A2330` | Superficies de imagen/placeholder |
| | `surface-rack` | `#21303F` | Tracks de ProgressBar, hover de Card |
| B — Texto | `text-primary` | `#E8EFF5` | Texto principal |
| | `text-secondary` | `#8FA3B8` | Texto secundario (artista, metadatos) |
| | `text-disabled` | `#4D6278` | **Solo** iconos decorativos y controles inactivos — ver §2.1.1 |
| | `text-ghost` | `#2C3E50` | Texto casi invisible |
| C — Acento Teal | `teal-300` | `#4DFFD9` | Acento brillante (hover fuerte) |
| | `teal-400` | `#00E5BF` | Hover de elementos primarios |
| | `teal-500` | `#00C9A7` | Acento principal (branding, focus, botón primario) |
| | `teal-700` | `#008C73` | Variante oscura |
| | `teal-glow` | `#00C9A720` | Glow translúcido |
| D — Semántica (relleno) | `semantic-success` | `#39D353` | Descarga completada |
| | `semantic-warning` | `#E8A020` | En cola / advertencia |
| | `semantic-error` | `#E84040` | Error |
| | `semantic-info` | `#3B82F6` | Descarga en progreso |
| | `semantic-queue` | `#8B5CF6` | Estado "queued" |
| D' — Semántica (texto) | `semantic-error-on-dark` | `#EF7D7D` | El mismo error, **como glifo** — ver §2.1.1 |
| | `semantic-info-on-dark` | `#72A5F9` | idem |
| | `semantic-queue-on-dark` | `#B192F9` | idem |
| | `semantic-success-on-dark` | `#39D353` | Igual al base (ya cumple AA) |
| | `semantic-warning-on-dark` | `#E8A020` | Igual al base (ya cumple AA) |

### 2.1.1 Regla de contraste (WCAG AA) — qué token va en el texto

Fijada en la Fase 0.E; el gate de axe (`tests/e2e/a11y.spec.ts`) la hace cumplir
en 9 vistas, sin excepciones.

- **`text-disabled` (#4D6278) no se usa para texto que haya que leer.** Da
  2.1–3.1:1 sobre las superficies, muy por debajo del 4.5:1 de AA. Queda para
  iconos decorativos (`aria-hidden`) y estados `disabled:` de controles
  inactivos, que **WCAG 1.4.3 exime**. Para texto informativo de baja jerarquía
  se usa `text-secondary` (5.2–7.6:1).
  *No* se aclara el token: subirlo a AA lo dejaría casi en `text-secondary` y
  aplanaría la rampa de tres niveles.
- **Los colores semánticos, cuando son texto, van en su variante `-on-dark`.**
  Los del grupo D están pensados como relleno (barras, puntos, bordes, fondos
  teñidos al 15 %) y como glifos se quedan en 3.0–3.7:1. Los rellenos **no**
  cambian: aclararlos deslavaría la barra de progreso y los indicadores.
| E — Bordes | `border` (DEFAULT) | `#1E2D3D` | Borde estándar |
| | `border-subtle` | `#162030` | Separadores |
| | `border-focus` | `#00C9A750` | Focus ring |
| | `border-error` | `#E8404050` | Borde de error |
| F — Synthwave (uso restringido, máx. 1 acento/vista) | `synthwave-magenta` | `#E040FB` | Acento decorativo puntual |
| | `synthwave-blue` | `#40C4FF` | Acento decorativo puntual |
| | `synthwave-pink` | `#FF4081` | Acento decorativo puntual |

### 2.2 Mapeo de la paleta "neón 90s" sobre tokens existentes

Las propuestas de rediseño usan una paleta de referencia (`#00FFFF`, `#D500F9`, `#FF0055`, `#F9A825`, fondo `#050510`). **No se introducen estos hex como nuevos tokens.** Se mapean así:

| Color de referencia (propuesta) | Token canónico equivalente | Nota |
|---|---|---|
| Cian neón `#00FFFF` | `teal-300` (`#4DFFD9`) para acentos UI; ver §2.3 si se requiere un cian más "eléctrico" | `teal-300` ya es el tono más brillante del acento principal — usarlo primero |
| Púrpura `#D500F9` | `synthwave-magenta` (`#E040FB`) | Diferencia perceptual mínima; reutilizar tal cual |
| Rosa `#FF0055` | `semantic-error` (`#E84040`) para estados funcionales (error/glitch); `synthwave-pink` (`#FF4081`) para acentos puramente decorativos | No mezclar ambos en la misma vista |
| Ámbar `#F9A825` | `semantic-warning` (`#E8A020`) | Casi idéntico — reutilizar para "en cola"/ámbar decorativo |
| Fondo nocturno `#050510` | `surface-void` (`#080B0F`) | Diferencia de luminosidad despreciable; ver §2.3 si QA visual determina que se necesita un tono más oscuro |

### 2.3 Extensiones formales — solo si QA visual lo justifica

Si tras implementar una fase (ver `IMPLEMENTATION_PLAN.md`) el mapeo de §2.2 resulta visualmente insuficiente, las **únicas** extensiones aceptables son:

- `synthwave-cyan: '#00FFFF'` — añadido al grupo F (synthwave, uso restringido) si `teal-300` no logra el efecto "tubo de neón cian".
- `surface-midnight` — nuevo token de Grupo A, más oscuro que `surface-void`, si se requiere un fondo "calle nocturna" diferenciado del fondo de panel estándar.

Cualquier extensión debe añadirse formalmente a **ambos** lugares: `tailwind.config.ts` (`colors.synthwave.*` / `colors.surface-*`) y `globals.css` (`--color-synthwave-*` / `--color-*`), siguiendo el patrón de comentarios `Grupo X` existente. Nunca como literal hex dentro de un componente.

---

## 3. Tipografía oficial

### 3.1 Fuentes canónicas (sin cambios)

| Token Tailwind | Fuente | CSS var | Uso |
|---|---|---|---|
| `font-sans` | Inter | `--font-sans` | Texto de interfaz general (body, labels, botones) |
| `font-mono` / `font-display` | Geist Mono | `--font-display` (mapea `--font-geist-mono`) | Branding, valores técnicos, badges |
| `font-code` | JetBrains Mono (fallback a Geist) | — | Reservado para uso futuro tipo CLI |

### 3.2 Fuentes vNext — uso restringido (decorativo)

Las propuestas piden 3 fuentes nuevas (Press Start 2P, VT323, Montserrat). Decisión:

| Fuente propuesta | Decisión | Token vNext | Uso permitido |
|---|---|---|---|
| **Press Start 2P** | Adoptar | `font-pixel` | Exclusivo para el letrero "MUSIC 4 ALL" (Login) y títulos decorativos equivalentes. **Nunca** en texto de cuerpo, botones funcionales ni tablas. |
| **VT323** | Adoptar | `font-retro` | Exclusivo para displays retro (código OAuth, contador de expiración, "ticket"). Verificar legibilidad a `text-2xs`/`text-xs` — puede requerir +1 escala respecto al texto equivalente en `font-mono`. |
| **Montserrat** | **No adoptar** | — | `font-sans` (Inter) ya cubre el rol de "botones y textos" que Montserrat cumpliría. Añadir una tercera fuente de propósito general fragmentaría el sistema sin beneficio — se descarta. |

Ambas fuentes vNext se cargan vía `next/font/google` en `app/layout.tsx` (mismo patrón que `Inter`/`GeistMono` hoy) y se registran como `fontFamily.pixel` / `fontFamily.retro` en `tailwind.config.ts`. Son tokens **de uso restringido**, igual que `colors.synthwave.*`: máximo 1–2 elementos por vista.

---

## 4. Escalas tipográficas

Sin cambios respecto al sistema actual:

| Token | Tamaño | Line-height | Letter-spacing | Uso |
|---|---|---|---|---|
| `text-2xs` | `0.625rem` (10px) | `1.0` | `0.05em` | Metadatos pequeños (año, badges) |
| `text-xs` … `text-base` | Tailwind default | Tailwind default | Tailwind default | Texto general |
| `text-heading` | `1.25rem` (20px) | `1.2` | `0` | Títulos de tarjeta/sección |

**Nota vNext**: si `font-retro` (VT323) resulta poco legible en `text-2xs`/`text-xs` durante QA visual, la corrección es subir un escalón de tamaño (`text-xs` → `text-sm`), **no** crear un nuevo token de tamaño exclusivo para esa fuente.

---

## 5. Sistema de espaciado

Sin cambios — unidad base `--space-unit: 8px`, constantes de layout (`--layout-sidebar-w: 240px`, `--layout-player-h: 80px`, `--layout-header-h: 56px`, `--layout-content-max: 1440px`, `--layout-prose-max: 65ch`). Ningún elemento decorativo vNext puede alterar estas dimensiones de layout (las capas decorativas son `absolute`/`fixed` superpuestas, no participan del flujo).

---

## 6. Sistema de elevación y sombras

Sin cambios — escala `shadow-sm` → `shadow-xl` (elevación neutra, `rgba(0,0,0,*)`), usada para profundidad estructural (cards, modales, paneles).

---

## 7. Glow effects

### 7.1 Glows canónicos actuales

| Token | Valor | Uso actual |
|---|---|---|
| `shadow-glow-active` | `0 0 8px rgba(0,201,167,0.40), 0 0 24px rgba(0,201,167,0.15)` | Estados activos (teal) |
| `shadow-glow-focus` | `0 0 0 2px rgba(0,201,167,0.50)` | Focus ring de componentes interactivos |
| `shadow-glow-error` | `0 0 8px rgba(232,64,64,0.35)` | `ProgressBar` variant `error`, botón `danger` |
| `shadow-glow-success` | `0 0 8px rgba(57,211,83,0.30)` | `ProgressBar` variant `success` |
| `shadow-glow-download` | `0 0 8px rgba(59,130,246,0.35)` | `ProgressBar` variant `download` |

### 7.2 Glows legacy (no extender)

`shadow-neon-green`, `shadow-neon-cyan`, `shadow-neon-magenta` (triple `box-shadow` con hex puro `#00ff00`/`#00ffff`/`#ff00ff`) — mantenidos solo para compatibilidad con código legacy. No usar como base para componentes nuevos.

### 7.3 Glow vNext requerido

`ProgressBar` variant `'default'` (mapeado a `bg-teal-500`, usado también para estado "queued" en algunas vistas) y un eventual estado visual para `semantic-queue` (`#8B5CF6`) **no tienen** glow dedicado hoy (`ANIMATED_GLOWS` solo cubre `download`/`success`/`error`). Si `IMPLEMENTATION_PLAN.md` (Fase "ProgressBar neón") requiere glow para el estado "en cola", se añade formalmente:

```
'glow-queue': '0 0 8px 0 rgba(139,92,246,0.35)'   // basado en semantic.queue
```

Mismo patrón que los glows existentes — solo extensión aditiva, sin tocar los 5 ya definidos.

---

## 8. Bordes y radios

Sin cambios:

- **Radios**: `rounded-none` (0px) para tracks/fills de `ProgressBar` (regla explícita "las barras son rectangulares"), `rounded-sm` (2px), `rounded-md` (4px, default de botones/cards), `rounded-lg` (8px), `rounded-xl` (12px), `rounded-full`.
- **Bordes**: `border` (`#1E2D3D`), `border-subtle`, `border-focus`, `border-error`.

Elementos decorativos vNext (marcos metálicos, "puerta de vidrio") se construyen combinando estos radios/bordes + `backdrop-blur-*` (utilidad nativa de Tailwind, sin tokens nuevos) — no se introduce un radio "industrial" adicional salvo necesidad demostrada.

---

## 9. Sistema de animaciones

### 9.1 Animaciones canónicas actuales

| Token | Definición | Propiedad animada |
|---|---|---|
| `animate-pulse-neon` | `pulseNeon` — `opacity 1 → 0.6 → 1`, 2s ease-in-out infinite | `opacity` |
| `animate-shimmer` | `shimmer` — `background-position`, 1500ms linear infinite | `background-position` |
| `animate-progress-indeterminate` | `progressIndeterminate` — `translateX(-100% → 400%)`, 1500ms ease-in-out infinite | `transform` |

### 9.2 Animaciones vNext requeridas

Todas deben definirse como `keyframes`/`animation` en `tailwind.config.ts` (o variantes de Framer Motion equivalentes), y **todas** operan sobre `transform`, `opacity` o `box-shadow` (nunca `width`/`height`/`top`/`left`/`margin` de forma continua, para evitar layout shift):

| Token propuesto | Propiedad | Patrón | Uso previsto |
|---|---|---|---|
| `animate-neon-flicker` | `opacity` | Keyframes con `animation-delay` distinto por elemento (parpadeo "orgánico" por letra) | Letrero "MUSIC 4 ALL" (Login) |
| `animate-vinyl-spin` | `transform: rotate` | `360deg`, linear, infinite | Vinilo girando (Login durante polling, Dashboard decorativo) |
| `animate-particle-drift` | `transform: translateY` + `opacity` | Ascenso lento + fade, infinite, duración/desfase aleatorios por instancia | `NeonParticles` |
| `animate-laser-scan` | `transform: translateY` | Barrido vertical, baja frecuencia (no infinito o con pausa larga) | Escáner láser (Login), líneas en PlayerBar |
| `animate-glitch-shake` | `transform: translate/skew` | Duración corta, **finita** (no infinite), disparada por evento (error) | Glitch de error en código OAuth |
| `animate-progress-breathe` | `box-shadow` (opacidad del glow) | Pulso suave, infinite mientras `animated=true` | "Latido" de `ProgressBar` durante descarga activa |

**Excepción documentada**: `animate-progress-breathe` anima `box-shadow` (no `transform`/`opacity` puros). Se acepta porque `box-shadow` no provoca layout shift (solo repaint), y es el mecanismo ya usado por `ANIMATED_GLOWS` en `ProgressBar`. No se generaliza a otros efectos sin justificación equivalente.

---

## 10. Accesibilidad visual

### 10.1 `prefers-reduced-motion` — política obligatoria

**Estado actual**: no existe ningún guard de `prefers-reduced-motion` en el código (`globals.css` no lo referencia, ningún componente lo consulta). Esto es una **deuda existente** (ver `docs/roadmap.md` §4) que se convierte en **bloqueante** para esta iniciativa: ninguna animación continua nueva (§9.2) puede mergearse sin que `globals.css` defina primero el guard global.

**Regla**: bajo `@media (prefers-reduced-motion: reduce)`, las siguientes animaciones deben desactivarse o sustituirse por un estado estático equivalente:

| Animación | Comportamiento con `reduce` |
|---|---|
| `animate-particle-drift` | Partículas estáticas (sin movimiento) u ocultas |
| `animate-vinyl-spin` | Vinilo estático (sin rotación) |
| `animate-neon-flicker` | Letrero en estado "encendido" fijo, sin parpadeo |
| `animate-laser-scan` | Oculto |
| `animate-progress-breathe` | `ProgressBar` muestra el glow estático (sin pulso) |
| `animate-glitch-shake` | El mensaje de error aparece sin shake, solo con el borde `semantic-error` |
| `AudioWaves` (ondas de ecualizador) | Oculto o barras estáticas |

### 10.2 WCAG 2.3.1 — límite de destellos

Aplica directamente a: `animate-neon-flicker` (letrero), `animate-laser-scan` (escáner), `animate-glitch-shake` (error). Regla dura: **frecuencia ≤ 3 destellos/segundo** y área/contraste limitados — ningún efecto puede cubrir una porción grande de la pantalla con alto contraste a esa frecuencia. Esto se valida manualmente en QA de cada fase que introduzca uno de estos efectos (ver `IMPLEMENTATION_PLAN.md`).

### 10.3 Elementos accesibles existentes — no negociables

El rediseño es una capa visual sobre estos elementos, que deben preservarse intactos:

- Skip-link (`(app)/layout.tsx`).
- `aria-live`/`role="status"`/`role="alert"` en `LoginForm` y regiones dinámicas de `PlayerBar`/`DownloadPanel`.
- `focus-visible:shadow-glow-focus` en todos los elementos interactivos.
- El `<a href={verificationUriComplete}>` real y el texto de `userCode` en `LoginForm` — cualquier "display retro"/"ticket" es un **skin envolvente**, no un reemplazo de estos nodos.
- Roles ARIA de `ProgressBar` (`role="progressbar"`, `aria-valuenow/min/max/text`) y de `AlbumCard` (`article` + botones etiquetados).

---

## 11. Performance budget para animaciones

1. **Aislamiento**: componentes puramente decorativos (`NeonParticles`, `AudioWaves`, líneas láser, letrero) son `pointer-events-none`, `aria-hidden="true"`, y **no** se suscriben a `downloads.store`, `player.store`, `auth.store` ni al WebSocket. Las actualizaciones de progreso (varias/segundo durante una descarga) no deben re-renderizar capas decorativas.
2. **Sin `setInterval`/`setState` para movimiento continuo**: usar `@keyframes` CSS o Framer Motion con `animate`/`transition` declarativos (montados una vez). Si se necesita aleatoriedad por instancia (ej. desfase de partículas), calcularla una sola vez al montar (no en cada frame).
3. **Solo `transform`/`opacity`/`box-shadow`**: ninguna animación continua debe modificar propiedades que disparen layout (`width`, `height`, `top`, `left`, `margin`, `padding`) — excepción ya documentada en §9.2 para `box-shadow`.
4. **`will-change: transform`**: aplicar solo a capas con animación persistente (partículas, vinilo, ondas), no de forma global.
5. **Métrica de aceptación**: durante una descarga activa (mensajes WS `progress` llegando), el árbol de componentes decorativos no debe aparecer en el profiler de React como re-renderizado.

---

## 12. Reglas de consistencia visual (obligatorias)

1. Nunca introducir un tercer sistema de diseño paralelo (ver §1).
2. Todo nuevo color debe convertirse en token del design system (§2.3) — nunca hex inline.
3. No usar estilos inline para colores (`style={{ color: '#...' }}` / `style={{ boxShadow: '...' }}` con hex literal) — usar clases Tailwind o, si es estrictamente necesario un valor dinámico, `var(--color-*)`.
4. No romper la compatibilidad con Tailwind existente — extensiones son aditivas (`tailwind.config.ts` → `theme.extend`).
5. Mantener soporte completo para dark mode — el proyecto es dark-first por diseño (no hay modo claro); ninguna extensión debe asumir un fondo claro.
6. Toda animación nueva debe tener una estrategia `prefers-reduced-motion` definida (§10.1) antes de mergearse.
7. Ninguna animación puede depender de `setInterval` o re-render continuo (§11.2).
8. Priorizar `transform` y `opacity` sobre propiedades que generen layout shift (§9.2, §11.3).

---

## 13. Componentes canónicos vs. legacy

| Categoría | Componente | Ruta | Estado |
|---|---|---|---|
| **Canónico** | `Button` | `frontend/src/shared/ui/Button/Button.tsx` | Activo — variantes `primary/secondary/ghost/danger/icon-only`. vNext añade `'neon'` de forma aditiva al `Record<ButtonVariant, string>`. |
| **Canónico** | `ProgressBar` | `frontend/src/shared/ui/ProgressBar/ProgressBar.tsx` | Activo — contrato `value/variant/size/animated/label` usado por `DownloadPanel`, `/downloads`, `PlayerBar`. No romper props. |
| **Canónico** | `AlbumCard` | `frontend/src/features/search/ui/AlbumCard.tsx` | Activo — componente real de "vinyl card" (props `album/onOpen/onDownload`). Cualquier "VinylCard" vNext es un skin/wrapper de este componente, no un reemplazo con props distintas. |
| **Canónico** | `Badge`, `Card` | `frontend/src/shared/ui/` | Activos — base de "puerta de vidrio" (`Card` + `backdrop-blur`) y badges de calidad (`resolveQualityBadge`). |
| **Canónico** | `LoginForm` | `frontend/src/features/auth/ui/LoginForm.tsx` | Activo — máquina de estados v2 (`!deviceAuth` / `deviceAuth` pendiente / `authorized` / error). Base de todo el rediseño de Login. |
| **Legacy (no extender)** | `colors.neon.*`, `colors.dark.*`, `.text-neon-*`, `.border-neon-*`, `shadow-neon-*` | `tailwind.config.ts`, `globals.css` | Compatibilidad únicamente — no usar como referencia para vNext. |
| **Legacy (código muerto)** | `src/components/VinylCard.tsx`, `src/components/NeonTitle.tsx`, `src/components/ProgressBar.tsx`, `src/store/useAppStore.ts` | `frontend/src/components/`, `frontend/src/store/` | No referenciados por el árbol v2. No usar como punto de partida — limpieza independiente (ver `docs/roadmap.md`). |

---

## 14. Restricciones visuales obligatorias — resumen ejecutivo

- Nunca introducir un tercer sistema de diseño paralelo.
- Todo nuevo color → token del design system (extensión formal en `tailwind.config.ts` + `globals.css`).
- No hex inline, no estilos inline para color.
- No romper compatibilidad con Tailwind existente (cambios aditivos en `theme.extend`).
- Mantener soporte completo para dark mode (el proyecto es dark-first).
- Toda animación → estrategia `prefers-reduced-motion`.
- Ninguna animación por `setInterval`/re-render continuo.
- `transform`/`opacity` (y `box-shadow` solo para glow) por encima de propiedades que generan layout shift.
