import { ArtistClient } from './ArtistClient'

/**
 * Artist page — Server Component thin shell.
 *
 * First dynamic route in the app. Delegates state/logic to ArtistClient
 * (client boundary), inheriting the authenticated (app) shell.
 */
export default async function ArtistPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  return <ArtistClient artistId={id} />
}
