import { expect, test } from '@playwright/test'

import { LoginPage } from '../pages/LoginPage'

/**
 * E2E — Tidal Device Authorization login flow (`/login`).
 *
 * Mocks `/session/device-auth` (init) and `/session/device-auth/{deviceCode}`
 * (poll) — no real Tidal credentials involved. The actual LoginForm has no
 * manual "I already authorized" button: authorization is detected
 * automatically by `useDeviceAuthPollingQuery`, which redirects to
 * /dashboard as soon as the poll response reports `status: 'authorized'`.
 */

const DEVICE_AUTH_RESPONSE = {
  device_code: 'mock-device-code-123',
  user_code: 'ABCD-EFGH',
  // Tidal returns bare hostnames — exercises ensureHttps() normalization.
  verification_uri: 'link.tidal.com',
  verification_uri_complete: 'link.tidal.com/ABCD-EFGH',
  expires_in: 300,
  interval: 1,
}

test.describe('Login — Tidal Device Authorization', () => {
  test('shows the device code and redirects to /dashboard once authorized', async ({ page }) => {
    let pollCount = 0

    await page.route('**/api/session/device-auth', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback()
        return
      }
      await route.fulfill({ json: DEVICE_AUTH_RESPONSE })
    })

    await page.route('**/api/session/device-auth/*', async (route) => {
      pollCount += 1

      if (pollCount < 2) {
        await route.fulfill({ json: { status: 'pending' } })
        return
      }

      await route.fulfill({
        // El backend real emite aquí la cookie httpOnly de sesión, y el
        // middleware la exige para dejar entrar a /dashboard: sin ella el
        // redirect de vuelta a /login haría fallar la comprobación de abajo.
        headers: {
          'content-type': 'application/json',
          'set-cookie': 'm4a_sid=e2e-session; Path=/; HttpOnly; SameSite=Lax',
        },
        json: {
          status: 'authorized',
          user: {
            id: 'qa-user-1',
            email: 'qa@music4all.test',
            country_code: 'US',
            plan: 'HIFI_PLUS',
          },
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      })
    })

    // DownloadPanel mounts useDownloadSocket() on /dashboard — stub the WS
    // endpoint so it doesn't attempt to reach a real backend.
    await page.routeWebSocket('**/ws/downloads', () => {})

    const loginPage = new LoginPage(page)
    await loginPage.goto()

    await expect(loginPage.brandTitle).toBeVisible()
    await expect(loginPage.heading).toBeVisible()

    await loginPage.connectButton.click()

    // Device code + verification URL appear once init succeeds.
    await expect(loginPage.userCodeBadge).toHaveText(DEVICE_AUTH_RESPONSE.user_code)
    await expect(loginPage.verificationLink).toHaveAttribute(
      'href',
      `https://${DEVICE_AUTH_RESPONSE.verification_uri_complete}`
    )

    // Polling (interval: 1s) eventually reports `authorized` → redirect.
    await expect(page).toHaveURL('/dashboard', { timeout: 10_000 })
  })

  test('shows an error and allows retry when the device code expires', async ({ page }) => {
    await page.route('**/api/session/device-auth', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback()
        return
      }
      await route.fulfill({ json: { ...DEVICE_AUTH_RESPONSE, interval: 1 } })
    })

    // First poll reports `pending` so the user code badge has a chance to
    // render before the (simulated) expiry on the second poll — mirrors the
    // real-world timeline where the code is valid for a while before expiry.
    let pollCount = 0
    await page.route('**/api/session/device-auth/*', async (route) => {
      pollCount += 1

      if (pollCount < 2) {
        await route.fulfill({ json: { status: 'pending' } })
        return
      }

      await route.fulfill({
        status: 400,
        json: { error: { code: 'DEVICE_AUTH_EXPIRED', message: 'expired', http_status: 400 } },
      })
    })

    const loginPage = new LoginPage(page)
    await loginPage.goto()

    await loginPage.connectButton.click()
    await expect(loginPage.userCodeBadge).toHaveText(DEVICE_AUTH_RESPONSE.user_code)

    await expect(loginPage.errorAlert).toContainText(
      'Authorization code expired or denied. Please start again.'
    )

    // Back to the initial state — ready to retry.
    await expect(loginPage.connectButton).toBeVisible()
  })
})
