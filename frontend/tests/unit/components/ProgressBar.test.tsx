import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProgressBar } from '@/shared/ui/ProgressBar'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * `useReducedMotion` lee `window.matchMedia('(prefers-reduced-motion: reduce)')`.
 * setup.ts lo deja en `matches: false`; aquí se puede forzar por test.
 */
function setReducedMotion(reduced: boolean) {
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({
        matches: reduced,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList
  )
}

/** El relleno es el único hijo del track (role="progressbar"). */
function fillOf(bar: HTMLElement): HTMLElement {
  const fill = bar.firstElementChild
  if (!(fill instanceof HTMLElement)) throw new Error('ProgressBar sin elemento de relleno')
  return fill
}

afterEach(() => setReducedMotion(false))

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProgressBar — accesibilidad', () => {
  it('expone role progressbar con el rango 0-100 y el valor actual', () => {
    render(<ProgressBar value={42} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '42')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(bar).toHaveAttribute('aria-valuetext', '42%')
  })

  it('usa el label recibido como nombre accesible', () => {
    render(<ProgressBar value={10} label="Download progress for Toxicity: 10%" />)
    expect(
      screen.getByRole('progressbar', { name: 'Download progress for Toxicity: 10%' })
    ).toBeInTheDocument()
  })

  it('sin valor explícito arranca en 0', () => {
    render(<ProgressBar />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })
})

describe('ProgressBar — valor', () => {
  it('recorta por encima de 100', () => {
    render(<ProgressBar value={150} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '100')
    expect(fillOf(bar)).toHaveStyle({ width: '100%' })
  })

  it('recorta por debajo de 0', () => {
    render(<ProgressBar value={-20} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '0')
    expect(fillOf(bar)).toHaveStyle({ width: '0%' })
  })

  it('el ancho del relleno sigue al valor', () => {
    render(<ProgressBar value={73} />)
    expect(fillOf(screen.getByRole('progressbar'))).toHaveStyle({ width: '73%' })
  })
})

describe('ProgressBar — variante indeterminate', () => {
  it('no anuncia un valor concreto y marca que está cargando', () => {
    render(<ProgressBar variant="indeterminate" value={40} />)
    const bar = screen.getByRole('progressbar')
    // Sin progreso conocido no debe mentir con un porcentaje.
    expect(bar).not.toHaveAttribute('aria-valuenow')
    expect(bar).toHaveAttribute('aria-valuetext', 'Loading…')
  })

  it('el relleno ocupa el ancho completo e ignora el valor recibido', () => {
    render(<ProgressBar variant="indeterminate" value={40} />)
    expect(fillOf(screen.getByRole('progressbar'))).toHaveStyle({ width: '100%' })
  })

  it('anima el shimmer solo si no hay prefers-reduced-motion', () => {
    const { unmount } = render(<ProgressBar variant="indeterminate" />)
    expect(fillOf(screen.getByRole('progressbar'))).toHaveClass('animate-shimmer')
    unmount()

    setReducedMotion(true)
    render(<ProgressBar variant="indeterminate" />)
    expect(fillOf(screen.getByRole('progressbar'))).not.toHaveClass('animate-shimmer')
  })
})

describe('ProgressBar — variantes y brillo', () => {
  it('cada variante pinta su color de relleno', () => {
    const cases = [
      ['download', 'bg-teal-400'],
      ['success', 'bg-semantic-success'],
      ['error', 'bg-semantic-error'],
      ['queue', 'bg-semantic-queue'],
    ] as const

    for (const [variant, expected] of cases) {
      const { unmount } = render(<ProgressBar variant={variant} value={50} />)
      expect(fillOf(screen.getByRole('progressbar'))).toHaveClass(expected)
      unmount()
    }
  })

  it('en cola el brillo vive en el track, porque el relleno mide 0%', () => {
    render(<ProgressBar variant="queue" value={0} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveClass('shadow-glow-queue')
    expect(fillOf(bar)).toHaveStyle({ width: '0%' })
  })

  it('sin animated no hay glow en el relleno', () => {
    render(<ProgressBar variant="download" value={50} />)
    expect(fillOf(screen.getByRole('progressbar'))).not.toHaveClass('shadow-glow-active')
  })

  it('con animated añade el glow de la variante', () => {
    render(<ProgressBar variant="success" value={100} animated />)
    expect(fillOf(screen.getByRole('progressbar'))).toHaveClass('shadow-glow-success')
  })
})

describe('ProgressBar — respiración neón (solo download)', () => {
  /** El overlay de "respiración" es el único hijo del relleno. */
  function breatheOverlay(): Element | null {
    return fillOf(screen.getByRole('progressbar')).querySelector('.animate-pulse-neon')
  }

  it('se monta en download + animated', () => {
    render(<ProgressBar variant="download" value={50} animated />)
    const overlay = breatheOverlay()
    expect(overlay).not.toBeNull()
    // Decorativo: no debe llegar al árbol de accesibilidad.
    expect(overlay).toHaveAttribute('aria-hidden', 'true')
  })

  it('no se monta en otras variantes aunque estén animadas', () => {
    render(<ProgressBar variant="success" value={100} animated />)
    expect(breatheOverlay()).toBeNull()
  })

  it('no se monta bajo prefers-reduced-motion', () => {
    setReducedMotion(true)
    render(<ProgressBar variant="download" value={50} animated />)
    expect(breatheOverlay()).toBeNull()
    // El glow estático sí se mantiene como fallback.
    expect(fillOf(screen.getByRole('progressbar'))).toHaveClass('shadow-glow-active')
  })
})

describe('ProgressBar — tamaño y clases externas', () => {
  it('aplica la altura del tamaño pedido', () => {
    const { unmount } = render(<ProgressBar size="sm" value={10} />)
    expect(screen.getByRole('progressbar')).toHaveClass('h-1')
    unmount()

    render(<ProgressBar size="lg" value={10} />)
    expect(screen.getByRole('progressbar')).toHaveClass('h-3')
  })

  it('respeta className del llamante', () => {
    render(<ProgressBar value={10} className="mt-4" />)
    expect(screen.getByRole('progressbar')).toHaveClass('mt-4')
  })
})
