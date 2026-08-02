'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, ChevronDown, ChevronUp, Loader, RotateCw, X } from 'lucide-react'

import { cn } from '@/shared/lib/cn'
import { useDownloadActions, useDownloadsStore, useDownloadSocket } from '@/features/downloads'
import { openSessionRecovery } from '@/features/auth'
import { usePlayerStore } from '@/features/player'
import type { DownloadJob } from '@/entities'

import { useDownloadPanel } from '../model/useDownloadPanel'
import { useDownloadRecovery } from '../model/useDownloadRecovery'
import { DownloadJobItem } from './DownloadJobItem'

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Fixed-position download panel (wireframes §2, §11, §12).
 *
 * Position: fixed above PlayerBar (bottom-20 = 80px = h-player).
 * z-panel: 150 — between z-raised:10 and z-sticky:200.
 *
 * Also mounts useDownloadSocket() as a singleton — this component is always
 * present in (app)/layout.tsx so the WS connection persists for the session.
 */
export function DownloadPanel() {
  // Mount unified WS socket once (singleton for the authenticated session)
  useDownloadSocket()

  // Phase 6H: bridge downloads ↔ SessionRecoveryModal
  const { isRetrying } = useDownloadRecovery()

  const {
    isPanelVisible,
    isPanelExpanded,
    wsConnected,
    setPanelExpanded,
    clearCompleted,
    avgProgress,
    visibleJobs,
    glowEligible,
    activeCount,
    queuedCount,
    completedCount,
  } = useDownloadPanel()

  const { pause, resume, cancel } = useDownloadActions()
  const removeJob = useDownloadsStore((s) => s.removeJob)

  /** Manual "Check Session" from DownloadJobItem error state */
  function handleCheckSession(backendJobId: string) {
    openSessionRecovery(backendJobId)
  }

  /** Play a completed single-track download in the PlayerBar. The backend
   *  streams the file (with range support) at /download/file/{jobId}. */
  function handlePlay(job: DownloadJob) {
    usePlayerStore.getState().play({
      id:     job.backendJobId,
      title:  job.albumTitle, // single-track jobs store the track title here
      artist: job.artistName,
      src:    `/api/download/file/${job.backendJobId}`,
    })
  }

  // Panel is always mounted so the WS socket stays alive, but renders
  // nothing when there are no downloads in the queue.
  if (!isPanelVisible) return null

  // Collapsed summary text
  const summaryParts: string[] = []
  if (activeCount > 0) summaryParts.push(`${activeCount} active`)
  if (activeCount > 0) summaryParts.push(`${avgProgress}% avg`)
  if (queuedCount > 0) summaryParts.push(`${queuedCount} queued`)
  const summaryText = summaryParts.length > 0 ? summaryParts.join(' · ') : 'Processing…'

  return (
    <div
      role="region"
      aria-label="Download panel"
      aria-busy={activeCount > 0 || undefined}
      className={cn(
        // Position — fixed. En móvil (<lg) va sobre la mini-barra del player
        // (bottom-20 = h-player); en lg+ el player vive en el sidebar (no hay
        // barra inferior) así que baja a bottom-0. En lg+ arranca tras el
        // sidebar (lg:left-60): sin ese offset el sidebar (z-sticky 200 >
        // z-panel 150) tapaba el panel.
        'fixed bottom-20 left-0 right-0 lg:bottom-0 lg:left-60',
        // Stacking — z-panel: 150 (design-system §1.5)
        'z-panel',
        // Surface + separator — el borde superior se ilumina segun actividad
        // (activeCount ya viene de useDownloadPanel: sin suscripciones nuevas).
        // transition-shadow suaviza el cambio de estado (puntual, no continuo).
        'bg-surface-console border-t transition-shadow duration-300',
        activeCount > 0
          ? 'border-t-teal-500/40 shadow-glow-panel-active'
          : 'border-t-teal-700/30 shadow-glow-panel',
      )}
    >
      {/* ── Expanded job list (grows upward) ──────────────────────────── */}
      <AnimatePresence initial={false}>
        {isPanelExpanded && (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-subtle px-4 py-2">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-secondary">
                  Downloads
                </span>
                {activeCount > 0 && (
                  <span className="font-mono text-xs text-secondary">
                    Active: {activeCount}
                  </span>
                )}
                {queuedCount > 0 && (
                  <span className="font-mono text-xs text-secondary">
                    Queue: {queuedCount}
                  </span>
                )}
                {!wsConnected && (
                  <span className="flex items-center gap-1 font-mono text-xs text-semantic-warning-on-dark">
                    <Loader aria-hidden="true" className="h-3 w-3 animate-spin" />
                    Reconnecting…
                  </span>
                )}
                {isRetrying && (
                  <span
                    role="status"
                    aria-live="polite"
                    className="flex items-center gap-1 font-mono text-xs text-semantic-info-on-dark"
                  >
                    <RotateCw aria-hidden="true" className="h-3 w-3 animate-spin" />
                    Retrying…
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                {/* Clear completed */}
                {completedCount > 0 && (
                  <button
                    type="button"
                    onClick={clearCompleted}
                    aria-label={`Clear ${completedCount} completed download${completedCount !== 1 ? 's' : ''}`}
                    className={cn(
                      'inline-flex items-center gap-1 font-sans text-xs text-secondary',
                      'hover:text-primary transition-colors duration-100',
                      'focus-visible:outline-none focus-visible:shadow-glow-focus rounded-sm',
                    )}
                  >
                    Clear {completedCount}
                    <X aria-hidden="true" className="h-3 w-3" />
                  </button>
                )}

                {/* Collapse */}
                <button
                  type="button"
                  onClick={() => setPanelExpanded(false)}
                  aria-label="Collapse download panel"
                  className={cn(
                    'ml-2 inline-flex items-center font-mono text-xs text-secondary',
                    'hover:text-primary transition-colors duration-100',
                    'focus-visible:outline-none focus-visible:shadow-glow-focus rounded-sm',
                  )}
                >
                  <ChevronUp aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Job list */}
            <div
              role="list"
              aria-label={`${visibleJobs.length} download job${visibleJobs.length !== 1 ? 's' : ''}`}
              className="max-h-[280px] divide-y divide-surface-studio overflow-y-auto"
            >
              {visibleJobs.length === 0 ? (
                /* Empty state */
                <div
                  role="status"
                  className="flex items-center justify-center py-8"
                >
                  <p className="font-sans text-sm text-secondary">No active downloads</p>
                </div>
              ) : (
                visibleJobs.map((job) => (
                  <div key={job.id} role="listitem">
                    <DownloadJobItem
                      job={job}
                      glowActive={glowEligible.has(job.id)}
                      onPause={pause}
                      onResume={resume}
                      onCancel={cancel}
                      onRemove={removeJob}
                      onPlay={handlePlay}
                      onCheckSession={handleCheckSession}
                    />
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Collapsed summary bar (always visible) ────────────────────── */}
      <div
        className="flex h-10 items-center justify-between px-4"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="flex items-center gap-2">
          <ArrowDown aria-hidden="true" className="h-3.5 w-3.5 text-teal-500" />
          <span className="font-mono text-xs text-secondary">
            {summaryText}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setPanelExpanded(!isPanelExpanded)}
          aria-label={isPanelExpanded ? 'Collapse download panel' : 'Expand download panel'}
          aria-expanded={isPanelExpanded}
          className={cn(
            'inline-flex items-center gap-1 font-mono text-xs text-secondary',
            'hover:text-primary transition-colors duration-100',
            'focus-visible:outline-none focus-visible:shadow-glow-focus rounded-sm px-1',
          )}
        >
          {isPanelExpanded ? (
            <>
              <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" />
              Collapse
            </>
          ) : (
            <>
              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
              Expand
            </>
          )}
        </button>
      </div>
    </div>
  )
}
