import { expect, test, type Page } from '@playwright/test'

import { ARTIST_DETAIL, TOXICITY_ALBUM_DTO } from './fixtures/album'
import { mockAuthenticatedSession } from './utils/auth'
import { hideNextDevOverlay } from './utils/devOverlay'
import {
  mockAlbumDetail,
  mockArtistDetail,
  mockHistory,
  mockSearch,
  mockSessionUpkeep,
  mockSettingsEndpoints,
  mockSilentDownloadSocket,
} from './utils/mocks'
import { fillGlobalSearch } from './utils/search'

/**
 * E2E — Layout móvil (gate de la Fase 0.E: "sin colapsos en móvil").
 *
 * Comprueba en un viewport de teléfono que **ninguna vista desborda en
 * horizontal**. Es el síntoma medible del layout roto: una tarjeta, una tabla o
 * un texto sin `truncate` que se sale ensancha el documento y obliga a arrastrar
 * la página de lado, con parte del contenido fuera de la pantalla.
 *
 * Se mide `documentElement.scrollWidth` contra el ancho del viewport porque es
 * lo que decide si aparece la barra horizontal, no el ancho de un nodo suelto:
 * así se detecta el desbordamiento venga de donde venga.
 *
 * Todas las llamadas al backend van mockeadas (utils/mocks).
 */

const PHONE = { width: 390, height: 844 } // iPhone 14/15 en CSS px

/** Margen de 1 px: el redondeo de subpíxeles puede dar 390.5 sin desbordar. */
const OVERFLOW_TOLERANCE_PX = 1

async function expectNoHorizontalOverflow(page: Page, view: string): Promise<void> {
  const { scrollWidth, clientWidth, widest } = await page.evaluate(() => {
    const doc = document.documentElement
    // Culpable más probable, para que el fallo diga qué mirar.
    let widest = { tag: '', cls: '', right: 0 }
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const right = el.getBoundingClientRect().right
      if (right > widest.right) {
        widest = { tag: el.tagName.toLowerCase(), cls: el.className?.toString().slice(0, 80) ?? '', right }
      }
    }
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, widest }
  })

  expect(
    scrollWidth,
    `${view}: el documento desborda en horizontal (scrollWidth ${scrollWidth} > ${clientWidth}). ` +
      `Elemento más ancho: <${widest.tag} class="${widest.cls}"> llega a x=${Math.round(widest.right)}.`,
  ).toBeLessThanOrEqual(clientWidth + OVERFLOW_TOLERANCE_PX)
}

/**
 * Errores de consola de la propia app: `console.error` y excepciones sin
 * capturar. Se descarta el ruido de red — sin backend, cualquier llamada que no
 * esté mockeada falla por diseño y cada navegador lo reporta a su manera
 * (Firefox intenta parsear el cuerpo del proxy y lo llama "XML Parsing Error").
 * Los endpoints de fondo sí se mockean (`mockSessionUpkeep`) para no depender
 * de este filtro.
 */
const NETWORK_NOISE =
  /Failed to load resource|net::ERR_|ECONNREFUSED|XML Parsing Error|NetworkError|502 \(Bad Gateway\)|500 \(Internal Server Error\)/

function watchConsoleErrors(page: Page): () => string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (NETWORK_NOISE.test(text)) return
    errors.push(text)
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  return () => errors
}

test.describe('Layout móvil — sin desbordamiento horizontal', () => {
  test.use({ viewport: PHONE })

  let consoleErrors: () => string[]

  test.beforeEach(async ({ page }) => {
    consoleErrors = watchConsoleErrors(page)
    await hideNextDevOverlay(page)
  })

  // Gate de la Fase 0.E: 0 errores de consola en las vistas recorridas.
  test.afterEach(() => {
    expect(consoleErrors(), 'la vista no debe registrar errores de consola').toEqual([])
  })

  test('login', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /connect with tidal/i })).toBeVisible()
    await expectNoHorizontalOverflow(page, 'login')
  })

  test('dashboard con resultados de búsqueda', async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockSessionUpkeep(page)
    await mockSilentDownloadSocket(page)
    await mockSearch(page)

    await page.goto('/dashboard')
    await fillGlobalSearch(page, 'System of a Down')
    await expect(
      page.getByRole('article', {
        name: `${TOXICITY_ALBUM_DTO.title} by ${TOXICITY_ALBUM_DTO.artist.name}, 2001`,
      }),
    ).toBeVisible()
    await expectNoHorizontalOverflow(page, 'dashboard con resultados')
  })

  test('álbum', async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockSessionUpkeep(page)
    await mockSilentDownloadSocket(page)
    await mockAlbumDetail(page)

    await page.goto(`/album/${TOXICITY_ALBUM_DTO.id}`)
    await expect(page.getByRole('heading', { name: TOXICITY_ALBUM_DTO.title })).toBeVisible()
    await expectNoHorizontalOverflow(page, 'álbum')
  })

  test('artista', async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockSessionUpkeep(page)
    await mockSilentDownloadSocket(page)
    await mockArtistDetail(page)

    await page.goto(`/artist/${ARTIST_DETAIL.artist.id}`)
    await expect(
      page.getByRole('heading', { level: 1, name: ARTIST_DETAIL.artist.name }),
    ).toBeVisible()
    await expectNoHorizontalOverflow(page, 'artista')
  })

  test('historial', async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockSessionUpkeep(page)
    await mockSilentDownloadSocket(page)
    await mockHistory(page)

    await page.goto('/history')
    await expect(page.getByRole('heading', { name: 'Download History' })).toBeVisible()
    await expectNoHorizontalOverflow(page, 'historial')
  })

  test('biblioteca', async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockSessionUpkeep(page)
    await mockSilentDownloadSocket(page)
    await mockHistory(page)

    await page.goto('/library')
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
    await expectNoHorizontalOverflow(page, 'biblioteca')
  })

  test('ajustes', async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockSessionUpkeep(page)
    await mockSilentDownloadSocket(page)
    await mockSettingsEndpoints(page)

    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expectNoHorizontalOverflow(page, 'ajustes')
  })

  test('navegación móvil desplegada', async ({ page }) => {
    // El cajón lateral solo existe por debajo de lg: si se saliera del viewport
    // la vista quedaría desplazada mientras está abierto.
    await mockAuthenticatedSession(page)
    await mockSessionUpkeep(page)
    await mockSilentDownloadSocket(page)

    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'Open navigation menu' }).click()
    await expect(page.getByRole('dialog', { name: 'Navigation menu' })).toBeVisible()
    await expectNoHorizontalOverflow(page, 'navegación móvil')
  })
})
