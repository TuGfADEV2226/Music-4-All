import { cn } from '@/shared/lib/cn'

// ─── Types ───────────────────────────────────────────────────────────────────

export type BadgeVariant =
  | 'default'
  | 'format'
  | 'quality'
  | 'status-ok'
  | 'status-error'
  | 'status-warn'
  | 'status-info'
  | 'status-queue'

export interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  /** Renders a colored dot before the text */
  dot?: boolean
  className?: string
  /** Tooltip text when content is truncated */
  title?: string
}

// ─── Variant styles (design-system §3.6) ─────────────────────────────────────

const VARIANTS: Record<BadgeVariant, string> = {
  default:      'border text-secondary',
  format:       'border border-teal-500 text-teal-300 bg-transparent',
  quality:      'border border-teal-500 bg-teal-500/15 text-teal-400',
  'status-ok':  'bg-semantic-success/15 text-semantic-success-on-dark',
  'status-error': 'bg-semantic-error/15 text-semantic-error-on-dark',
  'status-warn':  'bg-semantic-warning/15 text-semantic-warning-on-dark',
  'status-info':  'bg-semantic-info/15 text-semantic-info-on-dark',
  'status-queue': 'bg-semantic-queue/15 text-semantic-queue-on-dark',
}

const DOT_COLORS: Partial<Record<BadgeVariant, string>> = {
  'status-ok':    'bg-semantic-success',
  'status-error': 'bg-semantic-error',
  'status-warn':  'bg-semantic-warning',
  'status-info':  'bg-semantic-info',
  'status-queue': 'bg-semantic-queue',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Badge({
  children,
  variant = 'default',
  dot = false,
  className,
  title,
}: BadgeProps) {
  // Dev warning: max 8 chars (design-system §3.6)
  if (process.env.NODE_ENV !== 'production') {
    const text = typeof children === 'string' ? children : ''
    if (text.length > 8) {
      console.warn(`[Badge] Text "${text}" exceeds 8-character limit (design-system §3.6).`)
    }
  }

  return (
    <span
      title={title}
      className={cn(
        // Base (design-system §3.6)
        'inline-flex items-center gap-1 rounded-sm',
        'font-mono text-2xs font-medium uppercase',
        'py-0.5 px-1',
        VARIANTS[variant],
        className
      )}
    >
      {dot && DOT_COLORS[variant] && (
        <span
          aria-hidden="true"
          className={cn('inline-block h-1.5 w-1.5 rounded-full', DOT_COLORS[variant])}
        />
      )}
      {children}
    </span>
  )
}
