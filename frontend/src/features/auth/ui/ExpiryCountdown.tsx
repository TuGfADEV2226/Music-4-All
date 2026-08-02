'use client'

import { useEffect, useState } from 'react'

import { cn } from '@/shared/lib/cn'

import { computeRemainingMs, formatMmSs } from '@/features/auth/model/countdown'

export interface ExpiryCountdownProps {
  /** Timestamp absoluto (ms) en que se recibió el código. */
  issuedAt: number
  /** Vigencia del código en segundos (DeviceAuthCode.expiresIn). */
  expiresIn: number
  className?: string
}

/**
 * Contador `mm:ss` de expiración del código OAuth. Recalcula desde `issuedAt`
 * absoluto una vez por segundo (no anima nada — es texto informativo). El
 * número se marca aria-hidden para no saturar lectores de pantalla; la etiqueta
 * visible acompañante comunica el propósito. La expiración real la detecta el
 * polling (DEVICE_AUTH_EXPIRED); este contador es solo informativo.
 */
export function ExpiryCountdown({ issuedAt, expiresIn, className }: ExpiryCountdownProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const remaining = computeRemainingMs(issuedAt, expiresIn, now)
  const expired = remaining <= 0

  return (
    <span
      aria-hidden="true"
      className={cn(
        'font-retro text-lg tabular-nums',
        expired ? 'text-semantic-error-on-dark' : 'text-teal-300',
        className
      )}
      style={expired ? undefined : { textShadow: '0 0 6px var(--color-teal-300)' }}
    >
      {formatMmSs(remaining)}
    </span>
  )
}
