import { describe, expect, it } from 'vitest'

import {
  coverIdToUrl,
  mapAlbumDTO,
  mapTrackDTO,
  mapWsMessageToProgress,
} from '@/shared/api/mappers'
import type { AlbumDTO, TrackDTO, WsProgressPayload } from '@/shared/types/api.types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ALBUM_DTO: AlbumDTO = {
  id: '251380837',
  title: 'Toxicity',
  artist: { id: '14670', name: 'System of a Down' },
  cover: '9a9b7e6d-1234-5678-9abc-def012345678',
  release_date: '2001-09-04',
  number_of_tracks: 14,
  duration: 2444,
  audio_quality: 'MASTER',
  audio_modes: ['STEREO'],
  upc: '886445766172',
  label: { id: '7', name: 'American Recordings' },
  genre: 'Metal',
  type: 'ALBUM',
}

/** Lo mínimo que garantiza el contrato del backend (el resto es opcional). */
const MINIMAL_ALBUM_DTO: AlbumDTO = {
  id: '1',
  title: 'Sin metadatos',
  artist: { id: '2', name: 'Nadie' },
  cover: '',
  release_date: '1999-12-31',
  number_of_tracks: 1,
  duration: 100,
  audio_quality: 'HIGH',
}

const TRACK_DTO: TrackDTO = {
  id: '251380838',
  title: 'Chop Suey!',
  track_number: 4,
  duration: 210,
  audio_quality: 'MASTER',
  audio_modes: ['STEREO'],
  isrc: 'USSM10105601',
  artist: { id: '14670', name: 'System of a Down' },
}

// ─── coverIdToUrl ─────────────────────────────────────────────────────────────

describe('coverIdToUrl', () => {
  it('convierte el id de carátula en la ruta del CDN de Tidal', () => {
    expect(coverIdToUrl('9a9b7e6d-1234-5678-9abc-def012345678')).toBe(
      'https://resources.tidal.com/images/9a9b7e6d/1234/5678/9abc/def012345678/640x640.jpg'
    )
  })

  it('pide 640x640 por defecto y acepta otra talla', () => {
    expect(coverIdToUrl('a-b')).toContain('/640x640.jpg')
    expect(coverIdToUrl('a-b', 80)).toContain('/80x80.jpg')
  })
})

// ─── mapAlbumDTO ──────────────────────────────────────────────────────────────

describe('mapAlbumDTO', () => {
  it('traduce snake_case a dominio', () => {
    const album = mapAlbumDTO(ALBUM_DTO)
    expect(album).toMatchObject({
      id: '251380837',
      title: 'Toxicity',
      artist: { id: '14670', name: 'System of a Down' },
      releaseDate: '2001-09-04',
      numberOfTracks: 14,
      durationSeconds: 2444,
      audioQuality: 'MASTER',
      audioModes: ['STEREO'],
      upc: '886445766172',
      label: { id: '7', name: 'American Recordings' },
      genre: 'Metal',
      type: 'ALBUM',
    })
  })

  it('construye la URL de la carátula desde el id', () => {
    expect(mapAlbumDTO(ALBUM_DTO).coverUrl).toBe(coverIdToUrl(ALBUM_DTO.cover))
  })

  it('deja la carátula vacía cuando el álbum no trae ninguna', () => {
    // Sin este caso saldría una URL con el id vacío y un 404 del CDN.
    expect(mapAlbumDTO(MINIMAL_ALBUM_DTO).coverUrl).toBe('')
  })

  it('rellena los campos opcionales que el backend puede omitir', () => {
    const album = mapAlbumDTO(MINIMAL_ALBUM_DTO)
    expect(album.audioModes).toEqual([])
    expect(album.upc).toBe('')
    expect(album.label).toEqual({ id: '', name: '' })
    expect(album.genre).toBeNull()
    expect(album.type).toBeNull()
  })

  describe('releaseYear', () => {
    it('saca el año de la fecha', () => {
      expect(mapAlbumDTO(ALBUM_DTO).releaseYear).toBe(2001)
    })

    it('no retrocede un año con lanzamientos del 1 de enero', () => {
      // `new Date('2020-01-01')` es medianoche UTC: en un huso negativo
      // `getFullYear()` local devolvía 2019. El huso se fuerza porque CI corre
      // en UTC y allí el fallo no se reproduciría.
      const originalTz = process.env.TZ
      process.env.TZ = 'America/Mexico_City'
      try {
        expect(new Date('2020-01-01').getFullYear()).toBe(2019) // el huso está activo
        expect(mapAlbumDTO({ ...ALBUM_DTO, release_date: '2020-01-01' }).releaseYear).toBe(2020)
      } finally {
        process.env.TZ = originalTz
      }
    })

    it('devuelve null si Tidal no publica fecha, en vez de NaN', () => {
      expect(mapAlbumDTO({ ...ALBUM_DTO, release_date: '' }).releaseYear).toBeNull()
    })

    it('devuelve null ante una fecha con formato inesperado', () => {
      expect(mapAlbumDTO({ ...ALBUM_DTO, release_date: 'unknown' }).releaseYear).toBeNull()
    })
  })
})

// ─── mapTrackDTO ──────────────────────────────────────────────────────────────

describe('mapTrackDTO', () => {
  const albumCtx = {
    id: '251380837',
    title: 'Toxicity',
    coverUrl: 'https://resources.tidal.com/images/a/b/640x640.jpg',
  }

  it('traduce snake_case a dominio', () => {
    expect(mapTrackDTO(TRACK_DTO, albumCtx)).toMatchObject({
      id: '251380838',
      title: 'Chop Suey!',
      trackNumber: 4,
      durationSeconds: 210,
      audioQuality: 'MASTER',
      audioModes: ['STEREO'],
      isrc: 'USSM10105601',
      artist: { id: '14670', name: 'System of a Down' },
    })
  })

  it('toma álbum y carátula del contexto, no del propio track', () => {
    // El DTO de track no siempre trae álbum; quien lo mapea ya sabe en qué
    // álbum está (detalle de álbum, resultados de búsqueda…).
    const track = mapTrackDTO(TRACK_DTO, albumCtx)
    expect(track.albumId).toBe(albumCtx.id)
    expect(track.albumTitle).toBe(albumCtx.title)
    expect(track.coverUrl).toBe(albumCtx.coverUrl)
  })

  it('rellena los campos opcionales ausentes', () => {
    const { audio_modes: _modes, isrc: _isrc, ...withoutOptionals } = TRACK_DTO
    const track = mapTrackDTO(withoutOptionals, albumCtx)
    expect(track.audioModes).toEqual([])
    expect(track.isrc).toBe('')
  })
})

// ─── mapWsMessageToProgress ───────────────────────────────────────────────────

describe('mapWsMessageToProgress', () => {
  const payload: WsProgressPayload = {
    job_id: 'job-abc',
    current_track_filename: '04 - Chop Suey!.flac',
    completed_tracks: 3,
    total_tracks: 14,
    progress_percent: 21,
    speed_mbps: 4.2,
    eta_seconds: 95,
  }

  it('traduce el payload del WebSocket a progreso de dominio', () => {
    expect(mapWsMessageToProgress(payload)).toEqual({
      jobId: 'job-abc',
      currentTrackFilename: '04 - Chop Suey!.flac',
      completedTracks: 3,
      totalTracks: 14,
      progressPercent: 21,
      speedMbps: 4.2,
      etaSeconds: 95,
    })
  })

  it('conserva los ceros en vez de tratarlos como ausentes', () => {
    // Un 0% recién empezado o 0 MB/s no deben convertirse en undefined/null:
    // la barra de progreso los pinta tal cual.
    const zeroed = mapWsMessageToProgress({
      ...payload,
      completed_tracks: 0,
      progress_percent: 0,
      speed_mbps: 0,
      eta_seconds: 0,
    })
    expect(zeroed.completedTracks).toBe(0)
    expect(zeroed.progressPercent).toBe(0)
    expect(zeroed.speedMbps).toBe(0)
    expect(zeroed.etaSeconds).toBe(0)
  })
})
