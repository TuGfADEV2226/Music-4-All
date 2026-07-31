import { expect, test } from '@playwright/test'

import { buildSearchResponse, TOXICITY_ALBUM_DTO } from '../fixtures/album'
import { mockAuthenticatedSession } from '../utils/auth'
import { fillGlobalSearch } from '../utils/search'

/**
 * E2E — Dashboard search (`/dashboard`).
 *
 * Seeds an authenticated session directly into auth.store (localStorage) so
 * the test starts on the dashboard without going through the Tidal device
 * auth flow, and mocks GET /search.
 */

test.describe('Dashboard search', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page)
    // DownloadPanel mounts useDownloadSocket() on every (app) route.
    await page.routeWebSocket('**/ws/downloads', () => {})
  })

  test('typing a query shows matching album results', async ({ page }) => {
    await page.route('**/api/search**', async (route) => {
      const url = new URL(route.request().url())
      expect(url.searchParams.get('q')).toBe('System of a Down')
      await route.fulfill({ json: buildSearchResponse() })
    })

    await page.goto('/dashboard')

    await fillGlobalSearch(page, 'System of a Down')

    const albumCard = page.getByRole('article', {
      name: `${TOXICITY_ALBUM_DTO.title} by ${TOXICITY_ALBUM_DTO.artist.name}, 2001`,
    })
    await expect(albumCard).toBeVisible()
    await expect(albumCard.getByRole('heading', { name: TOXICITY_ALBUM_DTO.title })).toBeVisible()
    await expect(albumCard.getByText(TOXICITY_ALBUM_DTO.artist.name)).toBeVisible()
  })

  test('shows the "no results" state for a query with no matches', async ({ page }) => {
    await page.route('**/api/search**', async (route) => {
      await route.fulfill({ json: buildSearchResponse([]) })
    })

    await page.goto('/dashboard')

    await fillGlobalSearch(page, 'a query with absolutely no matches')

    await expect(page.getByRole('heading', { name: 'No results found' })).toBeVisible()
  })

  test('clicking an album navigates to the album page', async ({ page }) => {
    await page.route('**/api/search**', async (route) => {
      await route.fulfill({ json: buildSearchResponse() })
    })

    // Mock album detail endpoint (album page fetches it on navigation)
    await page.route('**/api/albums/**', async (route) => {
      await route.fulfill({
        json: {
          album: TOXICITY_ALBUM_DTO,
          tracks: [
            {
              id: '1',
              title: 'Prison Song',
              track_number: 1,
              duration: 210,
              audio_quality: 'HIGH',
              audio_modes: [],
              isrc: 'USRC12345001',
              artist: { id: '11069', name: 'System of a Down' },
              album: { id: TOXICITY_ALBUM_DTO.id, title: TOXICITY_ALBUM_DTO.title },
            },
          ],
        },
      })
    })

    await page.goto('/dashboard')

    await fillGlobalSearch(page, 'System of a Down')

    const albumCard = page.getByRole('article', {
      name: `${TOXICITY_ALBUM_DTO.title} by ${TOXICITY_ALBUM_DTO.artist.name}, 2001`,
    })
    await expect(albumCard).toBeVisible()

    // The vinyl cover links to the dedicated album page (A3 — no more modal).
    await albumCard.getByRole('link', { name: `Open ${TOXICITY_ALBUM_DTO.title}` }).click()

    await expect(page).toHaveURL(new RegExp(`/album/${TOXICITY_ALBUM_DTO.id}$`))
    await expect(page.getByRole('heading', { name: TOXICITY_ALBUM_DTO.title })).toBeVisible()
  })
})
