'use client'

import { useEffect } from 'react'

import { buildWsUrl } from '@/shared/config/ws.config'

import { useDownloadsStore } from '../model/downloads.store'

// ─── WS message types (technical-spec.md §5.3 — discriminated union) ─────────

interface ProgressPayload {
  current_track_filename: string
  completed_tracks: number
  total_tracks: number
  progress_percent: number
  speed_mbps: number
  eta_seconds: number
}

interface JobStartedPayload {
  started_at: string
}

interface JobCompletedPayload {
  output_path: string
  completed_at: string
  total_tracks: number
}

interface JobErrorPayload {
  code: number
  message: string
  retriable: boolean
  completed_tracks: number
}

export type WsIncomingMessage =
  | { type: 'progress';      job_id: string; payload: ProgressPayload }
  | { type: 'job_started';   job_id: string; payload: JobStartedPayload }
  | { type: 'job_completed'; job_id: string; payload: JobCompletedPayload }
  | { type: 'job_error';     job_id: string; payload: JobErrorPayload }
  | { type: 'job_paused';    job_id: string; payload: Record<string, never> }
  | { type: 'job_resumed';   job_id: string; payload: Record<string, never> }
  | { type: 'pong';          timestamp: number }

// ─── WebSocket client ─────────────────────────────────────────────────────────

// HTTP status codes that indicate the Tidal session has expired.
// The backend wraps these as SESSION_EXPIRED (403) or UNAUTHORIZED (401).
const SESSION_ERROR_HTTP_CODES = new Set([401, 403])

const MAX_ATTEMPTS      = 10
const HEARTBEAT_MS      = 30_000   // ping every 30s
const HEARTBEAT_TIMEOUT = 60_000   // reconnect if no pong within 60s

class DownloadWebSocketClient {
  private ws: WebSocket | null = null
  private attempts  = 0
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private retry: ReturnType<typeof setTimeout> | null = null
  private lastPong  = Date.now()
  private destroyed = false

  constructor(
    private readonly url: string,
    private readonly onMessage: (msg: WsIncomingMessage) => void,
    private readonly onStatus: (connected: boolean) => void,
  ) {}

  connect(): void {
    if (this.destroyed) return

    try {
      this.ws = new WebSocket(this.url)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.attempts = 0
      this.onStatus(true)
      this.startHeartbeat()
    }

    this.ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(event.data) as WsIncomingMessage
        if (msg.type === 'pong') {
          this.lastPong = Date.now()
          return
        }
        this.onMessage(msg)
      } catch {
        // Ignore malformed messages
      }
    }

    this.ws.onclose = () => {
      this.stopHeartbeat()
      this.onStatus(false)
      if (!this.destroyed) this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      // onclose always fires after onerror — handled there
    }
  }

  private startHeartbeat(): void {
    this.lastPong = Date.now()
    this.heartbeat = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
      if (Date.now() - this.lastPong > HEARTBEAT_TIMEOUT) {
        this.ws.close()   // triggers onclose → reconnect
        return
      }
      this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }))
    }, HEARTBEAT_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
  }

  private scheduleReconnect(): void {
    if (this.attempts >= MAX_ATTEMPTS) return
    const delay = Math.min(1_000 * 2 ** this.attempts, 30_000)
    this.attempts++
    this.retry = setTimeout(() => this.connect(), delay)
  }

  /**
   * Reconecta **ya**, sin esperar al backoff, y reiniciando la cuenta.
   *
   * Lo llama el hook cuando la pestaña vuelve a ser visible o el dispositivo
   * recupera la red. En el móvil es imprescindible: al mandar la pestaña a
   * segundo plano el navegador congela los temporizadores y mata el socket, así
   * que al volver el reintento programado podía tardar hasta 30 s en
   * dispararse — o no dispararse — y la interfaz se quedaba en "Offline" sin
   * que nada lo explicara. Además, agotados los 10 intentos, `scheduleReconnect`
   * se rendía para siempre y solo se recuperaba recargando la página.
   */
  reconnectNow(): void {
    if (this.destroyed) return
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return
    if (this.retry !== null) {
      clearTimeout(this.retry)
      this.retry = null
    }
    this.attempts = 0
    this.connect()
  }

  disconnect(): void {
    this.destroyed = true
    this.stopHeartbeat()
    if (this.retry !== null) {
      clearTimeout(this.retry)
      this.retry = null
    }
    const ws = this.ws
    if (ws) {
      // Cerrar un socket aún en CONNECTING dispara el warning "WebSocket is
      // closed before the connection is established" (visible en dev por el
      // doble-invoke de efectos de React StrictMode: mount → cleanup → mount).
      // Si sigue conectando, esperamos a onopen para cerrarlo limpio y
      // desconectamos los handlers para que no reprograme reconexión.
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
        ws.onopen = () => ws.close()
      } else {
        ws.close()
      }
    }
    this.ws = null
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Mounts the unified /ws/downloads WebSocket client as a singleton.
 *
 * Must be called once in (app)/layout.tsx (via DownloadPanel which is always
 * mounted). Handles reconnection, heartbeat, and store updates automatically.
 *
 * Backend endpoint: ws://[host]/ws/downloads  (RM-01)
 * Multiplexes all active jobs — no per-job connections.
 */
export function useDownloadSocket(): void {
  // buildWsUrl() is safe during client render — has SSR guard internally
  const wsUrl = buildWsUrl()

  useEffect(() => {
    const client = new DownloadWebSocketClient(
      wsUrl,

      // ── Message handler → drives downloads.store ───────────────────────
      (msg) => {
        const { updateByBackendId } = useDownloadsStore.getState()

        switch (msg.type) {
          case 'progress':
            updateByBackendId(msg.job_id, {
              currentTrackFilename: msg.payload.current_track_filename,
              completedTracks:      msg.payload.completed_tracks,
              progressPercent:      msg.payload.progress_percent,
              speedMbps:            msg.payload.speed_mbps,
              etaSeconds:           msg.payload.eta_seconds,
              status:               'active',
            })
            break

          case 'job_started':
            updateByBackendId(msg.job_id, {
              status:    'active',
              startedAt: msg.payload.started_at,
            })
            break

          case 'job_completed':
            updateByBackendId(msg.job_id, {
              status:          'completed',
              completedAt:     msg.payload.completed_at,
              outputPath:      msg.payload.output_path,
              progressPercent: 100,
              speedMbps:       null,
              etaSeconds:      null,
            })
            break

          case 'job_error':
            updateByBackendId(msg.job_id, {
              status: 'error',
              error: {
                code:      msg.payload.code,
                message:   msg.payload.message,
                retriable: msg.payload.retriable,
              },
              speedMbps:  null,
              etaSeconds: null,
            })
            // Detect auth errors — signal DownloadPanel to open SessionRecoveryModal.
            // DownloadPanel (widget layer) bridges downloads ↔ auth features.
            if (SESSION_ERROR_HTTP_CODES.has(msg.payload.code) && msg.payload.retriable) {
              useDownloadsStore.getState().setPendingAuthRecovery(msg.job_id)
            }
            break

          case 'job_paused':
            updateByBackendId(msg.job_id, {
              status:    'paused',
              speedMbps: null,
              etaSeconds: null,
            })
            break

          case 'job_resumed':
            updateByBackendId(msg.job_id, { status: 'active' })
            break
        }
      },

      // ── Connection status → store.wsConnected ──────────────────────────
      (connected) => {
        useDownloadsStore.getState().setWsConnected(connected)
      },
    )

    client.connect()

    // Volver a la pestaña o recuperar la red reconecta al instante. Sin esto, en
    // el móvil el socket muere al pasar a segundo plano (el navegador congela la
    // página) y al volver había que esperar al backoff — hasta 30 s — o recargar
    // si ya se habían agotado los reintentos.
    const revive = () => {
      if (document.visibilityState === 'visible') client.reconnectNow()
    }
    document.addEventListener('visibilitychange', revive)
    window.addEventListener('online', revive)
    window.addEventListener('pageshow', revive)

    return () => {
      document.removeEventListener('visibilitychange', revive)
      window.removeEventListener('online', revive)
      window.removeEventListener('pageshow', revive)
      client.disconnect()
    }
  }, [wsUrl])
}
