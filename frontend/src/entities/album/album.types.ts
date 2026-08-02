export type AudioQuality = 'MASTER' | 'HIRES' | 'HIGH' | 'NORMAL'
export type AudioMode = 'MQA' | 'SONY_360RA' | 'DOLBY_ATMOS' | 'STEREO'

export interface Artist {
  readonly id: string
  readonly name: string
}

export interface Label {
  readonly id: string
  readonly name: string
}

export interface Album {
  readonly id: string
  readonly title: string
  readonly artist: Artist
  readonly coverUrl: string
  /** null cuando Tidal no publica fecha de lanzamiento para el álbum. */
  readonly releaseYear: number | null
  readonly releaseDate: string
  readonly numberOfTracks: number
  readonly durationSeconds: number
  readonly audioQuality: AudioQuality
  readonly audioModes: readonly AudioMode[]
  readonly upc: string
  readonly label: Label
  readonly genre: string | null
  /** "ALBUM" | "EP" | "SINGLE" | "COMPILATION" (Tidal release type) */
  readonly type: string | null
}
