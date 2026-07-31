'use client'

import { useEffect } from 'react'

// ─── Focus trap ───────────────────────────────────────────────────────────────
// Extraído de shared/ui/Modal para reutilizarlo en cualquier superficie modal
// (Modal, drawer de navegación móvil). Mantiene el foco ciclando dentro del
// contenedor mientras `active` es true y enfoca el primer elemento al activarse.

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

// El ref admite `null` porque desde React 19 `useRef<T>(null)` se tipa como
// `RefObject<T | null>`: el elemento no existe hasta que se monta.
export function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active || !ref.current) return
    const el = ref.current
    const items = el.querySelectorAll<HTMLElement>(FOCUSABLE)
    const first = items[0]
    const last  = items[items.length - 1]
    first?.focus()

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', trap)
    return () => document.removeEventListener('keydown', trap)
  }, [ref, active])
}
