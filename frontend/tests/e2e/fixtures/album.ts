import type { AlbumDTO, SearchResponseDTO } from '@/shared/types/api.types'

/**
 * "Toxicity" by System of a Down — fixture album used across search and
 * download E2E specs.
 *
 * `cover: ''` deliberately — AlbumCard only renders <Image> when
 * `album.coverUrl` is truthy, so an empty cover avoids any real network
 * request to resources.tidal.com during tests.
 */
export const TOXICITY_ALBUM_DTO: AlbumDTO = {
  id: '251380837',
  title: 'Toxicity',
  artist: { id: '11069', name: 'System of a Down' },
  cover: '',
  release_date: '2001-09-04',
  number_of_tracks: 14,
  duration: 2580,
  audio_quality: 'HIGH',
  audio_modes: [],
  upc: '743magic0123456',
  label: { id: '1', name: 'American Recordings' },
  genre: 'Rock',
}

/** Track del álbum fixture (cover '' → sin petición a resources.tidal.com). */
export const CHOP_SUEY_TRACK = {
  id: '900001',
  title: 'Chop Suey!',
  track_number: 1,
  duration: 210,
  audio_quality: 'HIGH',
  audio_modes: [],
  isrc: 'USRC10000001',
  artist: TOXICITY_ALBUM_DTO.artist,
  album: { id: TOXICITY_ALBUM_DTO.id, title: TOXICITY_ALBUM_DTO.title, cover: '' },
}

/** Respuesta de `/artists/{id}` con una sección de cada tipo. */
export const ARTIST_DETAIL = {
  artist: { id: TOXICITY_ALBUM_DTO.artist.id, name: TOXICITY_ALBUM_DTO.artist.name, picture: null },
  top_tracks: [CHOP_SUEY_TRACK],
  albums: [TOXICITY_ALBUM_DTO],
  ep_singles: [{ ...TOXICITY_ALBUM_DTO, id: '999', title: 'A Single', type: 'SINGLE' }],
  other: [{ ...TOXICITY_ALBUM_DTO, id: '998', title: 'A Compilation', type: 'COMPILATION' }],
  similar: [{ id: '424242', name: 'Similar Artist', picture: null }],
}

/** Historial mínimo — alimenta también a /library, que agrupa estos registros. */
export const HISTORY_RECORDS = [
  {
    id: 'history-1',
    title: 'Chop Suey!',
    artist: TOXICITY_ALBUM_DTO.artist.name,
    quality: '44.1kHz / 24bit (Hi-Res)',
    cover_url: null,
    job_id: 'job-abc123',
    downloaded_at: new Date('2026-07-30T10:00:00Z').toISOString(),
  },
  {
    id: 'history-2',
    title: 'Aerials',
    artist: TOXICITY_ALBUM_DTO.artist.name,
    quality: '44.1kHz / 16bit (FLAC)',
    cover_url: null,
    job_id: 'job-abc124',
    downloaded_at: new Date('2026-07-30T10:05:00Z').toISOString(),
  },
]

/** Sesiones activas para el panel de Ajustes. */
export const ACTIVE_SESSIONS = {
  sessions: [
    {
      sid: 'e2e-session',
      created_at: Math.floor(Date.parse('2026-07-30T09:00:00Z') / 1000),
      last_seen: Math.floor(Date.parse('2026-07-30T10:00:00Z') / 1000),
      ip: '127.0.0.1',
      user_agent: 'Playwright',
      current: true,
    },
  ],
}

export function buildSearchResponse(albums: AlbumDTO[] = [TOXICITY_ALBUM_DTO]): SearchResponseDTO {
  return {
    artists: { items: [], total_number_of_items: 0, limit: 50, offset: 0 },
    albums: {
      items: albums,
      total_number_of_items: albums.length,
      limit: 50,
      offset: 0,
    },
    tracks: { items: [], total_number_of_items: 0, limit: 50, offset: 0 },
    playlists: { items: [], total_number_of_items: 0, limit: 50, offset: 0 },
  }
}
