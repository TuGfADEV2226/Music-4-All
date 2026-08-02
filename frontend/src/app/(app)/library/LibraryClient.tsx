'use client'

import { useMemo, useState } from 'react'
import { CircleAlert, Disc3 } from 'lucide-react'

import { Button } from '@/shared/ui/Button'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useHistoryQuery } from '@/features/history'

import { AlbumTile } from './AlbumTile'
import { AlbumTracksModal } from './AlbumTracksModal'
import { groupIntoAlbums } from './groupAlbums'
import type { LibraryAlbum } from './groupAlbums'

// ─── Layout ───────────────────────────────────────────────────────────────────

const GRID = 'grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

// ─── Component ────────────────────────────────────────────────────────────────

export function LibraryClient() {
  const { data, isLoading, isError, refetch, isFetching } = useHistoryQuery()

  const albums = useMemo(() => groupIntoAlbums(data ?? []), [data])
  const trackCount = data?.length ?? 0

  // Álbum abierto en el modal de detalle (lista de tracks)
  const [selected, setSelected] = useState<LibraryAlbum | null>(null)

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-1">
        <h1 className="font-sans text-2xl font-bold text-primary">Library</h1>
        <p className="font-sans text-sm text-secondary">
          Your crate — every record you&apos;ve pulled down
        </p>
        {albums.length > 0 && (
          <p className="mt-1 font-mono text-2xs uppercase tracking-wider text-secondary">
            {albums.length} record{albums.length !== 1 ? 's' : ''} · {trackCount} track
            {trackCount !== 1 ? 's' : ''}
          </p>
        )}
      </header>

      {/* Accessible live region */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {isLoading && 'Loading your library…'}
        {!isLoading &&
          !isError &&
          data &&
          `${albums.length} record${albums.length !== 1 ? 's' : ''} in your library`}
        {isError && 'Error loading your library'}
      </div>

      {/* ── Content ──────────────────────────────────────────────────── */}
      <main aria-label="Your downloaded records" aria-busy={isLoading || isFetching || undefined}>
        {/* Loading — skeleton grid */}
        {isLoading && (
          <div className={GRID} aria-label="Loading library">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2" aria-hidden="true">
                <Skeleton className="aspect-square w-full rounded-md" />
                <Skeleton variant="text" className="h-4 w-3/4" />
                <Skeleton variant="text" className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <div role="alert" className="flex flex-col items-center gap-4 py-16 text-center">
            <CircleAlert className="h-12 w-12 text-semantic-error-on-dark" aria-hidden="true" />
            <p className="font-sans text-sm text-semantic-error-on-dark">
              Couldn&apos;t load your library.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void refetch()}
              aria-label="Retry loading library"
            >
              Try again
            </Button>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !isError && albums.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <Disc3 className="h-12 w-12 text-secondary opacity-40" aria-hidden="true" />
            <p className="font-sans text-base font-medium text-primary">Your crate is empty</p>
            <p className="max-w-sm font-sans text-sm text-secondary">
              Downloaded records land here. Grab your first album and start digging.
            </p>
          </div>
        )}

        {/* Data — collection grid */}
        {!isLoading && !isError && albums.length > 0 && (
          <div className={GRID}>
            {albums.map((album, index) => (
              // La primera fila (hasta 5 en xl) es la que suele contener el LCP:
              // priority evita el warning de next/image y precarga la carátula.
              <AlbumTile
                key={album.key}
                album={album}
                priority={index < 5}
                onSelect={() => setSelected(album)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Detalle del álbum — lista de tracks descargados */}
      <AlbumTracksModal album={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
