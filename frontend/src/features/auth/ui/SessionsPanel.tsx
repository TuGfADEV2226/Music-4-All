'use client'

import { CircleAlert, Loader2, Monitor, Smartphone } from 'lucide-react'

import type { ActiveSession } from '@/entities'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Skeleton } from '@/shared/ui/Skeleton'
import { cn } from '@/shared/lib/cn'

import {
  useRevokeOtherSessionsMutation,
  useRevokeSessionMutation,
  useSessionsQuery,
} from '../model/sessions.queries'

// ── Helpers ───────────────────────────────────────────────────────────────────

function deviceLabel(ua: string): string {
  if (!ua) return 'Unknown device'
  const os = /Windows/i.test(ua)
    ? 'Windows'
    : /Android/i.test(ua)
      ? 'Android'
      : /iPhone|iPad|iOS/i.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : ''
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /Chrome\//i.test(ua)
      ? 'Chrome'
      : /Firefox\//i.test(ua)
        ? 'Firefox'
        : /Safari\//i.test(ua)
          ? 'Safari'
          : ''
  const parts = [browser, os].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Unknown device'
}

function isMobile(ua: string): boolean {
  return /Android|iPhone|iPad|Mobile/i.test(ua)
}

function relativeTime(unixSeconds: number): string {
  const diff = Math.max(0, Date.now() / 1000 - unixSeconds)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`
  return `${Math.floor(diff / 86400)} d ago`
}

// ── Row ─────────────────────────────────────────────────────────────────────

function SessionRow({
  session,
  onRevoke,
  revoking,
}: {
  session: ActiveSession
  onRevoke: (sid: string) => void
  revoking: boolean
}) {
  const Icon = isMobile(session.userAgent) ? Smartphone : Monitor
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-secondary" />
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-sans text-sm text-primary">
            {deviceLabel(session.userAgent)}
            {session.current && (
              <span className="rounded-sm bg-teal-500/15 px-1.5 py-0.5 font-mono text-2xs uppercase tracking-wider text-teal-400">
                This device
              </span>
            )}
          </p>
          <p className="mt-0.5 truncate font-mono text-2xs text-secondary">
            {session.ip || 'unknown IP'} · active {relativeTime(session.lastSeen)}
          </p>
        </div>
      </div>

      {session.current ? (
        // La sesión actual se cierra con "Sign out" (arriba), no desde aquí.
        <span className="shrink-0 font-sans text-2xs text-secondary">Current</span>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onRevoke(session.sid)}
          disabled={revoking}
          aria-label={`Sign out ${deviceLabel(session.userAgent)}`}
        >
          {revoking ? 'Signing out…' : 'Sign out'}
        </Button>
      )}
    </li>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

/**
 * Panel de sesiones activas (dispositivos). Cablea los endpoints
 * `/session/sessions` (listar / revocar una / revocar las demás), que existían en
 * el backend desde la Fase 1 sin UI (Fase 7 E1). La sesión actual no se revoca
 * desde aquí — para eso está "Sign out" en la tarjeta de cuenta.
 */
export function SessionsPanel() {
  const { data, isLoading, isError, refetch } = useSessionsQuery()
  const revokeOne = useRevokeSessionMutation()
  const revokeOthers = useRevokeOtherSessionsMutation()

  const sessions = data ?? []
  const otherCount = sessions.filter((s) => !s.current).length

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-sans text-base font-semibold text-primary">Active sessions</h2>
            <p className="mt-1 font-sans text-sm text-secondary">
              Devices where you&apos;re signed in. Sign out any you don&apos;t recognize.
            </p>
          </div>
          {otherCount > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => revokeOthers.mutate()}
              disabled={revokeOthers.isPending}
              aria-label="Sign out all other devices"
            >
              {revokeOthers.isPending ? 'Signing out…' : 'Sign out other devices'}
            </Button>
          )}
        </div>

        <div role="status" aria-live="polite" className="sr-only">
          {isLoading && 'Loading your active sessions…'}
        </div>

        {isLoading && (
          <div className="flex flex-col gap-3" aria-hidden="true">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} variant="text" className="h-10 w-full" />
            ))}
          </div>
        )}

        {isError && !isLoading && (
          <div role="alert" className="flex items-center gap-3 py-2">
            <CircleAlert className="h-5 w-5 shrink-0 text-semantic-error-on-dark" aria-hidden="true" />
            <p className="font-sans text-sm text-semantic-error-on-dark">
              Couldn&apos;t load your sessions.
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        )}

        {!isLoading && !isError && sessions.length === 0 && (
          <p className="flex items-center gap-2 py-2 font-sans text-sm text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            No active sessions found.
          </p>
        )}

        {!isLoading && !isError && sessions.length > 0 && (
          <ul className={cn('flex flex-col divide-y divide-subtle')}>
            {sessions.map((s) => (
              <SessionRow
                key={s.sid}
                session={s}
                onRevoke={(sid) => revokeOne.mutate(sid)}
                revoking={revokeOne.isPending && revokeOne.variables === s.sid}
              />
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
