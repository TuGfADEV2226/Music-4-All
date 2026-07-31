import { AlbumClient } from './AlbumClient'

/**
 * Album page — Server Component thin shell.
 *
 * Album detail as a dedicated route (A3), replacing the dashboard modal:
 * shareable URL, browser-back, consistent with the artist page.
 */
export default async function AlbumPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  return <AlbumClient albumId={id} />
}
