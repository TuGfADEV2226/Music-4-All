import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'

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
 * E2E — Accessibility (axe-core).
 *
 * Recorre las vistas clave (login, dashboard, álbum, artista, Now Playing,
 * historial, biblioteca, ajustes y el panel de descargas con trabajos vivos) y
 * falla ante cualquier violación Critical o Serious de WCAG 2.1 A/AA.
 *
 * `color-contrast` fue deuda rastreada (no bloqueaba) hasta la Fase 0.E: el
 * token `text-disabled` (#4D6278) da 2.1-3.1:1 sobre las superficies y no llega
 * al 4.5:1 de WCAG AA. En vez de aclararlo hasta casi `text-secondary` — que
 * aplanaría la jerarquía de tres niveles del diseño — se reclasificó a
 * `text-secondary` (5.2-7.6:1) el texto informativo que hay que leer.
 * `text-disabled` queda solo para iconos decorativos y controles inactivos,
 * que WCAG 1.4.3 exime. Ya no hay excepciones: la lista está vacía a propósito.
 *
 * All backend calls are mocked via page.route(); no real backend/Tidal needed.
 * Fixture covers use empty strings so no external image request is made.
 */

const BLOCKING_IMPACTS = new Set(['critical', 'serious'])

/** Serious/critical rules reported but not blocked. Vacío desde la Fase 0.E. */
const TRACKED_DEBT_RULES = new Set<string>()

/**
 * Espera a que terminen las animaciones de entrada antes de medir.
 *
 * axe calcula el contraste sobre el color **compuesto**, así que un elemento a
 * mitad de su fade-in reporta un contraste que no es el que ve el usuario
 * (`text-secondary` al 71 % de opacidad da 4.32:1 en vez de 7.9:1, y recién
 * empezado 1.1:1). Sin esta espera el resultado depende de cuándo llegue axe.
 *
 * Dos partes, porque ninguna basta sola: la espera fija cubre las animaciones
 * que framer-motion resuelve en JS (no aparecen en `getAnimations()`) y las que
 * aún no se han creado cuando se mide; el bucle sobre WAAPI cubre las
 * encadenadas. Se excluyen las infinitas (shimmer, pulso neón): no terminan.
 */
const ENTRANCE_ANIMATION_MS = 700

async function settleAnimations(page: Page): Promise<void> {
  await page.waitForTimeout(ENTRANCE_ANIMATION_MS)
  await page.evaluate(async () => {
    const pending = () =>
      document.getAnimations().filter((a) => (a.effect?.getTiming().iterations ?? 1) !== Infinity)
    for (let round = 0; round < 3; round += 1) {
      const running = pending()
      if (running.length === 0) break
      await Promise.all(running.map((a) => a.finished.catch(() => undefined)))
    }
  })
}

/** Analyze the current page and fail if any Critical/Serious violation exists. */
async function expectNoBlockingViolations(page: Page, view: string): Promise<void> {
  await settleAnimations(page)

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  const seriousOrCritical = violations.filter(
    (v) => v.impact != null && BLOCKING_IMPACTS.has(v.impact),
  )
  const blocking = seriousOrCritical.filter((v) => !TRACKED_DEBT_RULES.has(v.id))
  const debt = seriousOrCritical.filter((v) => TRACKED_DEBT_RULES.has(v.id))

  if (debt.length > 0) {
    // Visible in test output so new contrast regressions are noticed, without
    // blocking the gate (tracked design debt — see file header / roadmap).
    // eslint-disable-next-line no-console
    console.warn(
      `[a11y tracked-debt] ${view}: ` +
        debt.map((v) => `${v.id} (${v.nodes.length} node(s))`).join(', '),
    )
  }

  const report = blocking
    .map(
      (v) =>
        `  [${v.impact}] ${v.id} — ${v.help}\n` +
        v.nodes.map((n) => `      ${n.target.join(' ')}`).join('\n'),
    )
    .join('\n')

  expect(blocking, `Critical/Serious a11y violations on ${view}:\n${report}`).toEqual([])
}

test.describe('Accessibility (axe) — no Critical/Serious violations', () => {
  test('login', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /connect with tidal/i })).toBeVisible()
    await expectNoBlockingViolations(page, 'login')
  })

  test('dashboard (empty state)', async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockSessionUpkeep(page)
    await mockSilentDownloadSocket(page)

    await page.goto('/dashboard')
    await expect(
      page.getByRole('textbox', { name: 'Search albums, tracks, or paste a Tidal URL' }),
    ).toBeVisible()
    await expectNoBlockingViolations(page, 'dashboard')
  })

  test('album page', async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockSessionUpkeep(page)
    await mockSilentDownloadSocket(page)
    await mockAlbumDetail(page)

    await page.goto(`/album/${TOXICITY_ALBUM_DTO.id}`)
    await expect(page.getByRole('heading', { name: TOXICITY_ALBUM_DTO.title })).toBeVisible()
    await expectNoBlockingViolations(page, 'album page')
  })

  test('artist page', async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockSessionUpkeep(page)
    await mockSilentDownloadSocket(page)
    await mockArtistDetail(page)

    await page.goto(`/artist/${ARTIST_DETAIL.artist.id}`)
    await expect(
      page.getByRole('heading', { level: 1, name: ARTIST_DETAIL.artist.name }),
    ).toBeVisible()
    await expectNoBlockingViolations(page, 'artist page')
  })

  test('now playing (Walkman) overlay', async ({ page }) => {
    // La vista expandida se abre desde la carátula de la PlayerBar, que solo
    // existe en móvil: en lg+ el reproductor vive como Walkman en el sidebar
    // (ver PlayerBar.tsx). Con el viewport por defecto (1280) no hay botón que
    // pulsar, así que este caso se audita en la disposición donde existe.
    await page.setViewportSize({ width: 390, height: 844 })
    await hideNextDevOverlay(page)
    await mockAuthenticatedSession(page)
    await mockSessionUpkeep(page)
    await mockSilentDownloadSocket(page)
    await mockArtistDetail(page)
    // Stream is proxied to <audio>; an empty body is enough — the store sets
    // `current` synchronously, so the overlay is present regardless of decode.
    await page.route('**/api/download/stream/**', (route) =>
      route.fulfill({ status: 200, contentType: 'audio/mpeg', body: '' }),
    )

    await page.goto(`/artist/${ARTIST_DETAIL.artist.id}`)
    await page
      .getByRole('button', { name: `Play ${ARTIST_DETAIL.artist.name}'s top tracks` })
      .click()
    await page.getByRole('button', { name: 'Open Now Playing player' }).click()

    await expect(page.getByRole('dialog', { name: 'Now Playing player' })).toBeVisible()
    await expectNoBlockingViolations(page, 'now playing overlay')
  })

  test('history', async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockSessionUpkeep(page)
    await mockSilentDownloadSocket(page)
    await mockHistory(page)

    await page.goto('/history')
    await expect(page.getByRole('heading', { name: 'Download History' })).toBeVisible()
    await expectNoBlockingViolations(page, 'history')
  })

  test('library', async ({ page }) => {
    // La biblioteca se construye agrupando el historial: mismo mock.
    await mockAuthenticatedSession(page)
    await mockSessionUpkeep(page)
    await mockSilentDownloadSocket(page)
    await mockHistory(page)

    await page.goto('/library')
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
    await expectNoBlockingViolations(page, 'library')
  })

  test('settings', async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockSessionUpkeep(page)
    await mockSilentDownloadSocket(page)
    await mockSettingsEndpoints(page)

    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expectNoBlockingViolations(page, 'settings')
  })

  test('download panel with an active and a failed job', async ({ page }) => {
    // Los estados del panel (badges de estado, barra de progreso, mensaje de
    // error con role=alert) no aparecen en ninguna de las vistas de arriba y
    // son justo donde vive el color semántico: se auditan con dos trabajos
    // reales conducidos por el WebSocket, como en download-flow.spec.
    await mockAuthenticatedSession(page)
    await mockSessionUpkeep(page)
    await mockSearch(page)

    let jobSeq = 0
    await page.route('**/api/downloads', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback()
        return
      }
      jobSeq += 1
      await route.fulfill({
        json: { job_id: `job-${jobSeq}`, status: 'queued', estimated_tracks: 14 },
      })
    })

    let wsRoute: WebSocketRoute | undefined
    await page.routeWebSocket('**/ws/downloads', (ws) => {
      wsRoute = ws
    })

    await page.goto('/dashboard')
    await fillGlobalSearch(page, 'System of a Down')

    const albumCard = page.getByRole('article', {
      name: `${TOXICITY_ALBUM_DTO.title} by ${TOXICITY_ALBUM_DTO.artist.name}, 2001`,
    })
    const downloadButton = albumCard.getByRole('button', {
      name: `Download ${TOXICITY_ALBUM_DTO.title} by ${TOXICITY_ALBUM_DTO.artist.name}`,
    })
    await downloadButton.click()
    await expect(page.getByRole('region', { name: 'Download panel' })).toBeVisible()
    await downloadButton.click()
    // Acotado a la lista del panel: la barra lateral también tiene listitems.
    const jobList = page.getByRole('list', { name: /download job/ })
    await expect(jobList.getByRole('listitem')).toHaveCount(2)

    await expect.poll(() => wsRoute !== undefined).toBe(true)
    wsRoute!.send(JSON.stringify({ type: 'job_started', job_id: 'job-1', payload: {} }))
    wsRoute!.send(
      JSON.stringify({
        type: 'progress',
        job_id: 'job-1',
        payload: {
          current_track_filename: '01 - Prison Song.flac',
          completed_tracks: 3,
          total_tracks: 14,
          progress_percent: 45,
          speed_mbps: 2.4,
          eta_seconds: 90,
        },
      }),
    )
    wsRoute!.send(JSON.stringify({ type: 'job_started', job_id: 'job-2', payload: {} }))
    wsRoute!.send(
      JSON.stringify({
        type: 'job_error',
        // 500 y no 401/403: un error de sesión abriría el modal de recuperación
        // y lo auditado dejaría de ser el panel.
        job_id: 'job-2',
        payload: { code: 500, message: 'Download failed', retriable: true },
      }),
    )

    await expect(jobList.getByText('ACTIVE', { exact: true })).toBeVisible()
    await expect(jobList.getByText('ERROR', { exact: true })).toBeVisible()
    await expectNoBlockingViolations(page, 'download panel (active + error)')
  })
})
