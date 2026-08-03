import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildWsUrl, WS_ENDPOINT } from '@/shared/config/ws.config'

/**
 * El WebSocket de progreso se resuelve de dos maneras según dónde se sirva la
 * página. El caso que importa es el remoto: el override de desarrollo nombra un
 * host concreto (`ws://localhost:8000`), así que aplicado a un cliente que no
 * está en esa máquina apunta a *su* localhost — la descarga se queda en "en
 * cola" para siempre y no aparece ningún error. Es justo lo que se rompe al
 * exponer el Docker local por un túnel.
 */

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_WS_URL

/** jsdom no deja reasignar `window.location`; se sustituye el objeto entero. */
function setLocation(href: string) {
  const url = new URL(href)
  vi.stubGlobal('window', {
    ...globalThis.window,
    location: {
      href: url.href,
      protocol: url.protocol,
      host: url.host,
      hostname: url.hostname,
      port: url.port,
    },
  })
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_WS_URL
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (ORIGINAL_ENV === undefined) delete process.env.NEXT_PUBLIC_WS_URL
  else process.env.NEXT_PUBLIC_WS_URL = ORIGINAL_ENV
})

describe('buildWsUrl — sin override (producción / mismo origen)', () => {
  it('usa ws sobre HTTP', () => {
    setLocation('http://localhost:3000/dashboard')
    expect(buildWsUrl()).toBe(`ws://localhost:3000${WS_ENDPOINT}`)
  })

  it('usa wss sobre HTTPS', () => {
    setLocation('https://music4all.example.org/dashboard')
    expect(buildWsUrl()).toBe(`wss://music4all.example.org${WS_ENDPOINT}`)
  })

  it('conserva el puerto del origen', () => {
    setLocation('http://192.168.1.50:8080/dashboard')
    expect(buildWsUrl()).toBe(`ws://192.168.1.50:8080${WS_ENDPOINT}`)
  })
})

describe('buildWsUrl — con override de desarrollo', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_WS_URL = 'ws://localhost:8000'
  })

  it('se aplica cuando la página se sirve desde localhost', () => {
    setLocation('http://localhost:3000/dashboard')
    expect(buildWsUrl()).toBe(`ws://localhost:8000${WS_ENDPOINT}`)
  })

  it('se aplica también desde 127.0.0.1', () => {
    setLocation('http://127.0.0.1:3000/dashboard')
    expect(buildWsUrl()).toBe(`ws://localhost:8000${WS_ENDPOINT}`)
  })

  it('SE IGNORA para un cliente remoto — apuntaría a su propio localhost', () => {
    // Escenario real: el Docker local expuesto por un túnel de Cloudflare.
    setLocation('https://random-words-1234.trycloudflare.com/dashboard')
    expect(buildWsUrl()).toBe(`wss://random-words-1234.trycloudflare.com${WS_ENDPOINT}`)
  })

  it('SE IGNORA en un dominio de despliegue, aunque la variable se cuele', () => {
    setLocation('https://music4all.duckdns.org/dashboard')
    expect(buildWsUrl()).toBe(`wss://music4all.duckdns.org${WS_ENDPOINT}`)
  })

  it('se ignora también en una IP de red local', () => {
    // Probar desde el móvil contra el PC: el override tampoco valdría ahí.
    setLocation('http://192.168.1.50:3000/dashboard')
    expect(buildWsUrl()).toBe(`ws://192.168.1.50:3000${WS_ENDPOINT}`)
  })
})
