# Legal (Fase 6 — hardening público)

> **Origen: plantillas genéricas, no asesoría legal.** El texto no ha sido revisado
> por un abogado. Los `[placeholders]` YA están rellenados con los datos del operador
> y el banner de "plantilla" fue retirado (ver más abajo). Si en algún momento pasa
> por revisión legal, actualiza el texto en consecuencia.

## Dónde vive el texto legal

Las páginas legales son públicas (fuera del grupo `(app)`, así que el middleware no
las gatea) y viven en el frontend:

| Ruta | Archivo | Contenido |
|---|---|---|
| `/legal` | `frontend/src/app/legal/page.tsx` | Índice |
| `/legal/terms` | `frontend/src/app/legal/terms/page.tsx` | Términos de Servicio |
| `/legal/copyright` | `frontend/src/app/legal/copyright/page.tsx` | Copyright + DMCA |
| `/legal/disclaimer` | `frontend/src/app/legal/disclaimer/page.tsx` | Disclaimer |

El shell común (banner de "plantilla", título, prosa) es
`frontend/src/app/legal/_components/LegalDocument.tsx`.

Puntos de entrada del usuario:
- **Login** (`features/auth/ui/LoginForm.tsx`): aviso "al conectar aceptas…" + enlaces.
- **Ajustes** (`app/(app)/settings/page.tsx`): tarjeta "Legal & about".

## Datos del operador (placeholders ya rellenados)

Servicio operado por una sola persona; todos los "roles" legales recaen en ella:

- **Operador / agente DMCA:** `TuGfA` (alias) — Términos §1 y Copyright §3.
- **Contacto general y DMCA:** `twittersno45@gmail.com` — Términos §9 y Copyright §3.
- **Dirección postal:** omitida a propósito (contacto DMCA **solo por email**). Si se
  quiere una dirección contactable sin exponer el domicilio, añadir un apartado de
  correos como línea `Postal address:` en `copyright/page.tsx`.

El banner amarillo "Template — not legal advice" de `LegalDocument.tsx` fue
**retirado**: estaba pensado para el estado previo a publicar y no debe mostrarse en
una web ya publicada. Las cláusulas que protegen al operador ("as is", sin garantías,
limitación de responsabilidad, no afiliación a Tidal) siguen dentro del propio texto.

## Divulgación del riesgo de revocación del `client_id`

El Disclaimer avisa de que el acceso "puede ser limitado, degradado, suspendido o
**revocado** en cualquier momento". Esto es intencional: el servicio usa un `client_id`
de Tidal compartido y de terceros cuyo baneo es un **riesgo real y no eliminable** del
plan (ver `docs/operations/ANTIABUSE.md` y la alerta `TidalClientIdPossiblyRevoked`).

## No afiliación / marca

Las tres páginas dejan claro que Music 4 All es una herramienta **no oficial** y **no
afiliada** a Tidal. "TIDAL" es marca de sus titulares; se usa solo para describir
interoperabilidad. Revisa este encuadre con tu asesor antes de publicar.
