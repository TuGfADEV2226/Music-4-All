'use client'

import { useState } from 'react'
import Image from 'next/image'
import {
  ChevronUp,
  CircleSlash,
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
} from 'lucide-react'

import { coverAtSize } from '@/shared/api/mappers'
import { cn } from '@/shared/lib/cn'
import { formatDuration } from '@/shared/lib/format'
import { useReducedMotion } from '@/shared/hooks/useReducedMotion'
import { usePlayerStore, selectHasNext, selectHasPrevious } from '@/features/player'

import { NowPlaying } from './NowPlaying'

// ─── Transport button (secondary controls) ───────────────────────────────────

function TransportButton({
  onClick,
  disabled,
  active,
  label,
  className,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  active?: boolean
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
        'transition-transform duration-150 ease-out active:scale-90',
        'focus-visible:outline-none focus-visible:shadow-glow-focus',
        active ? 'text-teal-400' : 'text-secondary hover:text-primary',
        'disabled:cursor-not-allowed disabled:text-ghost disabled:hover:text-ghost',
        className,
      )}
    >
      {children}
    </button>
  )
}

// ─── Component (wireframes §16) ───────────────────────────────────────────────

export function PlayerBar() {
  const current       = usePlayerStore((s) => s.current)
  const isPlaying     = usePlayerStore((s) => s.isPlaying)
  const progressSec   = usePlayerStore((s) => s.progressSeconds)
  const durationSec   = usePlayerStore((s) => s.durationSeconds)
  const volume        = usePlayerStore((s) => s.volume)
  const shuffle       = usePlayerStore((s) => s.shuffle)
  const repeat        = usePlayerStore((s) => s.repeat)
  const toggle        = usePlayerStore((s) => s.toggle)
  const seek          = usePlayerStore((s) => s.seek)
  const setVolume     = usePlayerStore((s) => s.setVolume)
  const next          = usePlayerStore((s) => s.next)
  const previous      = usePlayerStore((s) => s.previous)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)
  const cycleRepeat   = usePlayerStore((s) => s.cycleRepeat)
  const hasNext       = usePlayerStore(selectHasNext)
  const hasPrevious   = usePlayerStore(selectHasPrevious)
  const reducedMotion = useReducedMotion()

  const [expanded, setExpanded] = useState(false)

  const hasTrack = current !== null
  const max = durationSec > 0 ? durationSec : 0
  const progressPercent = max > 0 ? Math.min(100, Math.max(0, (progressSec / max) * 100)) : 0
  const repeatLabel = repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat off'

  return (
    <div
      role="region"
      aria-label="Audio player"
      className={cn(
        // Position — fixed bottom, full width (wireframes §16 — z-sticky:200)
        'fixed bottom-0 left-0 right-0',
        'h-player z-sticky',
        // Surface + separator
        'bg-surface-abyss border-t border-subtle',
        // Layout
        'flex items-center gap-4 px-4',
        // Solo móvil: en lg+ el reproductor vive como Walkman en el sidebar.
        // Esta mini-barra es el fallback cuando el sidebar está oculto (<lg).
        'lg:hidden',
      )}
    >
      {/* ── Láseres ambientales en idle ─────────────────────────────────
          Barrido teal continuo (7s lineal — sin destellos, WCAG 2.3.1)
          mientras no hay pista activa. El root es fixed: ya actúa como
          containing block para esta capa. */}
      {!hasTrack && !reducedMotion && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <span className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-transparent via-teal-500/15 to-transparent animate-laser-scan" />
          <span
            className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-transparent via-teal-300/10 to-transparent animate-laser-scan"
            style={{ animationDelay: '3.5s' }}
          />
        </div>
      )}

      {/* ── Artwork — abre la vista Now Playing (Walkman) ─────────────── */}
      <button
        type="button"
        onClick={() => setExpanded(true)}
        disabled={!hasTrack}
        aria-label="Open Now Playing player"
        aria-haspopup="dialog"
        className={cn(
          'group relative shrink-0 h-12 w-12 overflow-hidden rounded-sm bg-surface-rack',
          'flex items-center justify-center',
          'transition-transform duration-150 ease-out active:scale-95',
          'focus-visible:outline-none focus-visible:shadow-glow-focus',
          'disabled:cursor-default',
        )}
      >
        {current?.coverUrl ? (
          <Image
            src={coverAtSize(current.coverUrl, 160)}
            alt=""
            width={48}
            height={48}
            className="h-full w-full object-cover"
          />
        ) : (
          <Music aria-hidden="true" className="h-5 w-5 text-disabled" />
        )}
        {/* Pista visual de "expandir" al pasar el cursor (solo con pista) */}
        {hasTrack && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-0 flex items-center justify-center bg-surface-void/60',
              'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100',
            )}
          >
            <ChevronUp className="h-5 w-5 text-primary" />
          </span>
        )}
      </button>

      {/* ── Track info ──────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1">
        {current ? (
          <>
            <div className="flex items-center gap-1.5">
              {isPlaying && (
                <span
                  aria-hidden="true"
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500"
                />
              )}
              <p
                className="truncate font-sans text-sm font-medium text-primary"
                aria-live="polite"
                aria-atomic="true"
              >
                <span className="sr-only">Now playing: </span>
                {current.title}
              </p>
            </div>
            <p className="truncate font-sans text-xs text-secondary">
              {current.artist}
              {current.album && (
                <>
                  <span aria-hidden="true"> · </span>
                  {current.album}
                </>
              )}
            </p>
          </>
        ) : (
          <p
            className="flex items-center gap-2 font-sans text-sm text-secondary"
            aria-live="polite"
          >
            <CircleSlash aria-hidden="true" className="h-4 w-4" />
            Nothing playing
          </p>
        )}
      </div>

      {/* ── Transport controls ──────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-1">
        {/* Shuffle (sm+) */}
        <TransportButton
          onClick={toggleShuffle}
          disabled={!hasTrack}
          active={shuffle}
          label={shuffle ? 'Shuffle on' : 'Shuffle off'}
          className="hidden sm:inline-flex"
        >
          <Shuffle aria-hidden="true" className="h-4 w-4" />
        </TransportButton>

        {/* Previous */}
        <TransportButton onClick={previous} disabled={!hasPrevious} label="Previous track">
          <SkipBack aria-hidden="true" className="h-4 w-4" />
        </TransportButton>

        {/* Play / pause — primary */}
        <button
          type="button"
          onClick={toggle}
          disabled={!hasTrack}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className={cn(
            'mx-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            'bg-teal-500 text-surface-void',
            'transition-transform duration-150 ease-out active:scale-95',
            'hover:bg-teal-400 focus-visible:outline-none focus-visible:shadow-glow-focus',
            'disabled:cursor-not-allowed disabled:bg-surface-rack disabled:text-disabled',
          )}
        >
          {isPlaying ? (
            <Pause aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Play aria-hidden="true" className="h-4 w-4 translate-x-px" />
          )}
        </button>

        {/* Next */}
        <TransportButton onClick={next} disabled={!hasNext} label="Next track">
          <SkipForward aria-hidden="true" className="h-4 w-4" />
        </TransportButton>

        {/* Repeat (sm+) */}
        <TransportButton
          onClick={cycleRepeat}
          disabled={!hasTrack}
          active={repeat !== 'off'}
          label={repeatLabel}
          className="hidden sm:inline-flex"
        >
          {repeat === 'one' ? (
            <Repeat1 aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Repeat aria-hidden="true" className="h-4 w-4" />
          )}
        </TransportButton>
      </div>

      {/* ── Seek bar + times (md+) ──────────────────────────────────── */}
      <div className="hidden md:flex w-56 shrink-0 items-center gap-2">
        <span className="w-9 text-right font-mono text-xs text-secondary tabular-nums">
          {formatDuration(progressSec)}
        </span>
        <input
          type="range"
          min={0}
          max={max || 100}
          step={1}
          value={Math.min(progressSec, max || 0)}
          onChange={(e) => seek(Number(e.currentTarget.value))}
          disabled={!hasTrack || max === 0}
          aria-label="Seek"
          className="player-range h-1 flex-1"
          style={{ ['--range-fill' as string]: `${progressPercent}%` }}
        />
        <span className="w-9 font-mono text-xs text-secondary tabular-nums">
          {formatDuration(max)}
        </span>
      </div>

      {/* ── Volume (lg+) ────────────────────────────────────────────── */}
      <div className="hidden lg:flex shrink-0 items-center gap-2" role="group" aria-label="Volume">
        <Volume2 aria-hidden="true" className="h-4 w-4 text-disabled" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.currentTarget.value))}
          aria-label="Volume"
          className="player-range h-1 w-20"
          style={{ ['--range-fill' as string]: `${Math.round(volume * 100)}%` }}
        />
      </div>

      {/* ── Vista expandida Now Playing (Walkman) ─────────────────────── */}
      <NowPlaying open={expanded} onClose={() => setExpanded(false)} />
    </div>
  )
}
