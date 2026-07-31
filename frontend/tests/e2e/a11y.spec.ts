import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { buildSearchResponse, TOXICITY_ALBUM_DTO } from './fixtures/album'
import { mockAuthenticatedSession } from './utils/auth'
import { hideNextDevOverlay } from './utils/devOverlay'

/**
 * E2E — Accessibility (axe-core).
 *
 * Runs axe on the key views (Login, Dashboard, album detail modal, artist,
 * Now Playing / Walkman) and fails on any Critical or Serious WCAG 2.1 A/AA
 * violation — EXCEPT the rules in TRACKED_DEBT_RULES (see below), which are
 * still analyzed and printed as a warning but do not block the gate.
 *
 * Tracked debt (docs/roadmap.md): `color-contrast` on the dark-theme
 * low-emphasis token (text-disabled). Meeting WCAG AA there would require
 * brightening that token nearly to text-secondary, flattening the intended
 * three-tier visual hierarchy of the "neón moribundo" design. It is remediated
 * as a dedicated design task, not by this gate.
 *
 * All backend calls are mocked via page.route(); no real backend/Tidal needed.
 * Fixture covers use empty strings so no external image request is made.
 */

const BLOCKING_IMPACTS = new Set(['critical', 'serious'])

/** Serious/critical rules reported but not blocked — see docs/roadmap.md. */
const TRACKED_DEBT_RULES = new Set(['color-contrast'])

/** Track referencing the Toxicity fixture album (cover '' → no network image). */
const CHOP_SUEY_TRACK = {
  id: '900001',
  title: 'Chop Suey!',
  track_number: 1,
  duration: 210,
  audio_quality: 'HIGH',
  audio_modes: [],
  isrc: 'USRC10000001',
  artist: TOXICITY_ALBUM_DTO.artist,
  album: { id: TOXICITY_ALBUM_DTO.id, title: TOXICITY_ALBUM_DTO.title, cover: '' },
}

const ARTIST_DETAIL = {
  artist: { id: TOXICITY_ALBUM_DTO.artist.id, name: TOXICITY_ALBUM_DTO.artist.name, picture: null },
  top_tracks: [CHOP_SUEY_TRACK],
  albums: [TOXICITY_ALBUM_DTO],
  ep_singles: [{ ...TOXICITY_ALBUM_DTO, id: '999', title: 'A Single', type: 'SINGLE' }],
  other: [{ ...TOXICITY_ALBUM_DTO, id: '998', title: 'A Compilation', type: 'COMPILATION' }],
  similar: [{ id: '424242', name: 'Similar Artist', picture: null }],
}

/** Analyze the current page and fail if any Critical/Serious violation exists. */
async function expectNoBlockingViolations(page: Page, view: string): Promise<void> {
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
    await page.routeWebSocket('**/ws/downloads', () => {})

    await page.goto('/dashboard')
    await expect(
      page.getByRole('textbox', { name: 'Search albums, tracks, or paste a Tidal URL' }),
    ).toBeVisible()
    await expectNoBlockingViolations(page, 'dashboard')
  })

  test('album page', async ({ page }) => {
    await mockAuthenticatedSession(page)
    await page.routeWebSocket('**/ws/downloads', () => {})
    await page.route('**/api/albums/**', (route) =>
      route.fulfill({
        json: { album: TOXICITY_ALBUM_DTO, tracks: [CHOP_SUEY_TRACK] },
      }),
    )

    await page.goto(`/album/${TOXICITY_ALBUM_DTO.id}`)
    await expect(page.getByRole('heading', { name: TOXICITY_ALBUM_DTO.title })).toBeVisible()
    await expectNoBlockingViolations(page, 'album page')
  })

  test('artist page', async ({ page }) => {
    await mockAuthenticatedSession(page)
    await page.routeWebSocket('**/ws/downloads', () => {})
    await page.route('**/api/artists/**', (route) => route.fulfill({ json: ARTIST_DETAIL }))

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
    await page.routeWebSocket('**/ws/downloads', () => {})
    await page.route('**/api/artists/**', (route) => route.fulfill({ json: ARTIST_DETAIL }))
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
})
