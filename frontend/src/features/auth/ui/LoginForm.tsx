'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'

import { useReducedMotion } from '@/shared/hooks/useReducedMotion'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { NeonArcs } from '@/shared/ui/NeonArcs'
import { NeonTitle } from '@/shared/ui/NeonTitle'
import { RetroDisplay } from '@/shared/ui/RetroDisplay'

// Intra-feature imports — avoid barrel to prevent circular dependency
import { useAuthStore } from '@/features/auth/model/auth.store'
import { playAuthTransition } from '@/features/auth/model/auth-transition.store'
import {
  useDeviceAuthPollingQuery,
  useInitDeviceAuthMutation,
} from '@/features/auth/model/auth.queries'
import { ExpiryCountdown } from '@/features/auth/ui/ExpiryCountdown'

/**
 * Envuelve un control (botón/enlace) y emite arcos eléctricos blancos/violeta
 * mientras está en hover o foco. La capa de arcos es decorativa
 * (pointer-events-none) y bajo prefers-reduced-motion no renderiza nada.
 * onFocus/onBlur — además de hover — para no depender solo del puntero (a11y).
 */
function SparkHover({ children, className }: { children: ReactNode; className?: string }) {
  const [active, setActive] = useState(false)
  return (
    <span
      className={cn('relative', className)}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      {children}
      <NeonArcs active={active} density="low" />
    </span>
  )
}

/**
 * Login form — v2 auth stack only.
 *
 * Flow:
 *   1. POST /session/device-auth  (useInitDeviceAuthMutation)
 *      -> stores DeviceAuthCode in auth.store (setDeviceAuth)
 *   2. GET  /session/device-auth/{deviceCode}  (useDeviceAuthPollingQuery)
 *      -> polling cadence from deviceAuth.interval (backend-provided, NOT hardcoded)
 *   3. On status === 'authorized' -> setAuthenticated + redirect /dashboard
 *
 * Uses exclusively:
 *   - auth.store v2  (status: SessionStatus, deviceAuth: DeviceAuthCode)
 *   - /session/device-auth  (NOT /auth/device)
 *   - /session/device-auth/{deviceCode}  (NOT /auth/status)
 *   - deviceAuth.verificationUriComplete  (camelCase, NOT snake_case)
 *   - deviceAuth.userCode  (camelCase, NOT user_code)
 */
export function LoginForm() {
  const router = useRouter()
  const reducedMotion = useReducedMotion()

  // v2 auth store — status and deviceAuth (camelCase)
  const status = useAuthStore((s) => s.status)
  const deviceAuth = useAuthStore((s) => s.deviceAuth)
  const endReason = useAuthStore((s) => s.endReason)

  const [error, setError] = useState<string | null>(null)
  // Timestamp absoluto de emisión del código — base del contador de expiración.
  const [issuedAt, setIssuedAt] = useState<number | null>(null)

  // Nota: el redirect "ya autenticado → /dashboard" lo hace ahora el middleware
  // server-side vía la cookie httpOnly `m4a_sid`. Si el usuario llega a renderizar
  // este formulario es que NO tiene cookie de sesión válida (el middleware lo
  // habría redirigido antes), así que aquí NO redirigimos por el `status`
  // persistido —que puede estar obsoleto— para evitar un bucle /login ↔ /dashboard.
  // El redirect post-login se dispara en el efecto de "authorized" de más abajo,
  // cuando el backend ya ha emitido la cookie.

  // ── Device Auth initiation ─────────────────────────────────────────────────

  const initMutation = useInitDeviceAuthMutation()
  // onSuccess is handled inside useInitDeviceAuthMutation -> setDeviceAuth(data)

  // ── Polling — interval from backend response (NOT hardcoded) ──────────────

  // DeviceAuthCode.interval is in seconds -> convert to ms
  const pollingIntervalMs = deviceAuth ? deviceAuth.interval * 1000 : 5_000

  const pollingQuery = useDeviceAuthPollingQuery(
    deviceAuth?.deviceCode ?? null,
    pollingIntervalMs
  )

  // ── Capture the code issue time when deviceAuth first appears ──────────────

  useEffect(() => {
    setIssuedAt(deviceAuth ? Date.now() : null)
  }, [deviceAuth])

  // ── Handle authorized status ───────────────────────────────────────────────

  useEffect(() => {
    const data = pollingQuery.data
    if (!data) return

    if (data.status === 'authorized') {
      // Update auth.store with the authenticated user and expiry
      if (data.user && data.expiresAt) {
        useAuthStore.getState().setAuthenticated(data.user, data.expiresAt)
      }
      useAuthStore.getState().clearDeviceAuth()
      // Transición visual Login → Dashboard (overlay en el root layout).
      // Corre en paralelo: la navegación no se retrasa. Solo aquí — nunca en
      // el redirect por rehidratación ni en el recovery de sesión.
      playAuthTransition()
      router.replace('/dashboard')
    }
  }, [pollingQuery.data, router])

  // ── Handle expired / denied (backend returns 400 DEVICE_AUTH_EXPIRED) ─────

  useEffect(() => {
    if (!pollingQuery.error) return
    useAuthStore.getState().clearDeviceAuth()
    setError('Authorization code expired or denied. Please start again.')
  }, [pollingQuery.error])

  // ── Event handlers ─────────────────────────────────────────────────────────

  function handleConnect() {
    setError(null)
    initMutation.mutate(undefined, {
      onError: () => setError('Error starting Tidal authentication. Please try again.'),
    })
  }

  function handleCancel() {
    setError(null)
    useAuthStore.getState().clearDeviceAuth()
    initMutation.reset()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    // Fade-out before the cross-layout redirect to /dashboard. Driven directly
    // by `status` (auth.store) — router.replace() below keeps firing exactly as
    // before, so navigation is never delayed; the opacity transition just races
    // the route swap instead of gating it.
    <motion.main
      animate={{ opacity: status === 'authenticated' ? 0 : 1 }}
      transition={{ duration: reducedMotion ? 0 : 0.2, ease: 'easeOut' }}
      className="relative flex min-h-screen flex-col items-center justify-center bg-black p-4"
    >
      {/* Fondo negro absoluto — sin partículas: solo el letrero encendido y sus
          chispas amarillas destacan sobre el negro. */}

      {/* Live region for screen reader announcements */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {deviceAuth ? 'Waiting for Tidal authorization' : ''}
      </div>

      {/* ── Brand — neon sign: framed purple/pink tube, chaotic per-letter
          flicker, and white electric arcs bursting from the tube ends ──────── */}
      <div className="mb-12 flex flex-col items-center text-center">
        <div className="relative inline-block rounded-[1.5rem] border-2 border-synthwave-magenta px-4 py-4 shadow-neon-frame sm:px-10 sm:py-7">
          <NeonTitle className="text-[clamp(1.4rem,6vw,5rem)]">MUSIC 4 ALL</NeonTitle>
          {/* Arcos eléctricos saltando desde los bornes del letrero */}
          <NeonArcs density="high" />
        </div>
        <p className="mt-6 font-retro text-lg tracking-[0.3em] text-secondary">
          LOSSLESS AUDIO DOWNLOADER
        </p>
      </div>

      {/* ── Login card — frosted "glass door" with a metallic gradient edge ── */}
      <div className="w-full max-w-md rounded-lg bg-gradient-to-b from-white/20 via-white/5 to-transparent p-px shadow-lg">
        <Card
          noPadding
          className="space-y-6 rounded-[7px] border-transparent bg-surface-abyss/70 p-8 backdrop-blur-md"
          aria-labelledby="login-heading"
        >
          <h1
            id="login-heading"
            className="text-center font-mono text-heading font-semibold text-primary"
          >
            Connect to Tidal
          </h1>

          {/* Por qué se acabó la sesión anterior. Sin esto, un cierre por
              inactividad se vive como una expulsión inexplicable. */}
          {!error && !deviceAuth && endReason === 'idle' && (
            <div
              role="status"
              className="rounded-md border border-subtle bg-surface-console/60 px-4 py-3"
            >
              <p className="font-sans text-sm text-secondary">
                Your session was closed after a while without activity. Sign in again to continue.
              </p>
            </div>
          )}

          {/* Cuenta suspendida: mensaje claro en vez de un fallo de login opaco. */}
          {!error && !deviceAuth && endReason === 'banned' && (
            <div
              role="alert"
              className="rounded-md border border-semantic-error bg-semantic-error/10 px-4 py-3"
            >
              <p className="font-sans text-sm text-semantic-error-on-dark">
                Your account has been suspended. If you believe this is a mistake, contact support.
              </p>
            </div>
          )}

          {/* Error message — finite glitch/shake on appearance */}
          {error && (
            <motion.div
              role="alert"
              initial={reducedMotion ? false : { x: 0 }}
              animate={reducedMotion ? {} : { x: [0, -5, 5, -4, 4, -2, 2, 0] }}
              transition={{ duration: 0.45, ease: 'easeInOut' }}
              className={cn(
                'rounded-md border border-semantic-error px-4 py-3',
                'bg-semantic-error/10'
              )}
            >
              <p className="font-sans text-sm text-semantic-error-on-dark">{error}</p>
            </motion.div>
          )}

          {/* Two views (initial <-> pending) — key swap replays the entry
              "door opening" animation; the sign + particles persist outside. */}
          <motion.div
            key={deviceAuth ? 'pending' : 'initial'}
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={reducedMotion ? {} : { opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {deviceAuth ? (
              /* ── Device auth pending: verification URL + user code ─────── */
              <div className="space-y-4 text-center">
                <p className="font-sans text-sm text-secondary">
                  Open this URL in your browser and authorize the app:
                </p>

                {/* verificationUriComplete — neon link that sparks on hover */}
                <SparkHover className="mx-auto block max-w-xs">
                  <a
                    href={deviceAuth.verificationUriComplete}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={cn(
                      'block break-all rounded-sm border-2 border-synthwave-magenta/60 px-3 py-2',
                      'bg-synthwave-magenta/5 font-mono text-xs text-synthwave-magenta underline',
                      'transition-all duration-150 hover:bg-synthwave-magenta/15 hover:shadow-glow-magenta',
                      'focus-visible:outline-none focus-visible:shadow-glow-focus'
                    )}
                    aria-label="Open Tidal authorization page in a new tab"
                  >
                    {deviceAuth.verificationUriComplete}
                  </a>
                </SparkHover>

                {/* userCode — cyan neon tube display, matches the sign */}
                <div className="flex items-center justify-center gap-3">
                  <span className="font-sans text-xs text-secondary">Your code:</span>
                  <RetroDisplay
                    value={deviceAuth.userCode}
                    size="lg"
                    color="cyan"
                    title={`Authorization code: ${deviceAuth.userCode}`}
                  />
                </div>

                {/* Expiry countdown — informative mm:ss */}
                {issuedAt !== null && (
                  <p className="flex items-center justify-center gap-2 font-sans text-xs text-secondary">
                    Code expires in
                    <ExpiryCountdown issuedAt={issuedAt} expiresIn={deviceAuth.expiresIn} />
                  </p>
                )}

                {/* Polling indicator */}
                {pollingQuery.isFetching && (
                  <p
                    className="flex items-center justify-center gap-2 font-sans text-sm text-secondary"
                    aria-live="polite"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'inline-block h-3 w-3 rounded-full border-2 border-secondary/30 border-t-teal-400',
                        !reducedMotion && 'animate-spin'
                      )}
                    />
                    Waiting for authorization…
                  </p>
                )}

                {/* Cancel */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  className="mt-2"
                >
                  Cancel and try again
                </Button>
              </div>
            ) : (
              /* ── Initial state: neon connect button ────────────────────── */
              <div className="space-y-6">
                <p className="text-center font-sans text-sm text-secondary">
                  A Tidal authorization window will open in your browser.
                </p>
                <SparkHover className="block w-full">
                  <Button
                    type="button"
                    variant="neon"
                    neonColor="purple"
                    size="lg"
                    onClick={handleConnect}
                    loading={initMutation.isPending}
                    disabled={initMutation.isPending}
                    className="w-full"
                    aria-label="Connect with Tidal via Device Authorization"
                  >
                    Connect with Tidal
                  </Button>
                </SparkHover>
              </div>
            )}
          </motion.div>
        </Card>
      </div>

      {/* Aviso legal (web pública): al conectar aceptas los términos. Enlaces a las
          páginas legales públicas (/legal/*), alcanzables sin sesión. */}
      <p className="mt-8 max-w-md text-center font-sans text-2xs leading-relaxed text-secondary">
        By connecting you agree to our{' '}
        <Link href="/legal/terms" className="underline hover:text-teal-400">
          Terms of Service
        </Link>
        ,{' '}
        <Link href="/legal/copyright" className="underline hover:text-teal-400">
          Copyright &amp; DMCA policy
        </Link>{' '}
        and{' '}
        <Link href="/legal/disclaimer" className="underline hover:text-teal-400">
          Disclaimer
        </Link>
        . Music 4 All is an unofficial tool and is not affiliated with Tidal.
      </p>
    </motion.main>
  )
}
