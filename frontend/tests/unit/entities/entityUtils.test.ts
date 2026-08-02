import { describe, expect, it } from 'vitest'

import {
  formatTrackNumber,
  getAudioModeLabel,
  getAudioQualityLabel,
  isJobActive,
  isJobTerminal,
} from '@/entities'
import type { AudioMode, AudioQuality, DownloadJob, DownloadJobStatus, Track } from '@/entities'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function jobWithStatus(status: DownloadJobStatus): DownloadJob {
  return {
    id: 'job-1',
    backendJobId: 'backend-1',
    albumId: 'album-1',
    albumTitle: 'Toxicity',
    artistName: 'System of a Down',
    totalTracks: 14,
    qualityOverride: null,
    completedTracks: 0,
    currentTrackFilename: null,
    progressPercent: 0,
    speedMbps: null,
    etaSeconds: null,
    status,
    error: null,
    startedAt: null,
    completedAt: null,
    outputPath: null,
  }
}

function trackNumbered(trackNumber: number): Track {
  return {
    id: 't',
    title: 'Chop Suey!',
    trackNumber,
    durationSeconds: 210,
    audioQuality: 'MASTER',
    audioModes: [],
    isrc: '',
    artist: { id: '1', name: 'System of a Down' },
    albumId: 'album-1',
    albumTitle: 'Toxicity',
    coverUrl: '',
  }
}

// ─── album ────────────────────────────────────────────────────────────────────

describe('getAudioQualityLabel', () => {
  it('traduce cada calidad a su etiqueta', () => {
    const expected: Record<AudioQuality, string> = {
      MASTER: 'Master',
      HIRES: 'Hi-Res',
      HIGH: 'High',
      NORMAL: 'Normal',
    }
    for (const [quality, label] of Object.entries(expected)) {
      expect(getAudioQualityLabel(quality as AudioQuality)).toBe(label)
    }
  })
})

describe('getAudioModeLabel', () => {
  it('traduce cada modo a su etiqueta', () => {
    const expected: Record<AudioMode, string> = {
      MQA: 'MQA',
      SONY_360RA: '360RA',
      DOLBY_ATMOS: 'Atmos',
      STEREO: 'Stereo',
    }
    for (const [mode, label] of Object.entries(expected)) {
      expect(getAudioModeLabel(mode as AudioMode)).toBe(label)
    }
  })
})

// ─── track ────────────────────────────────────────────────────────────────────

describe('formatTrackNumber', () => {
  it('rellena con cero a la izquierda hasta dos dígitos', () => {
    expect(formatTrackNumber(trackNumbered(1))).toBe('01')
    expect(formatTrackNumber(trackNumbered(9))).toBe('09')
  })

  it('deja intactos los números de dos o más dígitos', () => {
    expect(formatTrackNumber(trackNumbered(10))).toBe('10')
    expect(formatTrackNumber(trackNumbered(140))).toBe('140')
  })
})

// ─── download-job ─────────────────────────────────────────────────────────────

describe('isJobActive', () => {
  it('solo es cierto para el estado active', () => {
    expect(isJobActive(jobWithStatus('active'))).toBe(true)
    for (const status of ['queued', 'paused', 'completed', 'error'] as const) {
      expect(isJobActive(jobWithStatus(status))).toBe(false)
    }
  })
})

describe('isJobTerminal', () => {
  it('es cierto para completed y error', () => {
    expect(isJobTerminal(jobWithStatus('completed'))).toBe(true)
    expect(isJobTerminal(jobWithStatus('error'))).toBe(true)
  })

  it('es falso mientras el trabajo puede seguir avanzando', () => {
    // paused cuenta como no terminal: se puede reanudar.
    for (const status of ['queued', 'active', 'paused'] as const) {
      expect(isJobTerminal(jobWithStatus(status))).toBe(false)
    }
  })
})
