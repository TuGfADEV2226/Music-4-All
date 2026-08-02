'use client'

import { forwardRef } from 'react'

import { cn } from '@/shared/lib/cn'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon-only' | 'neon'
export type ButtonSize = 'sm' | 'md' | 'lg'
/** Color del tubo de neón para variant="neon" (default cian). */
export type NeonColor = 'cyan' | 'purple'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Solo aplica a variant="neon" — elige el color del glow/borde. */
  neonColor?: NeonColor
  /** Shows inline skeleton while async action is in progress */
  loading?: boolean
  leadingIcon?: React.ReactNode
  trailingIcon?: React.ReactNode
}

// ─── Variant styles (design-system §3.1) ─────────────────────────────────────

const VARIANTS: Record<ButtonVariant, string> = {
  primary: [
    'bg-teal-500 text-surface-void border-transparent',
    'hover:bg-teal-400',
    'focus-visible:shadow-glow-focus',
    'disabled:pointer-events-none disabled:opacity-[0.38]',
    'active:scale-[0.97] active:translate-y-px',
  ].join(' '),

  secondary: [
    'bg-transparent border text-primary',
    'hover:bg-surface-rack hover:border-teal-500',
    'focus-visible:shadow-glow-focus',
    'disabled:pointer-events-none disabled:opacity-[0.38]',
    'active:scale-[0.97] active:translate-y-px',
  ].join(' '),

  ghost: [
    'bg-transparent border-transparent text-secondary',
    'hover:bg-surface-console hover:text-primary',
    'focus-visible:shadow-glow-focus',
    'disabled:pointer-events-none disabled:opacity-[0.38]',
    'active:scale-[0.97] active:translate-y-px',
  ].join(' '),

  danger: [
    'bg-transparent border border-semantic-error text-semantic-error-on-dark',
    'hover:bg-semantic-error/10',
    'focus-visible:shadow-glow-error',
    'disabled:pointer-events-none disabled:opacity-[0.38]',
    'active:scale-[0.97] active:translate-y-px',
  ].join(' '),

  'icon-only': [
    'bg-transparent border-transparent text-secondary p-0',
    'hover:bg-surface-console hover:text-primary',
    'focus-visible:shadow-glow-focus',
    'disabled:pointer-events-none disabled:opacity-[0.38]',
    'active:scale-[0.97]',
  ].join(' '),

  neon: [
    'bg-teal-400/10 border-2 border-teal-400 text-teal-400',
    'uppercase tracking-wider font-bold',
    'hover:bg-teal-400/25 hover:shadow-glow-active',
    'focus-visible:shadow-glow-focus',
    'disabled:pointer-events-none disabled:opacity-[0.38]',
    'active:scale-[0.97] active:translate-y-px',
    'transition-all duration-200',
  ].join(' '),
}

// ─── Neon color overrides (design-system §13 — variante aditiva) ──────────────
// Solo se aplican cuando variant="neon". 'cyan' usa VARIANTS.neon; 'purple'
// reemplaza borde/texto/hover por synthwave-magenta + shadow-glow-magenta.

const NEON_COLORS: Record<NeonColor, string> = {
  cyan: VARIANTS.neon,
  purple: [
    'bg-synthwave-magenta/10 border-2 border-synthwave-magenta text-synthwave-magenta',
    'uppercase tracking-wider font-bold',
    'hover:bg-synthwave-magenta/25 hover:shadow-glow-magenta',
    'focus-visible:shadow-glow-focus',
    'disabled:pointer-events-none disabled:opacity-[0.38]',
    'active:scale-[0.97] active:translate-y-px',
    'transition-all duration-200',
  ].join(' '),
}

// ─── Size styles (design-system §3.1 — tamaños) ───────────────────────────────

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-[10px] text-xs gap-1',
  md: 'h-9 px-4 text-sm gap-1',
  lg: 'h-11 px-5 text-base gap-1',
}

const ICON_ONLY_SIZES: Record<ButtonSize, string> = {
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
  lg: 'w-11 h-11',
}

// ─── Component ────────────────────────────────────────────────────────────────

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      neonColor = 'cyan',
      loading = false,
      leadingIcon,
      trailingIcon,
      children,
      className,
      disabled,
      type = 'button',
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    const isIconOnly = variant === 'icon-only'
    const variantClass = variant === 'neon' ? NEON_COLORS[neonColor] : VARIANTS[variant]

    // icon-only buttons MUST have aria-label (spec §5 accessibility)
    if (process.env.NODE_ENV !== 'production' && isIconOnly && !ariaLabel) {
      console.warn('[Button] variant="icon-only" requires an aria-label for accessibility.')
    }

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-label={ariaLabel}
        aria-busy={loading || undefined}
        className={cn(
          'inline-flex items-center justify-center rounded-md font-sans font-medium',
          'transition-all duration-150 ease-out',
          'focus-visible:outline-none',
          variantClass,
          isIconOnly ? ICON_ONLY_SIZES[size] : SIZES[size],
          className
        )}
        {...props}
      >
        {loading ? (
          // Inline skeleton of the label — spec §4.1 button loading state
          <span
            aria-hidden="true"
            className="h-[0.875em] w-12 animate-pulse rounded-sm bg-current/30"
          />
        ) : (
          <>
            {leadingIcon && <span aria-hidden="true">{leadingIcon}</span>}
            {children}
            {trailingIcon && <span aria-hidden="true">{trailingIcon}</span>}
          </>
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'
