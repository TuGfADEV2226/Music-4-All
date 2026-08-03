import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDownloadSocket } from '@/features/downloads/hooks/useDownloadSocket'
import { useDownloadsStore } from '@/features/downloads/model/downloads.store'
import type { AudioQuality } from '@/entities'

// ─── Fake WebSocket ───────────────────────────────────────────────────────────
//
// useDownloadSocket (src/features/downloads/hooks/useDownloadSocket.ts) talks to
// the browser's global `WebSocket`. There is no injectable transport, so the
// only way to drive it from a test is to replace `globalThis.WebSocket` with a
// controllable fake before the hook mounts, and call its `simulate*` helpers
// to play back server events.

type CloseHandler = (event: { code: number }) => void
type MessageHandler = (event: { data: string }) => void

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = FakeWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: MessageHandler | null = null
  onclose: CloseHandler | null = null
  onerror: (() => void) | null = null
  readonly sent: string[] = []

  constructor(public readonly url: string) {
    instances.push(this)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.simulateClose(1000)
  }

  // ── Test helpers — not part of the real WebSocket API ──────────────────────

  simulateOpen(): void {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  simulateMessage(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }

  simulateClose(code: number): void {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code })
  }
}

let instances: FakeWebSocket[] = []

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_JOB = {
  backendJobId: 'backend-job-1',
  albumId: 'album-251380837',
  albumTitle: 'Toxicity',
  artistName: 'System of a Down',
  totalTracks: 14,
  qualityOverride: 'MASTER' as AudioQuality,
}

function resetDownloadsStore() {
  useDownloadsStore.setState({
    queue: [],
    isPanelVisible: false,
    isPanelExpanded: true,
    wsConnected: false,
    pendingAuthRecovery: null,
  })
}

function latestSocket(): FakeWebSocket {
  return instances[instances.length - 1]
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  instances = []
  resetDownloadsStore()
  vi.stubGlobal('WebSocket', FakeWebSocket)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useDownloadSocket', () => {
  it('opens exactly one WebSocket connection on mount', () => {
    renderHook(() => useDownloadSocket())
    expect(instances).toHaveLength(1)
  })

  it('sets wsConnected to true once the socket opens', async () => {
    renderHook(() => useDownloadSocket())
    act(() => latestSocket().simulateOpen())

    await waitFor(() => {
      expect(useDownloadsStore.getState().wsConnected).toBe(true)
    })
  })

  describe('message handling', () => {
    beforeEach(() => {
      useDownloadsStore.getState().enqueue(MOCK_JOB)
    })

    it('applies "job_started": marks the job active and stores startedAt', async () => {
      renderHook(() => useDownloadSocket())
      act(() => latestSocket().simulateOpen())

      act(() =>
        latestSocket().simulateMessage({
          type: 'job_started',
          job_id: MOCK_JOB.backendJobId,
          payload: { started_at: '2026-06-17T10:00:00.000Z' },
        })
      )

      await waitFor(() => {
        const job = useDownloadsStore.getState().queue[0]
        expect(job.status).toBe('active')
        expect(job.startedAt).toBe('2026-06-17T10:00:00.000Z')
      })
    })

    it('applies "progress": updates percent/speed/eta on an active job', async () => {
      useDownloadsStore.getState().updateByBackendId(MOCK_JOB.backendJobId, { status: 'active' })
      renderHook(() => useDownloadSocket())
      act(() => latestSocket().simulateOpen())

      act(() =>
        latestSocket().simulateMessage({
          type: 'progress',
          job_id: MOCK_JOB.backendJobId,
          payload: {
            current_track_filename: '03 - Toxicity.flac',
            completed_tracks: 3,
            total_tracks: 14,
            progress_percent: 42,
            speed_mbps: 5.1,
            eta_seconds: 90,
          },
        })
      )

      await waitFor(() => {
        const job = useDownloadsStore.getState().queue[0]
        expect(job.status).toBe('active')
        expect(job.progressPercent).toBe(42)
        expect(job.completedTracks).toBe(3)
        expect(job.speedMbps).toBe(5.1)
        expect(job.etaSeconds).toBe(90)
        expect(job.currentTrackFilename).toBe('03 - Toxicity.flac')
      })
    })

    it('applies "job_completed": marks the job done with output path', async () => {
      useDownloadsStore.getState().updateByBackendId(MOCK_JOB.backendJobId, { status: 'active' })
      renderHook(() => useDownloadSocket())
      act(() => latestSocket().simulateOpen())

      act(() =>
        latestSocket().simulateMessage({
          type: 'job_completed',
          job_id: MOCK_JOB.backendJobId,
          payload: {
            output_path: '/downloads/Toxicity',
            completed_at: '2026-06-17T10:05:00.000Z',
            total_tracks: 14,
          },
        })
      )

      await waitFor(() => {
        const job = useDownloadsStore.getState().queue[0]
        expect(job.status).toBe('completed')
        expect(job.progressPercent).toBe(100)
        expect(job.outputPath).toBe('/downloads/Toxicity')
        expect(job.completedAt).toBe('2026-06-17T10:05:00.000Z')
      })
    })

    it('applies "job_error": marks the job as error with the backend message', async () => {
      useDownloadsStore.getState().updateByBackendId(MOCK_JOB.backendJobId, { status: 'active' })
      renderHook(() => useDownloadSocket())
      act(() => latestSocket().simulateOpen())

      act(() =>
        latestSocket().simulateMessage({
          type: 'job_error',
          job_id: MOCK_JOB.backendJobId,
          payload: {
            code: 500,
            message: 'Tidal API unreachable',
            retriable: true,
            completed_tracks: 2,
          },
        })
      )

      await waitFor(() => {
        const job = useDownloadsStore.getState().queue[0]
        expect(job.status).toBe('error')
        expect(job.error).toEqual({
          code: 500,
          message: 'Tidal API unreachable',
          retriable: true,
        })
      })
    })

    it('"job_error" with a retriable 401/403 also flags pendingAuthRecovery for the job', async () => {
      useDownloadsStore.getState().updateByBackendId(MOCK_JOB.backendJobId, { status: 'active' })
      renderHook(() => useDownloadSocket())
      act(() => latestSocket().simulateOpen())

      act(() =>
        latestSocket().simulateMessage({
          type: 'job_error',
          job_id: MOCK_JOB.backendJobId,
          payload: { code: 401, message: 'Session expired', retriable: true, completed_tracks: 2 },
        })
      )

      await waitFor(() => {
        expect(useDownloadsStore.getState().pendingAuthRecovery).toBe(MOCK_JOB.backendJobId)
      })
    })
  })

  describe('reconnection', () => {
    beforeEach(() => vi.useFakeTimers())

    it('reconnects automatically after an unexpected close', () => {
      renderHook(() => useDownloadSocket())
      act(() => latestSocket().simulateOpen())
      expect(instances).toHaveLength(1)

      act(() => latestSocket().simulateClose(1006)) // abnormal closure
      expect(useDownloadsStore.getState().wsConnected).toBe(false)

      // First reconnect attempt fires after 1000ms (exponential backoff, attempt 0)
      act(() => vi.advanceTimersByTime(1000))
      expect(instances).toHaveLength(2)
    })

    it(
      'currently reconnects even on a server clean-close (code 1000) — ' +
        'the implementation has no code-based exemption; this test pins that behavior ' +
        'so a future change is a deliberate, visible diff rather than a silent regression',
      () => {
        renderHook(() => useDownloadSocket())
        act(() => latestSocket().simulateOpen())

        act(() => latestSocket().simulateClose(1000))
        act(() => vi.advanceTimersByTime(1000))

        expect(instances).toHaveLength(2)
      }
    )

    it('stops reconnecting once the hook unmounts (disconnect() sets the destroyed flag)', () => {
      const { unmount } = renderHook(() => useDownloadSocket())
      act(() => latestSocket().simulateOpen())

      act(() => latestSocket().simulateClose(1006))
      unmount() // effect cleanup calls client.disconnect() → destroyed = true

      // The pending reconnect timer still fires, but connect() now returns
      // immediately because `destroyed` is true — no new socket is created.
      act(() => vi.advanceTimersByTime(30_000))
      expect(instances).toHaveLength(1)
    })
  })
})

// ─── Volver a la pestaña reconecta al instante ────────────────────────────────
//
// En el móvil el navegador congela la página al pasar a segundo plano y el
// socket muere. Antes solo había un reintento por temporizador con backoff
// exponencial, así que al volver se podía esperar hasta 30 s — o para siempre,
// porque a los 10 intentos `scheduleReconnect` se rendía en silencio y la
// interfaz se quedaba en "Offline" hasta recargar.

describe('useDownloadSocket — recuperación al volver a la pantalla', () => {
  it('reconecta al instante al volver la visibilidad, sin esperar al backoff', () => {
    vi.useFakeTimers()
    renderHook(() => useDownloadSocket())
    act(() => latestSocket().simulateOpen())
    expect(instances).toHaveLength(1)

    // El navegador mata el socket al mandar la pestaña a segundo plano.
    act(() => latestSocket().simulateClose(1006))
    expect(useDownloadsStore.getState().wsConnected).toBe(false)

    // Al volver, sin dejar correr ningún temporizador, ya hay socket nuevo.
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(instances).toHaveLength(2)
  })

  it('reconecta al recuperar la red', () => {
    vi.useFakeTimers()
    renderHook(() => useDownloadSocket())
    act(() => latestSocket().simulateOpen())
    act(() => latestSocket().simulateClose(1006))

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(instances).toHaveLength(2)
  })

  it('no abre un socket de más si ya está conectado', () => {
    vi.useFakeTimers()
    renderHook(() => useDownloadSocket())
    act(() => latestSocket().simulateOpen())

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('online'))
    })
    expect(instances).toHaveLength(1)
  })

  it('se recupera aunque se hayan agotado los reintentos', () => {
    vi.useFakeTimers()
    renderHook(() => useDownloadSocket())
    // 10 ciclos abrir→cerrar agotan MAX_ATTEMPTS sin que ninguno llegue a abrir.
    act(() => latestSocket().simulateClose(1006))
    for (let i = 0; i < 12; i++) {
      act(() => vi.advanceTimersByTime(30_000))
      const s = latestSocket()
      if (s.readyState !== FakeWebSocket.CLOSED) act(() => s.simulateClose(1006))
    }
    const agotados = instances.length
    act(() => vi.advanceTimersByTime(120_000))
    expect(instances).toHaveLength(agotados) // se rindió: ya no reintenta solo

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(instances.length).toBeGreaterThan(agotados) // vuelve a la vida
  })
})
