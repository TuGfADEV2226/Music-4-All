import type { Page } from '@playwright/test'

/**
 * Oculta el indicador flotante de Next.js dev tools (`<nextjs-portal>`).
 *
 * La suite corre contra `next dev`, que desde Next 15 pinta un botón fijo en la
 * esquina inferior. En viewports estrechos se solapa con la PlayerBar y se queda
 * con los clics ("subtree intercepts pointer events"). No forma parte de la app,
 * así que tampoco tiene sentido que lo audite axe.
 *
 * Solo afecta a los tests: no toca la configuración de desarrollo.
 */
export async function hideNextDevOverlay(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const inject = () => {
      const style = document.createElement('style')
      style.textContent = 'nextjs-portal { display: none !important; }'
      document.head.appendChild(style)
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inject)
    } else {
      inject()
    }
  })
}
