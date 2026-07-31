'use client'

import Image from 'next/image'
import { Music } from 'lucide-react'

import { coverAtSize } from '@/shared/api/mappers'
import { Modal } from '@/shared/ui/Modal'

import type { LibraryAlbum } from './groupAlbums'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en', {
      month: 'short',
      day:   'numeric',
      year:  'numeric',
    })
  } catch {
    return iso
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Detalle de un álbum de la Library: carátula, meta y lista de tracks
 * descargados. El historial no guarda ni el orden ni la duración de los tracks,
 * así que solo listamos los títulos (en orden aproximado de álbum).
 */
export function AlbumTracksModal({
  album,
  onClose,
}: {
  album: LibraryAlbum | null
  onClose: () => void
}) {
  // title queda undefined cuando no hay álbum (modal cerrado); en ese caso el
  // aria-label da el nombre accesible que el Modal exige (evita el warning).
  const title = album ? album.albumTitle || album.artist : undefined

  return (
    <Modal
      isOpen={album !== null}
      onClose={onClose}
      title={title}
      aria-label={title ? undefined : 'Album details'}
      size="md"
    >
      {album && (
        <div className="flex flex-col gap-5">
          {/* Cabecera — carátula + meta */}
          <div className="flex gap-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-subtle bg-surface-studio">
              {album.coverUrl ? (
                <Image
                  src={coverAtSize(album.coverUrl, 320)}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              ) : (
                <span
                  className="flex h-full w-full items-center justify-center text-disabled"
                  aria-hidden="true"
                >
                  <Music className="h-8 w-8" />
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-col justify-center gap-1">
              <p className="truncate font-sans text-sm text-secondary">{album.artist}</p>
              <p className="font-mono text-2xs text-secondary">
                {album.trackCount} track{album.trackCount !== 1 ? 's' : ''} · {album.quality} ·{' '}
                {formatDate(album.downloadedAt)}
              </p>
            </div>
          </div>

          {/* Lista de tracks descargados. tabIndex=0 + aria-label: región con
              scroll sin elementos focusables → debe alcanzarse por teclado
              (axe scrollable-region-focusable). */}
          <ol
            tabIndex={0}
            aria-label={`Downloaded tracks — ${album.trackCount} total`}
            className="-mx-2 flex max-h-[50vh] flex-col overflow-y-auto rounded-md focus-visible:outline-none focus-visible:shadow-glow-focus"
          >
            {album.tracks.map((track, index) => (
              <li
                key={track.id}
                className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors duration-75 hover:bg-surface-console/50"
              >
                <span className="w-6 shrink-0 text-right font-mono text-xs text-secondary tabular-nums">
                  {index + 1}
                </span>
                <span className="flex-1 truncate font-sans text-sm text-primary">
                  {track.title}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Modal>
  )
}
