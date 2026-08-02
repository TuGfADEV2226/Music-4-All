import { cn } from '@/shared/lib/cn'

// ─── Types ───────────────────────────────────────────────────────────────────

export type RetroDisplaySize = 'sm' | 'md' | 'lg'
export type RetroDisplayColor = 'cyan' | 'amber'

export interface RetroDisplayProps {
  value: string
  size?: RetroDisplaySize
  /** Color del tubo — 'cyan' (neón, a juego con el letrero) o 'amber' (Nixie). */
  color?: RetroDisplayColor
  /** Tooltip opcional en el contenedor (p. ej. "Authorization code: ..."). */
  title?: string
  className?: string
}

// ─── Config (FRONTEND_VISION.md §1.2-C — display retro del código OAuth) ─────
// Fuente VT323 (font-retro); glow vía text-shadow con CSS vars del design system.

const BOX_SIZES: Record<RetroDisplaySize, string> = {
  sm: 'h-6  w-5  text-lg',
  md: 'h-9  w-7  text-2xl',
  lg: 'h-12 w-9  text-3xl',
}

interface ColorTokens {
  box: string
  glow: string
}

const COLORS: Record<RetroDisplayColor, ColorTokens> = {
  cyan: {
    box: 'border-teal-300/40 text-teal-300',
    glow: '0 0 4px var(--color-teal-300), 0 0 12px var(--color-teal-300)',
  },
  amber: {
    box: 'border-semantic-warning/40 text-semantic-warning-on-dark',
    glow: '0 0 4px var(--color-warning), 0 0 10px var(--color-warning)',
  },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RetroDisplay({
  value,
  size = 'md',
  color = 'cyan',
  title,
  className,
}: RetroDisplayProps) {
  const tokens = COLORS[color]

  return (
    <span
      role="img"
      aria-label={`Verification code: ${value}`}
      title={title}
      className={cn('inline-flex items-center gap-1', className)}
    >
      {value.split('').map((char, index) => (
        <span
          key={`${index}-${char}`}
          aria-hidden="true"
          className={cn(
            'flex items-center justify-center rounded-sm',
            'border bg-surface-void font-retro font-bold',
            tokens.box,
            BOX_SIZES[size]
          )}
          style={{ textShadow: tokens.glow }}
        >
          {char}
        </span>
      ))}
    </span>
  )
}
