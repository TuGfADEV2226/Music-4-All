'use client'

import { useState } from 'react'
import { Check, ExternalLink, Headphones } from 'lucide-react'

import { Button, Card, Input } from '@/shared/ui'
import { isApiError } from '@/shared/lib/errors'
import {
  usePkceCompleteMutation,
  usePkceDisconnectMutation,
  usePkceStartMutation,
  usePkceStatusQuery,
} from '../model/pkce.queries'

/** Traduce el error del canje PKCE a un mensaje claro (la API responde en español). */
function completeErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    switch (err.code) {
      case 'PKCE_WRONG_ACCOUNT':
        return "That Tidal account doesn't match your session — sign in with the same account you use here."
      case 'PKCE_NOT_STARTED':
        return 'The Hi-Fi login expired. Start it again.'
      case 'PKCE_EXCHANGE_FAILED':
        return "Couldn't complete the Hi-Fi login. Make sure you pasted the full redirected URL, then try again."
      default:
        return err.message
    }
  }
  return 'Something went wrong. Please try again.'
}

/**
 * Conexión Hi-Fi (16-bit) — segunda sesión Tidal del usuario vía PKCE.
 *
 * El cliente por defecto entrega hi-res 24-bit pero no el 16-bit LOSSLESS; esta
 * segunda sesión web sí. Como el redirect de Tidal es fijo, no hay callback: el
 * usuario abre el login, y pega a mano la URL de la página "Oops" a la que Tidal
 * lo redirige. Al conectar/desconectar, el estado cacheado (`pkceStatus`) cambia
 * y el selector de calidad habilita/bloquea "16-bit" en consecuencia.
 */
export function HiFiConnection() {
  const status = usePkceStatusQuery()
  const startMutation = usePkceStartMutation()
  const completeMutation = usePkceCompleteMutation()
  const disconnectMutation = usePkceDisconnectMutation()

  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [redirectUrl, setRedirectUrl] = useState('')

  const connected = status.data === true
  const busy =
    startMutation.isPending || completeMutation.isPending || disconnectMutation.isPending

  function handleStart() {
    completeMutation.reset()
    startMutation.mutate(undefined, {
      onSuccess: (url) => {
        setLoginUrl(url)
        // Abrir en otra pestaña; si el navegador bloquea el popup, el usuario
        // tiene igualmente el enlace visible para abrirlo a mano.
        window.open(url, '_blank', 'noopener,noreferrer')
      },
    })
  }

  function handleComplete() {
    const url = redirectUrl.trim()
    if (!url) return
    completeMutation.mutate(url, {
      onSuccess: () => {
        setLoginUrl(null)
        setRedirectUrl('')
      },
    })
  }

  function handleDisconnect() {
    disconnectMutation.mutate(undefined, {
      onSuccess: () => {
        setLoginUrl(null)
        setRedirectUrl('')
        completeMutation.reset()
      },
    })
  }

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-sans text-base font-semibold text-primary">
              <Headphones aria-hidden="true" className="h-4 w-4 text-teal-400" />
              Hi-Fi 16-bit
            </h2>
            <p className="mt-1 font-sans text-sm text-secondary">
              Connect a second Tidal login to unlock lossless 16-bit (CD-quality) FLAC
              downloads. Your default login only reaches Hi-Res 24-bit and AAC.
            </p>
          </div>

          {/* Estado de conexión (aria-live para lectores de pantalla). */}
          <span
            role="status"
            aria-live="polite"
            className="shrink-0 font-mono text-2xs uppercase tracking-wider"
          >
            {status.isLoading ? (
              <span className="text-ghost">Checking…</span>
            ) : connected ? (
              <span className="flex items-center gap-1 text-teal-400">
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
                Connected
              </span>
            ) : (
              <span className="text-secondary">Not connected</span>
            )}
          </span>
        </div>

        {/* ── Acciones ─────────────────────────────────────────────────── */}
        {connected ? (
          <div className="flex items-center justify-between gap-4">
            <p className="font-sans text-sm text-secondary">
              16-bit downloads are enabled.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleDisconnect}
              loading={disconnectMutation.isPending}
              disabled={busy}
              aria-label="Disconnect the Hi-Fi 16-bit session"
            >
              {disconnectMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          </div>
        ) : loginUrl ? (
          // Paso 2: el login se abrió; el usuario pega la URL "Oops".
          <div className="flex flex-col gap-3">
            <p className="font-sans text-sm text-secondary">
              A Tidal login opened in a new tab. After signing in, Tidal shows an
              “Oops” page — copy that page’s full URL from your browser’s address bar
              and paste it here.
            </p>
            <a
              href={loginUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1 font-sans text-xs text-teal-400 hover:underline"
            >
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
              Reopen the Tidal login
            </a>
            <Input
              label="Redirected URL"
              placeholder="https://tidal.com/android/login/auth?code=…"
              value={redirectUrl}
              onChange={(e) => setRedirectUrl(e.target.value)}
              error={completeMutation.isError}
              helperText={completeMutation.isError ? completeErrorMessage(completeMutation.error) : undefined}
              autoComplete="off"
              spellCheck={false}
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleComplete}
                loading={completeMutation.isPending}
                disabled={completeMutation.isPending || redirectUrl.trim() === ''}
              >
                {completeMutation.isPending ? 'Connecting…' : 'Finish connecting'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLoginUrl(null)
                  setRedirectUrl('')
                  completeMutation.reset()
                }}
                disabled={completeMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          // Paso 1: conectar.
          <div className="flex items-center justify-between gap-4">
            <p className="font-sans text-sm text-secondary">
              You’ll sign in to Tidal once and paste back the redirected URL.
            </p>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleStart}
              loading={startMutation.isPending}
              disabled={busy || status.isLoading}
            >
              {startMutation.isPending ? 'Opening…' : 'Connect Hi-Fi'}
            </Button>
          </div>
        )}

        {startMutation.isError && (
          <p role="alert" className="font-sans text-xs text-semantic-error-on-dark">
            Couldn’t start the Hi-Fi login. Please try again.
          </p>
        )}
      </div>
    </Card>
  )
}
