'use client'

import Image from 'next/image'
import {
  ChevronDown,
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
} from 'lucide-react'

import { cn } from '@/shared/lib/cn'
import { formatDuration } from '@/shared/lib/format'
import { useReducedMotion } from '@/shared/hooks/useReducedMotion'
import { Modal } from '@/shared/ui/Modal'
import { usePlayerStore, selectHasNext, selectHasPrevious } from '@/features/player'

import { CassetteDeck } from './CassetteDeck'

// ─── Walkman key — boton tactil de transporte ────────────────────────────────

function WalkmanKey({
  onClick,
  disabled,
  active,
  label,
  variant = 'secondary',
  children,
}: {
  onClick: () => void
  disabled?: boolean
  active?: boolean
  label: string
  variant?: 'primary' | 'secondary'
  children: React.ReactNode
}) {
  const primary = variant === 'primary'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md border',
        'transition-transform duration-150 ease-out',
        'active:translate-y-px active:scale-95',
        'focus-visible:outline-none focus-visible:shadow-glow-focus',
        primary
          ? [
              'h-14 w-14 bg-teal-500 text-surface-void border-teal-400',
              'shadow-glow-active hover:bg-teal-400',
              'disabled:bg-surface-rack disabled:text-disabled disabled:border-subtle disabled:shadow-none',
            ]
          : [
              'h-11 w-11 bg-surface-rack border-subtle',
              active ? 'text-teal-400 border-teal-700' : 'text-secondary hover:text-primary',
              'disabled:cursor-not-allowed disabled:text-ghost disabled:hover:text-ghost',
            ],
      )}
    >
      {children}
    </button>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface NowPlayingProps {
  open: boolean
  onClose: () => void
}

/**
 * Vista "Now Playing" expandible con estetica de Sony Walkman: cuerpo por
 * tokens del design system, cassette con carretes girando al reproducir
 * (CassetteDeck) y botones de transporte tactiles. Reutiliza el Modal accesible
 * (focus-trap, Escape, scroll-lock, aria-modal). Suscribirse a isPlaying aqui es
 * correcto: es la UI del propio reproductor, no una capa decorativa de fondo.
 */
export function NowPlaying({ open, onClose }: NowPlayingProps) {
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
  const stop          = usePlayerStore((s) => s.stop)
  const hasNext       = usePlayerStore(selectHasNext)
  const hasPrevious   = usePlayerStore(selectHasPrevious)
  const reducedMotion = useReducedMotion()

  const max = durationSec > 0 ? durationSec : 0
  const progressPercent = max > 0 ? Math.min(100, Math.max(0, (progressSec / max) * 100)) : 0
  const repeatLabel = repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat off'

  function handleStop() {
    stop()
    onClose()
  }

  return (
    <Modal
      isOpen={open && current !== null}
      onClose={onClose}
      aria-label="Now Playing player"
      size="full"
      className="max-w-[460px]"
    >
      <div className="flex flex-col items-center gap-6">
        {/* ── Marca + minimizar ─────────────────────────────────────────── */}
        <div className="flex w-full items-center justify-between">
          <span className="font-mono text-2xs uppercase tracking-[0.3em] text-synthwave-magenta">
            M4A · Sound
          </span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-2xs uppercase tracking-widest text-secondary">
              Now Playing
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Minimize player"
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-sm text-secondary',
                'transition-colors duration-100 hover:text-primary',
                'focus-visible:outline-none focus-visible:shadow-glow-focus',
              )}
            >
              <ChevronDown aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Cassette (carretes girando al reproducir) ─────────────────── */}
        <CassetteDeck
          spinning={isPlaying && !reducedMotion}
          className="w-full max-w-[360px]"
        />

        {/* ── Caratula + info de pista ──────────────────────────────────── */}
        <div className="flex w-full items-center gap-4">
          <div
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-rack"
          >
            {current?.coverUrl ? (
              <Image
                src={current.coverUrl}
                alt=""
                width={64}
                height={64}
                className="h-full w-full object-cover"
              />
            ) : (
              <Music aria-hidden="true" className="h-6 w-6 text-disabled" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate font-sans text-base font-semibold text-primary"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="sr-only">Now playing: </span>
              {current?.title}
            </p>
            <p className="truncate font-sans text-sm text-secondary">
              {current?.artist}
              {current?.album && (
                <>
                  <span aria-hidden="true"> · </span>
                  {current.album}
                </>
              )}
            </p>
          </div>
        </div>

        {/* ── Seek ──────────────────────────────────────────────────────── */}
        <div className="flex w-full items-center gap-3">
          <span className="w-10 text-right font-mono text-xs text-secondary tabular-nums">
            {formatDuration(progressSec)}
          </span>
          <input
            type="range"
            min={0}
            max={max || 100}
            step={1}
            value={Math.min(progressSec, max || 0)}
            onChange={(e) => seek(Number(e.currentTarget.value))}
            disabled={max === 0}
            aria-label="Seek"
            className="player-range h-1 flex-1"
            style={{ ['--range-fill' as string]: `${progressPercent}%` }}
          />
          <span className="w-10 font-mono text-xs text-secondary tabular-nums">
            {formatDuration(max)}
          </span>
        </div>

        {/* ── Transporte (teclas Walkman) ───────────────────────────────── */}
        <div className="flex items-center gap-3">
          <WalkmanKey
            onClick={toggleShuffle}
            active={shuffle}
            label={shuffle ? 'Shuffle on' : 'Shuffle off'}
          >
            <Shuffle aria-hidden="true" className="h-4 w-4" />
          </WalkmanKey>

          <WalkmanKey onClick={previous} disabled={!hasPrevious} label="Previous track">
            <SkipBack aria-hidden="true" className="h-5 w-5" />
          </WalkmanKey>

          <WalkmanKey
            onClick={toggle}
            variant="primary"
            label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause aria-hidden="true" className="h-6 w-6" />
            ) : (
              <Play aria-hidden="true" className="h-6 w-6 translate-x-px" />
            )}
          </WalkmanKey>

          <WalkmanKey onClick={next} disabled={!hasNext} label="Next track">
            <SkipForward aria-hidden="true" className="h-5 w-5" />
          </WalkmanKey>

          <WalkmanKey
            onClick={cycleRepeat}
            active={repeat !== 'off'}
            label={repeatLabel}
          >
            {repeat === 'one' ? (
              <Repeat1 aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Repeat aria-hidden="true" className="h-4 w-4" />
            )}
          </WalkmanKey>
        </div>

        {/* ── STOP + volumen ────────────────────────────────────────────── */}
        <div className="flex w-full items-center justify-between gap-4">
          <WalkmanKey onClick={handleStop} label="Stop">
            <Square aria-hidden="true" className="h-4 w-4" />
          </WalkmanKey>

          <div className="flex flex-1 items-center gap-2" role="group" aria-label="Volume">
            <Volume2 aria-hidden="true" className="h-4 w-4 shrink-0 text-disabled" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.currentTarget.value))}
              aria-label="Volume"
              className="player-range h-1 flex-1"
              style={{ ['--range-fill' as string]: `${Math.round(volume * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}
