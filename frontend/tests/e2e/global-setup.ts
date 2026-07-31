import { chromium, type FullConfig } from '@playwright/test'

import { buildSearchResponse, TOXICITY_ALBUM_DTO } from './fixtures/album'
import { fillGlobalSearch } from './utils/search'

const AUTH_STORAGE_KEY = 'music4all-auth'

// Routes with no client-side branches gated behind auth/data state — a
// plain SSR fetch is enough to trigger their on-demand compilation.
const STATIC_ROUTES = ['/login', '/history', '/library', '/downloads', '/settings']

/**
 * Pre-compiles every route (and code path) exercised by the E2E suite
 * before any test runs.
 *
 * `next dev` compiles modules on-demand: a client component is only
 * bundled the first time a render path that imports it actually executes.
 * `/dashboard`'s unauthenticated render returns `null`, so a plain SSR
 * fetch never reaches — and never compiles — `AlbumCard`/`SearchResults`.
 * When a later test logs in, searches, and renders those components for
 * the first time, the resulting on-demand compile triggers a Fast Refresh
 * push that remounts the page and resets its local state (e.g. the search
 * query) mid-test.
 *
 * To avoid that, this setup drives a real browser through the
 * authenticated dashboard + search flow once, up front, so those chunks
 * are already compiled — and any one-time Fast Refresh remount has already
 * happened and settled — before the timed test suite starts.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3000'

  // Wait for the dev server to come up (webServer health check may still be settling).
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await fetch(baseURL)
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    await page.addInitScript(
      ({ key, expiresAt }) => {
        window.localStorage.setItem(
          key,
          JSON.stringify({
            state: {
              status: 'authenticated',
              user: {
                id: 'qa-user-1',
                email: 'qa@music4all.test',
                countryCode: 'US',
                plan: 'HIFI_PLUS',
              },
              expiresAt,
            },
            version: 0,
          })
        )
      },
      { key: AUTH_STORAGE_KEY, expiresAt }
    )

    // Set session cookie so middleware allows access to protected routes
    // (middleware checks `m4a_sid` before client-side auth.store can hydrate)
    const cookieExpiry = Math.floor(Date.now() / 1000) + 7200
    const baseHost = new URL(baseURL).hostname
    await page.context().addCookies([
      { name: 'm4a_sid', value: 'e2e-session', domain: baseHost, path: '/', expires: cookieExpiry },
    ])

    await page.route('**/api/search**', async (route) => {
      await route.fulfill({ json: buildSearchResponse() })
    })
    await page.routeWebSocket('**/ws/downloads', () => {})

    await page.goto(`${baseURL}/dashboard`)

    await fillGlobalSearch(page, 'System of a Down')

    const albumCard = page.getByRole('article', {
      name: `${TOXICITY_ALBUM_DTO.title} by ${TOXICITY_ALBUM_DTO.artist.name}, 2001`,
    })
    await albumCard.waitFor({ state: 'visible', timeout: 30_000 })

    // Give next-dev time to push the (one-time) Fast Refresh update
    // triggered by compiling AlbumCard/SearchResults for the first time,
    // and for the resulting remount to settle, before any test starts.
    await page.waitForTimeout(3_000)

    for (const route of STATIC_ROUTES) {
      try {
        await page.goto(`${baseURL}${route}`)
      } catch {
        // Best-effort warm-up — a failed prefetch shouldn't block the run.
      }
    }
  } finally {
    await browser.close()
  }
}
