import { expect, test, type WebSocketRoute } from '@playwright/test'

import { buildSearchResponse, TOXICITY_ALBUM_DTO } from '../fixtures/album'
import { mockAuthenticatedSession } from '../utils/auth'
import { fillGlobalSearch } from '../utils/search'

/**
 * E2E — Download flow (`/dashboard` → DownloadPanel → `/history`).
 *
 * Mocks:
 *  - GET  /search    → one album result (Toxicity)
 *  - POST /downloads → enqueues a job (job-abc123)
 *  - WS   /ws/downloads → routeWebSocket(), drives job_started / progress /
 *    job_completed messages that downloads.store consumes via
 *    useDownloadSocket()
 *  - GET  /history   → completed record (separate test)
 *
 * NOTE: completion does not trigger a browser file download — the worker
 * writes the file to disk server-side and reports `output_path` via
 * job_completed. The observable completion signals in the UI are the
 * "DONE" status badge and the "Download complete" message.
 */

const JOB_ID = 'job-abc123'

test.describe('Download flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page)

    await page.route('**/api/search**', async (route) => {
      await route.fulfill({ json: buildSearchResponse() })
    })
  })

  test('starts a download, tracks progress via WebSocket, and shows completion', async ({
    page,
  }) => {
    await page.route('**/api/downloads', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback()
        return
      }
      await route.fulfill({
        json: { job_id: JOB_ID, status: 'queued', estimated_tracks: TOXICITY_ALBUM_DTO.number_of_tracks },
      })
    })

    let wsRoute: WebSocketRoute | undefined
    await page.routeWebSocket('**/ws/downloads', (ws) => {
      wsRoute = ws
      ws.onMessage((message) => {
        const data = JSON.parse(String(message)) as { type?: string; timestamp?: number }
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: data.timestamp }))
        }
      })
    })

    await page.goto('/dashboard')

    await fillGlobalSearch(page, 'System of a Down')

    const albumCard = page.getByRole('article', {
      name: `${TOXICITY_ALBUM_DTO.title} by ${TOXICITY_ALBUM_DTO.artist.name}, 2001`,
    })
    await expect(albumCard).toBeVisible()

    await albumCard
      .getByRole('button', { name: `Download ${TOXICITY_ALBUM_DTO.title} by ${TOXICITY_ALBUM_DTO.artist.name}` })
      .click()

    // ── Job appears in the download panel as "queued" ─────────────────────
    const downloadPanel = page.getByRole('region', { name: 'Download panel' })
    await expect(downloadPanel).toBeVisible()

    const jobItem = page.locator(
      `[aria-label^="Download: ${TOXICITY_ALBUM_DTO.title} by ${TOXICITY_ALBUM_DTO.artist.name}"]`
    )
    await expect(jobItem).toBeVisible()
    await expect(jobItem.getByText('QUEUED')).toBeVisible()

    await expect.poll(() => wsRoute !== undefined, { message: 'WS client should connect' }).toBe(true)

    // ── job_started → ACTIVE ───────────────────────────────────────────────
    wsRoute!.send(
      JSON.stringify({
        type: 'job_started',
        job_id: JOB_ID,
        payload: { started_at: new Date().toISOString() },
      })
    )
    await expect(jobItem.getByText('ACTIVE')).toBeVisible()

    // ── progress → ProgressBar advances ────────────────────────────────────
    wsRoute!.send(
      JSON.stringify({
        type: 'progress',
        job_id: JOB_ID,
        payload: {
          current_track_filename: '01 - Prison Song.flac',
          completed_tracks: 3,
          total_tracks: TOXICITY_ALBUM_DTO.number_of_tracks,
          progress_percent: 45,
          speed_mbps: 2.4,
          eta_seconds: 90,
        },
      })
    )
    await expect(jobItem.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '45')

    // ── job_completed → DONE + "Download complete" ─────────────────────────
    wsRoute!.send(
      JSON.stringify({
        type: 'job_completed',
        job_id: JOB_ID,
        payload: {
          output_path: '/downloads/System of a Down/Toxicity',
          completed_at: new Date().toISOString(),
          total_tracks: TOXICITY_ALBUM_DTO.number_of_tracks,
        },
      })
    )
    await expect(jobItem.getByText('DONE')).toBeVisible()
    await expect(jobItem.getByText('Download complete')).toBeVisible()
    await expect(jobItem.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  test('a completed download appears in the history list', async ({ page }) => {
    await page.routeWebSocket('**/ws/downloads', () => {})

    await page.route('**/api/history**', async (route) => {
      await route.fulfill({
        json: [
          {
            id: 'history-1',
            title: TOXICITY_ALBUM_DTO.title,
            artist: TOXICITY_ALBUM_DTO.artist.name,
            quality: '44.1kHz / 16bit (FLAC)',
            cover_url: null,
            job_id: JOB_ID,
            downloaded_at: new Date().toISOString(),
          },
        ],
      })
    })

    await page.goto('/history')

    await expect(page.getByRole('heading', { name: 'Download History' })).toBeVisible()

    const historyItem = page.getByRole('listitem', {
      name: `${TOXICITY_ALBUM_DTO.title} by ${TOXICITY_ALBUM_DTO.artist.name} — 44.1kHz / 16bit (FLAC)`,
    })
    await expect(historyItem).toBeVisible()
  })
})
