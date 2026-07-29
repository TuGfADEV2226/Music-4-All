import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import TermsPage from '@/app/legal/terms/page'
import CopyrightPage from '@/app/legal/copyright/page'
import DisclaimerPage from '@/app/legal/disclaimer/page'

// Los documentos legales son Server Components estáticos (sin next/link ni APIs de
// servidor): usan LegalDocument + anclas planas, así que renderizan en jsdom.

describe('legal documents', () => {
  it('Terms names the operator, an acceptable-use section, and a contact email', () => {
    render(<TermsPage />)
    expect(
      screen.getByRole('heading', { level: 1, name: /terms of service/i })
    ).toBeVisible()
    // Placeholders rellenados: el operador y el contacto reales deben aparecer.
    expect(screen.getByText('TuGfA')).toBeVisible()
    expect(screen.getByRole('heading', { name: /acceptable use/i })).toBeVisible()
    expect(
      screen.getByRole('link', { name: /twittersno45@gmail\.com/i })
    ).toBeInTheDocument()
  })

  it('Copyright includes DMCA takedown steps, the designated agent, and a repeat-infringer policy', () => {
    render(<CopyrightPage />)
    expect(
      screen.getByRole('heading', { name: /copyright & dmca policy/i })
    ).toBeVisible()
    expect(screen.getByText(/takedown notice/i)).toBeInTheDocument()
    // El agente DMCA designado (placeholders rellenados, contacto solo por email).
    expect(screen.getByText('TuGfA')).toBeVisible()
    expect(
      screen.getByRole('link', { name: /twittersno45@gmail\.com/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/repeat-infringer/i)).toBeInTheDocument()
  })

  it('Disclaimer states no Tidal affiliation and that access may be revoked', () => {
    render(<DisclaimerPage />)
    expect(screen.getByText(/no affiliation with tidal/i)).toBeInTheDocument()
    // Divulgación del riesgo de revocación (client_id compartido, riesgo del plan).
    expect(screen.getByText(/revoked at any/i)).toBeInTheDocument()
  })
})
