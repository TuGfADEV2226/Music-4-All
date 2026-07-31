import type { Locator, Page } from '@playwright/test'

/**
 * Page Object for `/login` (LoginForm — `src/features/auth/ui/LoginForm.tsx`).
 *
 * Reflects the actual v2 device-auth UI (English copy, fully automatic
 * polling — there is no manual "I already authorized" button; the redirect
 * to /dashboard happens as soon as `useDeviceAuthPollingQuery` resolves
 * `status: 'authorized'`).
 */
export class LoginPage {
  readonly page: Page
  readonly brandTitle: Locator
  readonly heading: Locator
  readonly connectButton: Locator
  readonly verificationLink: Locator
  readonly userCodeBadge: Locator
  readonly cancelButton: Locator
  readonly errorAlert: Locator
  readonly pollingIndicator: Locator

  constructor(page: Page) {
    this.page = page
    // `exact` es necesario: el aviso legal del login y el <title> de la página
    // también contienen "Music 4 All", y sin él el selector casa con 3 elementos.
    this.brandTitle = page.getByText('MUSIC 4 ALL', { exact: true })
    this.heading = page.getByRole('heading', { name: 'Connect to Tidal' })
    this.connectButton = page.getByRole('button', {
      name: 'Connect with Tidal via Device Authorization',
    })
    this.verificationLink = page.getByRole('link', {
      name: 'Open Tidal authorization page in a new tab',
    })
    this.userCodeBadge = page.locator('[title^="Authorization code:"]')
    this.cancelButton = page.getByRole('button', { name: 'Cancel and try again' })
    // Scoped to <main> to avoid matching Next.js's own
    // role="alert" route announcer (#__next-route-announcer__).
    this.errorAlert = page.getByRole('main').getByRole('alert')
    this.pollingIndicator = page.getByText('Waiting for authorization…')
  }

  async goto(): Promise<void> {
    await this.page.goto('/login')
  }
}
