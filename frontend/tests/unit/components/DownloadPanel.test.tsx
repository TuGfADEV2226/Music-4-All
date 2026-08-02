import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DownloadJob } from '@/entities'

// ── Mocks ────────────────────────────────────────────────────────────────────
// Solo se sustituyen las piezas que salen del proceso (WebSocket, mutaciones
// HTTP, modal de recuperación). El store de descargas y useDownloadQueue son
// los reales: lo que se prueba aquí es cómo el panel los lee y los pinta.

const { socketSpy, pauseSpy, resumeSpy, cancelSpy, recoveryState, openRecoverySpy } = vi.hoisted(
  () => ({
    socketSpy: vi.fn(),
    pauseSpy: vi.fn(),
    resumeSpy: vi.fn(),
    cancelSpy: vi.fn(),
    recoveryState: { isRetrying: false },
    openRecoverySpy: vi.fn(),
  })
)

vi.mock('@/features/downloads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/downloads')>()),
  useDownloadSocket: socketSpy,
  useDownloadActions: () => ({ pause: pauseSpy, resume: resumeSpy, cancel: cancelSpy }),
}))

vi.mock('@/widgets/download-panel/model/useDownloadRecovery', () => ({
  useDownloadRecovery: () => recoveryState,
}))

vi.mock('@/features/auth', () => ({ openSessionRecovery: openRecoverySpy }))

import { useDownloadsStore } from '@/features/downloads/model/downloads.store'
import { usePlayerStore } from '@/features/player'
import { DownloadPanel } from '@/widgets/download-panel/ui/DownloadPanel'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let jobSeq = 0

function makeJob(overrides: Partial<DownloadJob> = {}): DownloadJob {
  jobSeq += 1
  return {
    id: `job-${jobSeq}`,
    backendJobId: `backend-${jobSeq}`,
    albumId: `album-${jobSeq}`,
    albumTitle: `Album ${jobSeq}`,
    artistName: 'System of a Down',
    totalTracks: 14,
    qualityOverride: null,
    completedTracks: 0,
    currentTrackFilename: null,
    progressPercent: 0,
    speedMbps: null,
    etaSeconds: null,
    status: 'queued',
    error: null,
    startedAt: null,
    completedAt: null,
    outputPath: null,
    ...overrides,
  }
}

/** Deja el store con esa cola y el panel visible (como tras encolar). */
function seedQueue(queue: DownloadJob[], extra: Partial<{ wsConnected: boolean; isPanelExpanded: boolean }> = {}) {
  useDownloadsStore.setState({
    queue,
    isPanelVisible: queue.length > 0,
    isPanelExpanded: true,
    wsConnected: true,
    pendingAuthRecovery: null,
    ...extra,
  })
}

beforeEach(() => {
  jobSeq = 0
  recoveryState.isRetrying = false
  vi.clearAllMocks()
  seedQueue([])
  usePlayerStore.setState({ queue: [], order: [], orderPos: -1, current: null, isPlaying: false })
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DownloadPanel — visibilidad y socket', () => {
  it('no pinta nada cuando el panel no está visible', () => {
    const { container } = render(<DownloadPanel />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('region', { name: 'Download panel' })).not.toBeInTheDocument()
  })

  it('monta el socket WS aunque no haya nada que pintar', () => {
    // Restricción arquitectónica (CLAUDE.md §8): el panel es el singleton del WS,
    // así que la conexión debe abrirse incluso con la cola vacía. Si el early-return
    // subiera por encima del hook, el progreso dejaría de llegar.
    render(<DownloadPanel />)
    expect(socketSpy).toHaveBeenCalledTimes(1)
  })

  it('se pinta como región etiquetada cuando hay descargas', () => {
    seedQueue([makeJob()])
    render(<DownloadPanel />)
    expect(screen.getByRole('region', { name: 'Download panel' })).toBeInTheDocument()
  })
})

describe('DownloadPanel — resumen colapsado', () => {
  it('resume activos, media de progreso y cola', () => {
    seedQueue([
      makeJob({ status: 'active', progressPercent: 40 }),
      makeJob({ status: 'active', progressPercent: 60 }),
      makeJob({ status: 'queued' }),
    ])
    render(<DownloadPanel />)
    expect(screen.getByText('2 active · 50% avg · 1 queued')).toBeInTheDocument()
  })

  it('cae a "Processing…" cuando no hay activos ni en cola', () => {
    seedQueue([makeJob({ status: 'completed', progressPercent: 100 })])
    render(<DownloadPanel />)
    expect(screen.getByText('Processing…')).toBeInTheDocument()
  })

  it('marca aria-busy solo mientras hay trabajo en curso', () => {
    seedQueue([makeJob({ status: 'active', progressPercent: 10 })])
    const { unmount } = render(<DownloadPanel />)
    expect(screen.getByRole('region', { name: 'Download panel' })).toHaveAttribute('aria-busy', 'true')
    unmount()

    seedQueue([makeJob({ status: 'queued' })])
    render(<DownloadPanel />)
    expect(screen.getByRole('region', { name: 'Download panel' })).not.toHaveAttribute('aria-busy')
  })
})

describe('DownloadPanel — expandir y colapsar', () => {
  it('colapsa al pulsar el interruptor y oculta la lista', () => {
    seedQueue([makeJob({ status: 'active' })])
    render(<DownloadPanel />)

    const toggle = screen.getByRole('button', { expanded: true })
    expect(screen.getByRole('list')).toBeInTheDocument()

    fireEvent.click(toggle)

    expect(useDownloadsStore.getState().isPanelExpanded).toBe(false)
    expect(screen.getByRole('button', { expanded: false })).toHaveAccessibleName(
      'Expand download panel'
    )
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('vuelve a expandir desde el estado colapsado', () => {
    seedQueue([makeJob({ status: 'active' })], { isPanelExpanded: false })
    render(<DownloadPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand download panel' }))

    expect(useDownloadsStore.getState().isPanelExpanded).toBe(true)
    expect(screen.getByRole('list')).toBeInTheDocument()
  })

  it('la cabecera también colapsa', () => {
    seedQueue([makeJob({ status: 'active' })])
    render(<DownloadPanel />)

    // Expandido hay dos vías de colapso: la cabecera y el interruptor del resumen.
    const collapsers = screen.getAllByRole('button', { name: 'Collapse download panel' })
    expect(collapsers).toHaveLength(2)

    fireEvent.click(collapsers[0])
    expect(useDownloadsStore.getState().isPanelExpanded).toBe(false)
  })
})

describe('DownloadPanel — estado de la conexión', () => {
  it('avisa de la reconexión cuando el WS está caído', () => {
    seedQueue([makeJob({ status: 'active' })], { wsConnected: false })
    render(<DownloadPanel />)
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument()
  })

  it('no avisa de nada con el WS conectado', () => {
    seedQueue([makeJob({ status: 'active' })])
    render(<DownloadPanel />)
    expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument()
  })

  it('anuncia el reintento de sesión con role=status', () => {
    recoveryState.isRetrying = true
    seedQueue([makeJob({ status: 'error', error: { code: 401, message: 'Sesión expirada', retriable: true } })])
    render(<DownloadPanel />)

    const retrying = screen.getByRole('status')
    expect(retrying).toHaveTextContent('Retrying…')
    expect(retrying).toHaveAttribute('aria-live', 'polite')
  })
})

describe('DownloadPanel — lista de trabajos', () => {
  it('ordena activos, pausados, en cola, con error y completados', () => {
    seedQueue([
      makeJob({ albumTitle: 'Completado', status: 'completed', progressPercent: 100 }),
      makeJob({ albumTitle: 'En cola', status: 'queued' }),
      makeJob({ albumTitle: 'Con error', status: 'error', error: { code: 500, message: 'boom', retriable: true } }),
      makeJob({ albumTitle: 'Activo', status: 'active', progressPercent: 20 }),
      makeJob({ albumTitle: 'Pausado', status: 'paused', progressPercent: 15 }),
    ])
    render(<DownloadPanel />)

    // El primer <p> de cada fila es el título (o el fichero en curso, aquí nulo).
    const titles = screen
      .getAllByRole('listitem')
      .map((row) => row.querySelector('p')?.textContent)
    expect(titles).toEqual(['Activo', 'Pausado', 'En cola', 'Con error', 'Completado'])
  })

  it('etiqueta la lista con el número de trabajos', () => {
    seedQueue([makeJob({ status: 'active' }), makeJob({ status: 'queued' })])
    render(<DownloadPanel />)
    expect(screen.getByRole('list', { name: '2 download jobs' })).toBeInTheDocument()
  })

  it('usa el singular con un solo trabajo', () => {
    seedQueue([makeJob({ status: 'active' })])
    render(<DownloadPanel />)
    expect(screen.getByRole('list', { name: '1 download job' })).toBeInTheDocument()
  })

  it('muestra el estado vacío si el panel sigue visible sin trabajos', () => {
    // Puede pasar tras limpiar los completados sin cerrar el panel.
    useDownloadsStore.setState({ queue: [], isPanelVisible: true, isPanelExpanded: true })
    render(<DownloadPanel />)
    expect(screen.getByText('No active downloads')).toBeInTheDocument()
  })
})

describe('DownloadPanel — acciones', () => {
  it('limpia los completados y anuncia cuántos', () => {
    seedQueue([
      makeJob({ albumTitle: 'Sigue', status: 'active' }),
      makeJob({ albumTitle: 'Listo', status: 'completed', progressPercent: 100 }),
    ])
    render(<DownloadPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear 1 completed download' }))

    const queue = useDownloadsStore.getState().queue
    expect(queue).toHaveLength(1)
    expect(queue[0].albumTitle).toBe('Sigue')
  })

  it('pluraliza el botón de limpiar', () => {
    seedQueue([
      makeJob({ status: 'completed', progressPercent: 100 }),
      makeJob({ status: 'completed', progressPercent: 100 }),
    ])
    render(<DownloadPanel />)
    expect(screen.getByRole('button', { name: 'Clear 2 completed downloads' })).toBeInTheDocument()
  })

  it('no ofrece limpiar si no hay completados', () => {
    seedQueue([makeJob({ status: 'active' })])
    render(<DownloadPanel />)
    expect(screen.queryByRole('button', { name: /^Clear/ })).not.toBeInTheDocument()
  })

  it('pausa con el id del backend, no con el id local', () => {
    const job = makeJob({ albumTitle: 'Toxicity', status: 'active' })
    seedQueue([job])
    render(<DownloadPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Pause download: Toxicity' }))
    expect(pauseSpy).toHaveBeenCalledWith(job.backendJobId)
  })

  it('reanuda un trabajo pausado', () => {
    const job = makeJob({ albumTitle: 'Toxicity', status: 'paused' })
    seedQueue([job])
    render(<DownloadPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Resume download: Toxicity' }))
    expect(resumeSpy).toHaveBeenCalledWith(job.backendJobId)
  })

  it('cancela un trabajo en cola', () => {
    const job = makeJob({ albumTitle: 'Toxicity', status: 'queued' })
    seedQueue([job])
    render(<DownloadPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel download: Toxicity' }))
    expect(cancelSpy).toHaveBeenCalledWith(job.backendJobId)
  })

  it('abre la recuperación de sesión desde un error de auth', () => {
    const job = makeJob({
      albumTitle: 'Toxicity',
      status: 'error',
      error: { code: 401, message: 'Sesión expirada', retriable: true },
    })
    seedQueue([job])
    render(<DownloadPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Check Tidal session for: Toxicity' }))
    expect(openRecoverySpy).toHaveBeenCalledWith(job.backendJobId)
  })
})

describe('DownloadPanel — reproducir una descarga terminada', () => {
  it('manda al reproductor la ruta del archivo servido por el backend', () => {
    const job = makeJob({
      albumTitle: 'Aerials',
      artistName: 'System of a Down',
      status: 'completed',
      totalTracks: 1,
      progressPercent: 100,
    })
    seedQueue([job])
    render(<DownloadPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Play: Aerials' }))

    expect(usePlayerStore.getState().current).toMatchObject({
      id: job.backendJobId,
      title: 'Aerials',
      artist: 'System of a Down',
      src: `/api/download/file/${job.backendJobId}`,
    })
  })

  it('no ofrece reproducir un álbum completo (se descarga como ZIP)', () => {
    seedQueue([
      makeJob({ albumTitle: 'Toxicity', status: 'completed', totalTracks: 14, progressPercent: 100 }),
    ])
    render(<DownloadPanel />)
    expect(screen.queryByRole('button', { name: /^Play:/ })).not.toBeInTheDocument()
  })
})
