import type { Page } from '@playwright/test'

const AUTH_STORAGE_KEY = 'music4all-auth'

// Must match `SESSION_COOKIE` in src/middleware.ts (and the backend's
// `session_cookie_name`). It used to be the client-written `music4all_session`;
// the multi-user work moved route protection to the backend's httpOnly cookie.
const SESSION_COOKIE = 'm4a_sid'

/**
 * Seeds the persisted auth.store (Zustand `persist` → localStorage) and the
 * session cookie so the app boots in an authenticated state
 * without going through the Tidal Device Authorization flow.
 *
 * The cookie is required by the Next.js middleware (src/middleware.ts) which
 * checks it before any client-side hydration can occur.
 *
 * Mirrors the shape written by `useAuthStore`'s `partialize` + zustand
 * `persist` middleware: `{ state: {...}, version: 0 }`.
 *
 * Must be called before `page.goto()` — `addInitScript` runs before any
 * page script, so the store rehydrates as authenticated on first load.
 */
export async function mockAuthenticatedSession(page: Page): Promise<void> {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  // Seed localStorage for auth.store rehydration
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
  const cookieExpiry = Math.floor(Date.now() / 1000) + 7200
  await page.context().addCookies([
    { name: SESSION_COOKIE, value: 'e2e-session', domain: 'localhost', path: '/', expires: cookieExpiry },
  ])
}
