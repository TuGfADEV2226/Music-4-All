'use client'

import Image from 'next/image'
import { Download, Music, Play } from 'lucide-react'

import { coverAtSize } from '@/shared/api/mappers'
import { cn } from '@/shared/lib/cn'
import { formatDuration } from '@/shared/lib/format'
import type { Track } from '@/entities'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TrackResultsProps {
  tracks: Track[]
  onPlay: (index: number) => void
  onDownload: (track: Track) => void
  /** Section heading. Defaults to "Songs" (the search results list). */
  heading?: string
  /** Optional cap on how many rows to render (e.g. album preview). */
  max?: number
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * A list of song rows with play/download. Used both for the search "Songs"
 * results and, with a custom `heading`/`max`, for the album-context preview in
 * the recommendations (Fase 4, etapa B).
 *
 * The backend already searched tracks and the API layer already mapped them —
 * they were simply never rendered, so a song could only be downloaded by first
 * finding the album it belongs to.
 */
export function TrackResults({
  tracks,
  onPlay,
  onDownload,
  heading = 'Songs',
  max,
}: TrackResultsProps) {
  const shown = max ? tracks.slice(0, max) : tracks
  return (
    <section aria-label={`${heading}: ${shown.length} track${shown.length !== 1 ? 's' : ''}`}>
      <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wider text-secondary">
        {heading}
      </h2>
      <ol className="flex flex-col">
        {shown.map((track, index) => (
          <li key={track.id}>
            <div
              className={cn(
                'flex items-center gap-3 rounded-md px-2 py-2',
                'transition-colors duration-75 hover:bg-surface-console/50',
              )}
            >
              <div
                aria-hidden="true"
                className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-surface-rack"
              >
                {track.coverUrl ? (
                  <Image
                    src={coverAtSize(track.coverUrl, 160)}
                    alt=""
                    width={40}
                    height={40}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Music className="absolute inset-0 m-auto h-4 w-4 text-disabled" />
                )}
              </div>

              <button
                type="button"
                onClick={() => onPlay(index)}
                aria-label={`Play: ${track.title}`}
                className={cn(
                  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  'text-secondary transition-transform duration-150 ease-out active:scale-90',
                  'hover:text-teal-400 focus-visible:outline-none focus-visible:shadow-glow-focus',
                )}
              >
                <Play aria-hidden="true" className="h-4 w-4" />
              </button>

              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-sans text-sm text-primary">{track.title}</span>
                <span className="truncate font-sans text-xs text-secondary">
                  {track.artist.name}
                  {track.albumTitle ? (
                    <>
                      <span aria-hidden="true"> · </span>
                      {track.albumTitle}
                    </>
                  ) : null}
                </span>
              </div>

              <span className="shrink-0 font-mono text-xs text-secondary tabular-nums">
                {formatDuration(track.durationSeconds)}
              </span>

              <button
                type="button"
                onClick={() => onDownload(track)}
                aria-label={`Download: ${track.title}`}
                className={cn(
                  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  'text-secondary transition-transform duration-150 ease-out active:scale-90',
                  'hover:text-teal-400 focus-visible:outline-none focus-visible:shadow-glow-focus',
                )}
              >
                <Download aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
