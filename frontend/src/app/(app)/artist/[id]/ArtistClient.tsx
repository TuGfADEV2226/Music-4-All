'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowLeft, Download, Play, Shuffle, User } from 'lucide-react'

import { cn } from '@/shared/lib/cn'
import { formatDuration } from '@/shared/lib/format'
import { Button } from '@/shared/ui'
import { useAuthStore } from '@/features/auth'
import { useSettingsStore } from '@/features/settings'
import { useArtistDetailQuery } from '@/features/artist-detail'
import { albumApi } from '@/features/album-detail'
import { ArtistCard } from '@/features/search'
import { usePlayerStore, trackToPlayerTrack } from '@/features/player'
import {
  useDownloadsStore,
  useStartDownloadMutation,
  useDownloadErrorToast,
  useTrackDownload,
} from '@/features/downloads'

import { ReleaseSection } from './ReleaseSection'
import { SectionHeading } from './SectionHeading'

// ─── Component ────────────────────────────────────────────────────────────────

export function ArtistClient({ artistId }: { artistId: string }) {
  const router = useRouter()

  // ── Auth guard (mirror DashboardClient) ──────────────────────────────────
  const status = useAuthStore((s) => s.status)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  useEffect(() => {
    if (!hasHydrated) return
    if (status === 'expired' || status === 'unauthenticated') router.replace('/login')
  }, [status, hasHydrated, router])

  // Gate the query on auth: en carga en frío por URL, disparar antes de que el
  // store confirme la sesión produce un 401 que el interceptor convierte en
  // setExpired(). `status` ya es 'unauthenticated' hasta rehidratar (default
  // seguro) y pasa a 'authenticated' cuando la sesión está lista.
  const query = useArtistDetailQuery(artistId, status === 'authenticated')
  const data = query.data
  const downloadMutation = useStartDownloadMutation()
  const onDownloadError = useDownloadErrorToast()
  // Calidad de descarga desde la preferencia global (fuente única)
  const quality = useSettingsStore((s) => s.audioQuality)
  const downloadTrack = useTrackDownload(quality)
  const [showAllTracks, setShowAllTracks] = useState(false)

  // ── Playback ──────────────────────────────────────────────────────────────
  function playTopTracks(startIndex: number) {
    if (!data || data.topTracks.length === 0) return
    usePlayerStore.getState().playQueue(data.topTracks.map(trackToPlayerTrack), startIndex)
  }

  function shuffleTopTracks() {
    if (!data || data.topTracks.length === 0) return
    const store = usePlayerStore.getState()
    if (!store.shuffle) store.toggleShuffle()
    const start = Math.floor(Math.random() * data.topTracks.length)
    store.playQueue(data.topTracks.map(trackToPlayerTrack), start)
  }

  async function handlePlayAlbum(albumId: string) {
    const { tracks } = await albumApi.getDetail(albumId)
    if (tracks.length > 0) {
      usePlayerStore.getState().playQueue(tracks.map(trackToPlayerTrack), 0)
    }
  }

  function handleDownloadAlbum(albumId: string) {
    const album = [
      ...(data?.albums ?? []),
      ...(data?.epSingles ?? []),
      ...(data?.other ?? []),
    ].find((a) => a.id === albumId)
    downloadMutation.mutate(
      { albumId, quality },
      {
        onError: onDownloadError,
        onSuccess: (result) => {
          useDownloadsStore.getState().enqueue({
            backendJobId: result.jobId,
            albumId,
            albumTitle: album?.title ?? 'Unknown Album',
            artistName: album?.artist.name ?? 'Unknown Artist',
            totalTracks: result.estimatedTracks,
            qualityOverride: quality,
          })
        },
      },
    )
  }

  // ── Render guard ──────────────────────────────────────────────────────────
  if (status !== 'authenticated') return null

  return (
    <div className="flex min-h-full flex-col">
      {/* ── Loading ───────────────────────────────────────────────────── */}
      {query.isFetching && !data && (
        <div className="flex items-center justify-center p-6 py-24">
          <p className="animate-pulse font-sans text-sm text-secondary">Loading artist…</p>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {query.isError && !data && (
        <div className="flex flex-col items-center justify-center gap-3 p-6 py-24">
          <p className="font-sans text-sm text-semantic-error-on-dark">
            Couldn&apos;t load the artist. Please try again.
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {data && (
        <>
          {/* ── Hero — imagen grande del artista + degradado (C1) ────────── */}
          <section aria-label={`${data.artist.name} header`} className="relative">
            <div aria-hidden="true" className="relative h-56 w-full overflow-hidden sm:h-72 lg:h-80">
              {data.artist.picture ? (
                <Image
                  src={data.artist.picture}
                  alt=""
                  fill
                  priority
                  sizes="100vw"
                  className="object-cover object-[center_25%]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-surface-rack">
                  <User className="h-16 w-16 text-disabled" />
                </div>
              )}
              {/* Degradado hacia el fondo para legibilidad del nombre */}
              <div className="absolute inset-0 bg-gradient-to-t from-surface-void via-surface-void/55 to-surface-void/10" />
            </div>

            {/* Volver a la vista anterior (búsqueda) — A1 */}
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go back"
              className={cn(
                'absolute left-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full',
                'bg-surface-void/70 text-primary',
                'transition-transform duration-150 ease-out active:scale-90',
                'hover:bg-surface-void focus-visible:outline-none focus-visible:shadow-glow-focus',
              )}
            >
              <ArrowLeft aria-hidden="true" className="h-5 w-5" />
            </button>

            {/* Nombre + acciones sobre el degradado */}
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 px-6 pb-5">
              <span className="font-mono text-2xs font-semibold uppercase tracking-[0.3em] text-secondary">
                Artist
              </span>
              <h1 className="font-sans text-3xl font-bold leading-tight text-primary drop-shadow sm:text-5xl">
                {data.artist.name}
              </h1>
              {data.topTracks.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => playTopTracks(0)}
                    aria-label={`Play ${data.artist.name}'s top tracks`}
                  >
                    <Play aria-hidden="true" className="h-4 w-4" />
                    Play
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={shuffleTopTracks}
                    aria-label={`Shuffle ${data.artist.name}'s top tracks`}
                  >
                    <Shuffle aria-hidden="true" className="h-4 w-4" />
                    Shuffle
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* ── Content ────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-12 px-6 pb-8 pt-6">
          {/* ── Top tracks ─────────────────────────────────────────────── */}
          {data.topTracks.length > 0 && (
            <section aria-label="Top tracks" className="flex flex-col gap-3">
              <SectionHeading title="Popular" subtitle="On heavy rotation" />
              <ol className="flex flex-col">
                {(showAllTracks ? data.topTracks : data.topTracks.slice(0, 5)).map((track, index) => (
                  <li key={track.id}>
                    <div
                      className={cn(
                        'flex items-center gap-3 rounded-md px-2 py-2',
                        'hover:bg-surface-console/50 transition-colors duration-75',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => playTopTracks(index)}
                        aria-label={`Play: ${track.title}`}
                        className={cn(
                          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                          'text-secondary transition-transform duration-150 ease-out active:scale-90',
                          'hover:text-teal-400 focus-visible:outline-none focus-visible:shadow-glow-focus',
                        )}
                      >
                        <Play aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <span className="w-5 shrink-0 text-right font-mono text-xs text-secondary">
                        {index + 1}
                      </span>
                      <span className="flex-1 truncate font-sans text-sm text-primary">
                        {track.title}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-secondary tabular-nums">
                        {formatDuration(track.durationSeconds)}
                      </span>
                      <button
                        type="button"
                        onClick={() => downloadTrack(track)}
                        aria-label={`Download: ${track.title}`}
                        className={cn(
                          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                          'text-secondary transition-transform duration-150 ease-out active:scale-90',
                          'hover:text-teal-400 focus-visible:outline-none focus-visible:shadow-glow-focus',
                        )}
                      >
                        <Download aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
              {data.topTracks.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllTracks((v) => !v)}
                  className={cn(
                    'w-fit rounded-sm px-2 py-1 font-mono text-xs font-semibold uppercase tracking-wider',
                    'text-secondary transition-colors hover:text-primary',
                    'focus-visible:outline-none focus-visible:shadow-glow-focus',
                  )}
                >
                  {showAllTracks ? 'Show less' : 'See all'}
                </button>
              )}
            </section>
          )}

          {/* ── Releases — carruseles con flechas + View all ───────────── */}
          <ReleaseSection
            title="Albums"
            subtitle="Full-length LPs"
            albums={data.albums}
            onPlay={handlePlayAlbum}
            onDownload={handleDownloadAlbum}
          />
          <ReleaseSection
            title="Singles & EPs"
            subtitle="45s and extended plays"
            albums={data.epSingles}
            onPlay={handlePlayAlbum}
            onDownload={handleDownloadAlbum}
          />
          <ReleaseSection
            title="Compilations"
            subtitle="Collected cuts and features"
            albums={data.other}
            onPlay={handlePlayAlbum}
            onDownload={handleDownloadAlbum}
          />

          {/* ── Fans also like ─────────────────────────────────────────── */}
          {data.similar.length > 0 && (
            <section aria-label="Fans also like" className="flex flex-col gap-4">
              <SectionHeading title="Fans also like" subtitle="More from the same crate" />
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                {data.similar.map((similarArtist) => (
                  <ArtistCard key={similarArtist.id} artist={similarArtist} />
                ))}
              </div>
            </section>
          )}
          </div>
        </>
      )}
    </div>
  )
}
