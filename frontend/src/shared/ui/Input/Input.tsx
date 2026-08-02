'use client'

import { forwardRef, useId } from 'react'

import { cn } from '@/shared/lib/cn'

// ─── Types ───────────────────────────────────────────────────────────────────

export type InputVariant = 'default' | 'filled' | 'ghost'
export type InputSize = 'sm' | 'md' | 'lg'

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  variant?: InputVariant
  size?: InputSize
  /** Activates error border and red helper text */
  error?: boolean
  /** Label rendered above the input */
  label?: string
  /** Helper or error message rendered below the input */
  helperText?: string
  leadingIcon?: React.ReactNode
  trailingIcon?: React.ReactNode
  wrapperClassName?: string
}

// ─── Style maps (design-system §3.2) ─────────────────────────────────────────

const VARIANT_TRACK: Record<InputVariant, string> = {
  default: 'bg-surface-console border',
  filled:  'bg-surface-studio border-0',
  ghost:   'bg-transparent border border-subtle',
}

const SIZE_TRACK: Record<InputSize, string> = {
  sm: 'h-7 px-[10px] text-xs',
  md: 'h-9 px-[14px] text-sm',
  lg: 'h-11 px-4 text-base',
}

// ─── Component ────────────────────────────────────────────────────────────────

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      variant = 'default',
      size = 'md',
      error = false,
      label,
      helperText,
      leadingIcon,
      trailingIcon,
      wrapperClassName,
      className,
      id: externalId,
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = useId()
    const id = externalId ?? generatedId

    return (
      <div className={cn('flex flex-col gap-1', wrapperClassName)}>
        {/* Label — Inter xs, font-medium, text-secondary */}
        {label && (
          <label
            htmlFor={id}
            className="font-sans text-xs font-medium text-secondary"
          >
            {label}
          </label>
        )}

        {/* Input wrapper */}
        <div className="relative flex items-center">
          {leadingIcon && (
            <span
              aria-hidden="true"
              className="absolute left-3 flex items-center text-secondary"
            >
              {leadingIcon}
            </span>
          )}

          <input
            ref={ref}
            id={id}
            disabled={disabled}
            aria-invalid={error || undefined}
            aria-describedby={helperText ? `${id}-helper` : undefined}
            className={cn(
              'w-full rounded-md font-sans text-primary',
              'placeholder:text-ghost',
              'transition-colors duration-100 ease-out',
              'outline-none',
              'focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50',
              'disabled:pointer-events-none disabled:opacity-[0.38]',
              VARIANT_TRACK[variant],
              SIZE_TRACK[size],
              error && 'border-semantic-error focus:border-semantic-error focus:ring-semantic-error/50',
              leadingIcon && 'pl-9',
              trailingIcon && 'pr-9',
              className
            )}
            {...props}
          />

          {trailingIcon && (
            <span
              aria-hidden="true"
              className="absolute right-3 flex items-center text-secondary"
            >
              {trailingIcon}
            </span>
          )}
        </div>

        {/* Helper / error text — Inter xs */}
        {helperText && (
          <p
            id={`${id}-helper`}
            className={cn(
              'font-sans text-xs',
              error ? 'text-semantic-error-on-dark' : 'text-secondary'
            )}
          >
            {helperText}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
