import Image from 'next/image'
import { Music } from 'lucide-react'

import { coverAtSize } from '@/shared/api/mappers'
import { cn } from '@/shared/lib/cn'
import type { HistoryRecord } from '../model/history.types'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface HistoryItemProps {
  record: HistoryRecord
}

// ─── Date formatter ───────────────────────────────────────────────────────────

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('es', {
      day:   '2-digit',
      month: '2-digit',
      year:  'numeric',
    })
  } catch {
    return isoString
  }
}

// ─── Component (purely presentational) ───────────────────────────────────────

/**
 * Single history record row.
 * Presentational only — receives data via props, no hooks or queries.
 */
export function HistoryItem({ record }: HistoryItemProps) {
  const dateLabel = formatDate(record.downloadedAt)

  return (
    <li
      className={cn(
        'flex items-center gap-4',
        'rounded-md border bg-surface-console p-4',
        'transition-colors duration-100 ease-out hover:bg-surface-rack',
      )}
      aria-label={`${record.title} by ${record.artist} — ${record.quality}`}
    >
      {/* Cover art */}
      <div
        className="relative h-12 w-12 shrink-0 overflow-hidden rounded-sm bg-surface-studio"
        aria-hidden="true"
      >
        {record.coverUrl ? (
          <Image
            src={coverAtSize(record.coverUrl, 160)}
            alt={`Cover for ${record.title}`}
            fill
            sizes="48px"
            className="object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-disabled">
            <Music aria-hidden="true" className="h-5 w-5" />
          </span>
        )}
      </div>

      {/* Title + artist */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-sans text-sm font-semibold text-primary">
          {record.title}
        </p>
        <p className="truncate font-sans text-xs text-secondary">
          {record.artist}
        </p>
      </div>

      {/* Quality + date */}
      <div className="shrink-0 text-right">
        {/* Quality is a free-form string — not a Badge (can exceed 8 chars) */}
        <span className="block font-mono text-xs font-medium text-semantic-success">
          {record.quality}
        </span>
        <time
          dateTime={record.downloadedAt}
          className="block font-mono text-xs text-disabled"
          aria-label={`Downloaded on ${dateLabel}`}
        >
          {dateLabel}
        </time>
      </div>
    </li>
  )
}
