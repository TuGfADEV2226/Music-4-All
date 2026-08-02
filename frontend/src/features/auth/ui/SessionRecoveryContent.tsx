import { cn } from '@/shared/lib/cn'
import { formatDuration } from '@/shared/lib/format'
import { Badge } from '@/shared/ui/Badge'
import type { DeviceAuthCode } from '@/entities'

import type { RecoveryPhase, SuccessVariant } from '../model/session-recovery.types'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SessionRecoveryContentProps {
  phase: RecoveryPhase
  successVariant?: SuccessVariant
  deviceAuth: DeviceAuthCode | null
  /** Authenticated user's email address */
  userEmail?: string | null
  /** Expiry timestamp for the active/renewed session */
  expiresAt?: string | null
  error: string | null
  /** Countdown in seconds for the device auth code */
  countdown?: number | null
}

// ─── Component (purely presentational) ───────────────────────────────────────

/**
 * Phase-specific content for the Session Recovery Modal.
 * No hooks, no state — all data passed via props.
 */
export function SessionRecoveryContent({
  phase,
  successVariant,
  deviceAuth,
  userEmail,
  expiresAt,
  error,
  countdown,
}: SessionRecoveryContentProps) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      aria-describedby="session-recovery-description"
      className="min-h-[100px] flex flex-col justify-center"
    >
      {/* ── CHECKING ──────────────────────────────────────────────────── */}
      {phase === 'checking' && (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span
            aria-hidden="true"
            className="inline-block h-6 w-6 rounded-full border-2 border-secondary/30 border-t-teal-400 animate-spin"
          />
          <p
            id="session-recovery-description"
            className="font-sans text-sm text-primary"
          >
            Checking your session…
          </p>
          {userEmail && (
            <p className="font-mono text-xs text-secondary">{userEmail}</p>
          )}
        </div>
      )}

      {/* ── EXPIRED ───────────────────────────────────────────────────── */}
      {phase === 'expired' && (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-full bg-semantic-error"
          />
          <p
            id="session-recovery-description"
            className="font-sans text-sm font-semibold text-primary"
          >
            Your TIDAL session has expired
          </p>
          <p className="font-sans text-xs text-secondary max-w-xs">
            Sign in again to continue. Your downloads are safe.
          </p>
        </div>
      )}

      {/* ── DEVICE AUTH (initiating) ───────────────────────────────────── */}
      {phase === 'device_auth' && (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span
            aria-hidden="true"
            className="inline-block h-6 w-6 rounded-full border-2 border-secondary/30 border-t-teal-400 animate-spin"
          />
          <p
            id="session-recovery-description"
            className="font-sans text-sm text-primary"
          >
            Starting authentication…
          </p>
        </div>
      )}

      {/* ── WAITING (device code + polling) ────────────────────────────── */}
      {phase === 'waiting' && deviceAuth && (
        <div className="flex flex-col gap-4" id="session-recovery-description">
          {/* Step 1 */}
          <div>
            <p className="font-sans text-xs text-secondary mb-2">
              Step 1 — Open this URL in your browser:
            </p>
            <div className="rounded-md bg-surface-void px-3 py-2">
              <a
                href={deviceAuth.verificationUriComplete}
                target="_blank"
                rel="noreferrer noopener"
                className={cn(
                  'block truncate font-mono text-xs text-teal-500 underline',
                  'hover:text-teal-400 transition-colors duration-100',
                  'focus-visible:outline-none focus-visible:shadow-glow-focus rounded-sm',
                )}
                aria-label="Open TIDAL authorization page (opens in new tab)"
              >
                {deviceAuth.verificationUriComplete}
              </a>
            </div>
          </div>

          {/* Step 2 */}
          <div>
            <p className="font-sans text-xs text-secondary mb-2">
              Step 2 — Enter this code:
            </p>
            <div className="flex items-center justify-center gap-3">
              <Badge
                variant="format"
                title={`Authorization code: ${deviceAuth.userCode}`}
              >
                {deviceAuth.userCode}
              </Badge>
            </div>
          </div>

          {/* Countdown */}
          {countdown !== null && countdown !== undefined && countdown > 0 && (
            <p className="font-mono text-xs text-secondary text-center">
              Code expires in {formatDuration(countdown)}
            </p>
          )}

          {/* Polling indicator */}
          <p className="flex items-center justify-center gap-2 font-sans text-xs text-secondary">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-full border-2 border-secondary/30 border-t-teal-400 animate-spin"
            />
            Waiting for authorization…
          </p>
        </div>
      )}

      {/* ── SUCCESS ────────────────────────────────────────────────────── */}
      {phase === 'success' && (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-full bg-semantic-success"
          />
          <p
            id="session-recovery-description"
            className="font-sans text-sm font-semibold text-primary"
          >
            {successVariant === 'session_active'
              ? 'Session is active'
              : 'Session renewed successfully'}
          </p>
          {userEmail && (
            <p className="font-mono text-xs text-secondary">{userEmail}</p>
          )}
          {successVariant === 'session_active' && expiresAt && (
            <p className="font-sans text-xs text-secondary">
              Valid until{' '}
              {new Date(expiresAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
          {successVariant === 'session_renewed' && (
            <p className="font-sans text-xs text-secondary">
              New session active — closing in a moment
            </p>
          )}
        </div>
      )}

      {/* ── ERROR ──────────────────────────────────────────────────────── */}
      {phase === 'error' && (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-full bg-semantic-error"
          />
          <p
            id="session-recovery-description"
            role="alert"
            className="font-sans text-sm text-semantic-error-on-dark"
          >
            {error ?? 'An unexpected error occurred.'}
          </p>
        </div>
      )}
    </div>
  )
}
