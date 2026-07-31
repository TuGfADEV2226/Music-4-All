import { expect, type Page } from '@playwright/test'

const SEARCH_LABEL = 'Search albums, tracks, or paste a Tidal URL'

/**
 * Escribe una consulta en el buscador global y se asegura de que queda fijada.
 *
 * `fill()` puede llegar antes de que React hidrate el input controlado: el valor
 * entra en el DOM, no hay todavía ningún manejador escuchando, y la primera
 * renderización del cliente lo devuelve a vacío — así que la búsqueda nunca se
 * lanza y el test falla esperando resultados que no van a llegar. Se ve sobre
 * todo en WebKit, que hidrata más lento.
 *
 * En vez de dormir un rato a ojo, se reintenta el `fill` hasta que el valor
 * sobrevive a un ciclo de renderizado, que es exactamente la condición que
 * distingue "escrito antes de hidratar" de "escrito de verdad".
 */
export async function fillGlobalSearch(page: Page, query: string): Promise<void> {
  const input = page.getByRole('textbox', { name: SEARCH_LABEL })
  await expect(input).toBeVisible()

  await expect(async () => {
    await input.fill(query)
    await page.waitForTimeout(150)
    await expect(input).toHaveValue(query, { timeout: 1_000 })
  }).toPass({ timeout: 20_000 })
}
