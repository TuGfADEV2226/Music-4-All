import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PushNotificationsToggle } from '@/features/push/ui/PushNotificationsToggle'
import { usePushNotifications } from '@/features/push/model/usePushNotifications'

vi.mock('@/features/push/model/usePushNotifications', () => ({
  usePushNotifications: vi.fn(),
}))

const mocked = vi.mocked(usePushNotifications)
const enable = vi.fn()
const disable = vi.fn()

function setHook(overrides: Partial<ReturnType<typeof usePushNotifications>>) {
  mocked.mockReturnValue({
    supported: true,
    backendEnabled: true,
    swReady: true,
    subscribed: false,
    permission: 'default',
    busy: false,
    error: null,
    enable,
    disable,
    ...overrides,
  } as ReturnType<typeof usePushNotifications>)
}

beforeEach(() => {
  enable.mockClear()
  disable.mockClear()
})

describe('PushNotificationsToggle', () => {
  it('renders nothing when the browser does not support push', () => {
    setHook({ supported: false })
    const { container } = render(<PushNotificationsToggle />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the server has push disabled', () => {
    setHook({ backendEnabled: false })
    const { container } = render(<PushNotificationsToggle />)
    expect(container).toBeEmptyDOMElement()
  })

  it('enables notifications when the switch is turned on', () => {
    setHook({ subscribed: false })
    render(<PushNotificationsToggle />)
    fireEvent.click(screen.getByRole('switch', { name: /download notifications/i }))
    expect(enable).toHaveBeenCalledTimes(1)
  })

  it('disables notifications when already subscribed', () => {
    setHook({ subscribed: true })
    render(<PushNotificationsToggle />)
    fireEvent.click(screen.getByRole('switch', { name: /download notifications/i }))
    expect(disable).toHaveBeenCalledTimes(1)
  })

  describe('sin service worker listo', () => {
    /** El mensaje depende de la plataforma: ver `unavailableHint`. */
    function setUserAgent(ua: string) {
      Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
    }

    it('deshabilita el interruptor', () => {
      setHook({ swReady: false })
      render(<PushNotificationsToggle />)
      expect(screen.getByRole('switch', { name: /download notifications/i })).toBeDisabled()
    })

    it('en iOS pide añadir a la pantalla de inicio, que ahí sí es el requisito', () => {
      setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15')
      setHook({ swReady: false })
      render(<PushNotificationsToggle />)
      expect(screen.getByText(/add music 4 all to your home screen/i)).toBeVisible()
    })

    it('en Android NO pide instalar nada — ahí el push funciona en la pestaña', () => {
      // El mensaje anterior mandaba instalar la app a todo el mundo, y en
      // Android eso no arregla nada: lo que falta es el service worker.
      setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120')
      setHook({ swReady: false })
      render(<PushNotificationsToggle />)
      expect(screen.queryByText(/home screen/i)).not.toBeInTheDocument()
      expect(screen.getByText(/not available in this session/i)).toBeVisible()
    })
  })
})
