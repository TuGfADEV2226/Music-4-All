'use client'

import { Bell } from 'lucide-react'

import { Card } from '@/shared/ui/Card'
import { cn } from '@/shared/lib/cn'

import { usePushNotifications } from '../model/usePushNotifications'

/**
 * Tarjeta de Ajustes para activar/desactivar las notificaciones "descarga lista".
 *
 * Se oculta si el navegador no soporta push o el servidor no lo tiene activo (sin
 * claves VAPID) — así no aparece un control muerto. Si no hay service worker (dev o
 * app no instalada), muestra la razón en vez del toggle.
 */
export function PushNotificationsToggle() {
  const { supported, backendEnabled, swReady, subscribed, busy, error, enable, disable } =
    usePushNotifications()

  // Sin soporte del navegador o del servidor: no renderizar nada (no ensuciar Ajustes).
  if (!supported || !backendEnabled) return null

  const toggle = () => (subscribed ? void disable() : void enable())

  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Bell aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
          <div>
            <h2 className="font-sans text-base font-semibold text-primary">
              Download notifications
            </h2>
            <p className="mt-1 font-sans text-sm text-secondary">
              {swReady
                ? 'Get a push notification on this device when a download finishes.'
                : 'Install the app to enable download notifications.'}
            </p>
            {error && <p className="mt-1 font-sans text-xs text-semantic-error-on-dark">{error}</p>}
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={subscribed}
          aria-label="Download notifications"
          disabled={!swReady || busy}
          onClick={toggle}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full',
            'transition-colors duration-150',
            'focus-visible:outline-none focus-visible:shadow-glow-focus',
            'disabled:cursor-not-allowed disabled:opacity-50',
            subscribed ? 'bg-teal-500' : 'bg-surface-rack',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'inline-block h-4 w-4 rounded-full bg-primary shadow-sm',
              'transition-transform duration-150',
              subscribed ? 'translate-x-6' : 'translate-x-1',
            )}
          />
        </button>
      </div>
    </Card>
  )
}
