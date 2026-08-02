'use client'

/**
 * History page — v2 stack only.
 *
 * Eliminated legacy dependencies:
 *   -historyApi  from '@/lib/api'  →  useHistoryQuery from features/history
 *   -DownloadRecord legacy type    →  HistoryRecord (camelCase, mapped from DTO)
 */

import Link from 'next/link'
import { CircleAlert } from 'lucide-react'

import { Skeleton } from '@/shared/ui/Skeleton'
import { Button } from '@/shared/ui/Button'
import {
  HistoryEmptyState,
  HistoryList,
  useHistoryQuery,
} from '@/features/history'

// ─── Component ────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const { data, isLoading, isError, refetch, isFetching } = useHistoryQuery()

  return (
    <div className="mx-auto max-w-3xl p-6">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="mb-8 flex items-center justify-between">
        <h1 className="font-mono text-2xl font-bold text-primary">
          Download History
        </h1>
        <Link
          href="/dashboard"
          className="font-sans text-sm text-secondary transition-colors hover:text-primary"
          aria-label="Back to dashboard"
        >
          ← Dashboard
        </Link>
      </header>

      {/* Accessible live region */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {isLoading && 'Loading history…'}
        {data && `${data.length} download${data.length !== 1 ? 's' : ''} in history`}
        {isError && 'Error loading history'}
      </div>

      {/* ── Content ──────────────────────────────────────────────────── */}
      <main
        aria-label="Download history"
        aria-busy={isLoading || isFetching || undefined}
      >

        {/* Loading state — skeleton rows */}
        {isLoading && (
          <div className="space-y-2" aria-label="Loading history records">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 rounded-md border bg-surface-console p-4"
                aria-hidden="true"
              >
                <Skeleton className="h-12 w-12 rounded-sm shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton variant="text" className="h-4 w-1/2" />
                  <Skeleton variant="text" className="h-3 w-1/3" />
                </div>
                <div className="space-y-2 text-right shrink-0">
                  <Skeleton variant="text" className="h-3 w-16" />
                  <Skeleton variant="text" className="h-3 w-12" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {isError && !isLoading && (
          <div
            role="alert"
            className="flex flex-col items-center gap-4 py-16 text-center"
          >
            <CircleAlert className="h-12 w-12 text-semantic-error-on-dark" aria-hidden="true" />
            <p className="font-sans text-sm text-semantic-error-on-dark">
              Error loading download history.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void refetch()}
              aria-label="Retry loading history"
            >
              Try again
            </Button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && data?.length === 0 && (
          <HistoryEmptyState />
        )}

        {/* Success state — history list */}
        {!isLoading && !isError && data && data.length > 0 && (
          <HistoryList items={data} />
        )}
      </main>
    </div>
  )
}
