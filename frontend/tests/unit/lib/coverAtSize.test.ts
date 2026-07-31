import { describe, it, expect } from 'vitest'

import { coverAtSize, coverIdToUrl } from '@/shared/api/mappers'

describe('coverAtSize', () => {
  const cover = coverIdToUrl('1e02-11ef-a1b2-c3d4e5f60718')

  it('reescribe la talla de una carátula de Tidal', () => {
    expect(cover).toContain('/640x640.jpg')
    expect(coverAtSize(cover, 160)).toContain('/160x160.jpg')
    expect(coverAtSize(cover, 320)).toContain('/320x320.jpg')
  })

  it('conserva la ruta y solo cambia la talla', () => {
    const small = coverAtSize(cover, 160)
    expect(small).toBe(cover.replace('/640x640.jpg', '/160x160.jpg'))
  })

  it('sube a la talla real más cercana que sirve el CDN (otras dan 403)', () => {
    // 200 no existe en Tidal: se pide 320, no 200.
    expect(coverAtSize(cover, 200)).toContain('/320x320.jpg')
    // Por encima de la mayor disponible se queda en 1280.
    expect(coverAtSize(cover, 4000)).toContain('/1280x1280.jpg')
  })

  it('devuelve intacta cualquier URL que no tenga el patrón de talla', () => {
    expect(coverAtSize('https://example.com/cover.png', 160)).toBe('https://example.com/cover.png')
    expect(coverAtSize('', 160)).toBe('')
  })
})
