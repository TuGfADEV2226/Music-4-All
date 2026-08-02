'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'

import { cn } from '@/shared/lib/cn'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface ToastProps {
  id: string
  variant: ToastVariant
  title: string
  description?: string
  /** Auto-dismiss ms. 0 = manual only. Defaults: success/info=4000, error/warning=0 */
  duration?: number
  onClose: (id: string) => void
}

// ─── Style maps (design-system §3.5) ─────────────────────────────────────────

const ACCENT_BORDER: Record<ToastVariant, string> = {
  success: 'border-l-semantic-success',
  error:   'border-l-semantic-error',
  warning: 'border-l-semantic-warning',
  info:    'border-l-semantic-info',
}

const ICON_COLOR: Record<ToastVariant, string> = {
  success: 'text-semantic-success-on-dark',
  error:   'text-semantic-error-on-dark',
  warning: 'text-semantic-warning-on-dark',
  info:    'text-semantic-info-on-dark',
}

const DEFAULT_DURATIONS: Record<ToastVariant, number> = {
  success: 4000,
  info:    4000,
  warning: 0,
  error:   0,
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ToastIcon({ variant }: { variant: ToastVariant }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0', ICON_COLOR[variant])}
    >
      {variant === 'success' && (
        <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {variant === 'error' && (
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      )}
      {variant === 'warning' && (
        <>
          <path d="M8 3l5.5 9.5H2.5L8 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M8 7v2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
        </>
      )}
      {variant === 'info' && (
        <>
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 7v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="5.5" r="0.5" fill="currentColor" />
        </>
      )}
    </svg>
  )
}

// ─── Framer Motion variants ───────────────────────────────────────────────────

const toastV = {
  hidden:  { opacity: 0, x: 60, scale: 0.96 },
  visible: { opacity: 1, x: 0,  scale: 1,  transition: { duration: 0.3, ease: 'easeOut' } },
  exit:    { opacity: 0, x: 60, scale: 0.96, transition: { duration: 0.2, ease: 'easeIn' } },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Toast({ id, variant, title, description, duration, onClose }: ToastProps) {
  const effectiveDuration = duration ?? DEFAULT_DURATIONS[variant]

  // Auto-dismiss (spec §3.5: success/info auto-dismiss 4000ms)
  useEffect(() => {
    if (effectiveDuration === 0) return
    const timer = setTimeout(() => onClose(id), effectiveDuration)
    return () => clearTimeout(timer)
  }, [id, effectiveDuration, onClose])

  return (
    <motion.div
      layout
      variants={toastV}
      initial="hidden"
      animate="visible"
      exit="exit"
      role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}
      aria-live={variant === 'error' || variant === 'warning' ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={cn(
        // Base (design-system §3.5)
        'w-[360px] max-w-[calc(100vw-2rem)]',
        'bg-surface-studio border rounded-md shadow-lg',
        'px-4 py-3',
        // Left accent border
        'border-l-[3px]',
        ACCENT_BORDER[variant],
        'flex items-start gap-3',
      )}
    >
      <ToastIcon variant={variant} />

      <div className="flex-1 min-w-0">
        <p className="font-sans text-sm font-medium text-primary leading-tight">
          {title}
        </p>
        {description && (
          <p className="font-sans text-xs text-secondary mt-0.5 leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {/* Close button — error/warning are persistent (spec §3.5) */}
      <button
        onClick={() => onClose(id)}
        aria-label="Dismiss notification"
        className={cn(
          'shrink-0 text-secondary hover:text-primary',
          'transition-colors duration-100',
          'focus-visible:outline-none focus-visible:shadow-glow-focus rounded-sm',
        )}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </motion.div>
  )
}
