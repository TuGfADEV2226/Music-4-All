import type { Page } from '@playwright/test'

import {
  ACTIVE_SESSIONS,
  ARTIST_DETAIL,
  buildSearchResponse,
  CHOP_SUEY_TRACK,
  HISTORY_RECORDS,
  TOXICITY_ALBUM_DTO,
} from '../fixtures/album'

/**
 * Mocks de red compartidos por las suites que solo necesitan que una vista se
 * pinte con datos realistas (a11y, layout móvil). Cada uno cubre un endpoint;
 * las suites de flujo siguen definiendo los suyos porque necesitan controlar
 * las respuestas caso a caso.
 */

/** WS de progreso aceptado y en silencio: sin él el panel reintenta conectar. */
export async function mockSilentDownloadSocket(page: Page): Promise<void> {
  await page.routeWebSocket('**/ws/downloads', () => {})
}

export async function mockSearch(page: Page): Promise<void> {
  await page.route('**/api/search**', (route) => route.fulfill({ json: buildSearchResponse() }))
}

export async function mockAlbumDetail(page: Page): Promise<void> {
  await page.route('**/api/albums/**', (route) =>
    route.fulfill({ json: { album: TOXICITY_ALBUM_DTO, tracks: [CHOP_SUEY_TRACK] } }),
  )
}

export async function mockArtistDetail(page: Page): Promise<void> {
  await page.route('**/api/artists/**', (route) => route.fulfill({ json: ARTIST_DETAIL }))
}

/** `/history` alimenta la página de historial y también la biblioteca. */
export async function mockHistory(page: Page): Promise<void> {
  await page.route('**/api/history**', (route) => route.fulfill({ json: HISTORY_RECORDS }))
}

/** Panel de sesiones activas. El estado PKCE va en `mockSessionUpkeep`. */
export async function mockSettingsEndpoints(page: Page): Promise<void> {
  await page.route('**/api/session/sessions', (route) => route.fulfill({ json: ACTIVE_SESSIONS }))
}

/**
 * Llamadas de fondo que hace toda vista autenticada: el keepalive del vigilante
 * de inactividad y el estado de la sesión Hi-Fi. Sin backend fallan, y el error
 * de red acaba en la consola del navegador (Firefox lo reporta como "XML
 * Parsing Error" al intentar leer el cuerpo del proxy) — ruido que ensucia el
 * gate de consola de `mobile-layout.spec`.
 */
export async function mockSessionUpkeep(page: Page): Promise<void> {
  await page.route('**/api/session/keepalive', (route) =>
    route.fulfill({ json: { idle_ttl_seconds: 1800 } }),
  )
  await page.route('**/api/session/pkce/status', (route) =>
    route.fulfill({ json: { connected: false } }),
  )
}
