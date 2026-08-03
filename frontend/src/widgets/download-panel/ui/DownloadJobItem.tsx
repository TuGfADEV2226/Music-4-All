'use client'

import { useEffect } from 'react'
import { Download, Pause, Play, X } from 'lucide-react'

import { cn } from '@/shared/lib/cn'
import { formatDuration, formatSpeed } from '@/shared/lib/format'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ProgressBar } from '@/shared/ui/ProgressBar'
import type { DownloadJob } from '@/entities'
import type { BadgeVariant } from '@/shared/ui/Badge'
import type { ProgressBarVariant } from '@/shared/ui/ProgressBar'

// ─── Status badge mapping ─────────────────────────────────────────────────────

const STATUS_BADGE: Record<DownloadJob['status'], { variant: BadgeVariant; label: string }> = {
  queued:    { variant: 'status-queue', label: 'QUEUED' },
  active:    { variant: 'status-info',  label: 'ACTIVE' },
  paused:    { variant: 'status-warn',  label: 'PAUSED' },
  completed: { variant: 'status-ok',   label: 'DONE'   },
  error:     { variant: 'status-error', label: 'ERROR'  },
}

const PROGRESS_VARIANT: Record<DownloadJob['status'], ProgressBarVariant> = {
  active:    'download',
  paused:    'default',
  completed: 'success',
  error:     'error',
  queued:    'queue',
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DownloadJobItemProps {
  job: DownloadJob
  /** True when this job gets the glow-download effect (max 2 per session) */
  glowActive: boolean
  onCancel:  (jobId: string) => void
  onPause:   (jobId: string) => void
  onResume:  (jobId: string) => void
  onRemove:  (jobId: string) => void
  /** Play this completed single-track download in the PlayerBar. */
  onPlay?:   (job: DownloadJob) => void
  /**
   * Opens SessionRecoveryModal for this job.
   * Shown when error.code is 401 or 403 (session expired).
   * Phase 6H — also triggered automatically via useDownloadRecovery.
   */
  onCheckSession?: (backendJobId: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Single download job row inside the DownloadPanel.
 * Auto-removes completed jobs from the store after 10 seconds.
 */
export function DownloadJobItem({
  job,
  glowActive,
  onCancel,
  onPause,
  onResume,
  onRemove,
  onPlay,
  onCheckSession,
}: DownloadJobItemProps) {
  // Auto-remove completed jobs after 10s (wireframes §11)
  useEffect(() => {
    if (job.status !== 'completed') return
    const timer = setTimeout(() => onRemove(job.id), 10_000)
    return () => clearTimeout(timer)
  }, [job.status, job.id, onRemove])

  const badgeConfig     = STATUS_BADGE[job.status]
  const progressVariant = PROGRESS_VARIANT[job.status]
  const isActive        = job.status === 'active'
  const isPaused        = job.status === 'paused'
  const isError         = job.status === 'error'
  const isCompleted     = job.status === 'completed'

  // Detect auth errors (401 / 403 SESSION_EXPIRED) to show "Check Session" button
  const isAuthError = isError && (job.error?.code === 401 || job.error?.code === 403)

  return (
    <div
      className={cn(
        'flex flex-col gap-2 p-3',
        'bg-surface-studio',
        'transition-colors duration-150',
      )}
      aria-label={`Download: ${job.albumTitle} by ${job.artistName} — ${badgeConfig.label}`}
    >
      {/* ── Row 1: Status dot + title + controls ─────────────────────── */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Track filename or status text */}
          <p className="truncate font-sans text-sm font-medium text-primary">
            {isActive && job.currentTrackFilename
              ? job.currentTrackFilename
              : job.albumTitle}
          </p>
          <p className="truncate font-sans text-xs text-secondary">
            {job.artistName}
            {job.totalTracks > 1 &&
              ` · ${job.completedTracks}/${job.totalTracks} tracks`}
          </p>
        </div>

        {/* Status badge */}
        <Badge variant={badgeConfig.variant}>
          {badgeConfig.label}
        </Badge>

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Guardar en el dispositivo. Es un <a> y no un botón a propósito: el
              backend responde con Content-Disposition, así que el navegador se
              encarga de la descarga (y del streaming del fichero, que puede
              pesar cientos de MB). Sin esto la descarga terminaba en el
              servidor y el usuario no tenía forma de obtener el archivo. */}
          {isCompleted && (
            <a
              href={`/api/download/file/${job.backendJobId}`}
              download
              aria-label={`Save to your device: ${job.albumTitle}`}
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-md',
                'text-secondary transition-all duration-150 ease-out',
                'hover:bg-surface-console hover:text-primary active:scale-[0.97]',
                'focus-visible:outline-none focus-visible:shadow-glow-focus',
              )}
            >
              <Download aria-hidden="true" className="h-4 w-4" />
            </a>
          )}
          {/* Play — only for a completed single-track download (albums are ZIPs) */}
          {isCompleted && job.totalTracks === 1 && onPlay && (
            <Button
              type="button"
              variant="icon-only"
              size="sm"
              onClick={() => onPlay(job)}
              aria-label={`Play: ${job.albumTitle}`}
            >
              <Play aria-hidden="true" className="h-4 w-4 text-teal-500" />
            </Button>
          )}
          {isActive && (
            <Button
              type="button"
              variant="icon-only"
              size="sm"
              onClick={() => onPause(job.backendJobId)}
              aria-label={`Pause download: ${job.albumTitle}`}
            >
              <Pause aria-hidden="true" className="h-4 w-4" />
            </Button>
          )}
          {isPaused && (
            <Button
              type="button"
              variant="icon-only"
              size="sm"
              onClick={() => onResume(job.backendJobId)}
              aria-label={`Resume download: ${job.albumTitle}`}
            >
              <Play aria-hidden="true" className="h-4 w-4" />
            </Button>
          )}
          {!isCompleted && (
            <Button
              type="button"
              variant="icon-only"
              size="sm"
              onClick={() => onCancel(job.backendJobId)}
              aria-label={`Cancel download: ${job.albumTitle}`}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────── */}
      {!isError && (
        <ProgressBar
          value={job.progressPercent}
          variant={progressVariant}
          size="md"
          animated={isActive && glowActive}
          label={`Download progress for ${job.albumTitle}: ${job.progressPercent}%`}
        />
      )}

      {/* ── Row 2: Speed · ETA · Error message ───────────────────────── */}
      <div className="flex items-center gap-3 font-mono text-xs text-secondary">
        {isActive && job.speedMbps !== null && (
          <span>{formatSpeed(job.speedMbps)}</span>
        )}
        {isActive && job.etaSeconds !== null && (
          <span>{formatDuration(job.etaSeconds)} left</span>
        )}
        {job.status === 'queued' && (
          <span>Waiting to start…</span>
        )}
        {isError && job.error && (
          <span className="text-semantic-error-on-dark" role="alert">
            {job.error.message}
          </span>
        )}
        {isCompleted && (
          <span className="text-semantic-success-on-dark">Download complete</span>
        )}
      </div>

      {/* ── Check Session CTA — shown for auth errors (Phase 6H) ─────── */}
      {isAuthError && onCheckSession && (
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onCheckSession(job.backendJobId)}
            aria-label={`Check Tidal session for: ${job.albumTitle}`}
          >
            Check Session
          </Button>
        </div>
      )}
    </div>
  )
}
