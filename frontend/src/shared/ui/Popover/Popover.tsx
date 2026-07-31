'use client'

import { cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

import { cn } from '@/shared/lib/cn'

// ─── Types ───────────────────────────────────────────────────────────────────

export type PopoverSide  = 'top' | 'bottom' | 'left' | 'right'
export type PopoverAlign = 'start' | 'center' | 'end'

export interface PopoverProps {
  trigger: React.ReactNode
  content: React.ReactNode
  /** Controlled open state */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  side?: PopoverSide
  align?: PopoverAlign
  className?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

// z-tooltip token from design-system §1.5 (var(--z-tooltip) = 600)
// Defined as number to satisfy React.CSSProperties — matches the CSS variable value
const Z_TOOLTIP = 600

const POPOVER_OFFSET = 4

// ─── Animation variants ───────────────────────────────────────────────────────

const popoverV = {
  hidden:  { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.1, ease: 'easeOut' } },
  exit:    { opacity: 0, scale: 0.96, transition: { duration: 0.08, ease: 'easeIn' } },
}

// ─── Focus trap helper (A-02) ─────────────────────────────────────────────────

function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active || !ref.current) return
    const el = ref.current
    const items = el.querySelectorAll<HTMLElement>(FOCUSABLE)
    const first = items[0]
    const last  = items[items.length - 1]

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

// ─── Positioning ─────────────────────────────────────────────────────────────

interface Coords { top: number; left: number }

function calcPosition(
  triggerRect: DOMRect,
  contentRect: DOMRect,
  side: PopoverSide,
  align: PopoverAlign
): Coords {
  let top = 0
  let left = 0

  if (side === 'bottom') top = triggerRect.bottom + POPOVER_OFFSET
  if (side === 'top')    top = triggerRect.top - contentRect.height - POPOVER_OFFSET
  if (side === 'left' || side === 'right') top = triggerRect.top

  if (side === 'left')  left = triggerRect.left - contentRect.width - POPOVER_OFFSET
  if (side === 'right') left = triggerRect.right + POPOVER_OFFSET

  if (side === 'top' || side === 'bottom') {
    if (align === 'start')  left = triggerRect.left
    if (align === 'center') left = triggerRect.left + triggerRect.width / 2 - contentRect.width / 2
    if (align === 'end')    left = triggerRect.right - contentRect.width
  }

  if (side === 'left' || side === 'right') {
    if (align === 'start')  top = triggerRect.top
    if (align === 'center') top = triggerRect.top + triggerRect.height / 2 - contentRect.height / 2
    if (align === 'end')    top = triggerRect.bottom - contentRect.height
  }

  const vp = { w: window.innerWidth, h: window.innerHeight }
  left = Math.max(8, Math.min(left, vp.w - contentRect.width - 8))
  top  = Math.max(8, Math.min(top,  vp.h - contentRect.height - 8))

  return { top, left }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Popover({
  trigger,
  content,
  open,
  onOpenChange,
  side  = 'bottom',
  align = 'start',
  className,
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = open ?? internalOpen

  const setOpen = useCallback(
    (v: boolean) => {
      setInternalOpen(v)
      onOpenChange?.(v)
    },
    [onOpenChange]
  )

  // triggerRef is injected into the trigger element via cloneElement (A-03)
  const triggerRef  = useRef<HTMLElement>(null)
  const contentRef  = useRef<HTMLDivElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)
  const [coords, setCoords]   = useState<Coords>({ top: 0, left: 0 })
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // A-02: Focus management — save current focus, focus first element in popover,
  // restore focus to trigger on close
  useEffect(() => {
    if (isOpen) {
      prevFocusRef.current = document.activeElement as HTMLElement
      // rAF ensures the motion animation has started before we move focus
      const frame = requestAnimationFrame(() => {
        const first = contentRef.current?.querySelector<HTMLElement>(FOCUSABLE)
        first?.focus()
      })
      return () => cancelAnimationFrame(frame)
    } else {
      prevFocusRef.current?.focus()
      prevFocusRef.current = null
    }
  }, [isOpen])

  // A-02: Focus trap inside popover content
  useFocusTrap(contentRef, isOpen)

  // Recalculate position after content mounts
  useEffect(() => {
    if (!isOpen || !triggerRef.current || !contentRef.current) return
    const tRect = triggerRef.current.getBoundingClientRect()
    const cRect = contentRef.current.getBoundingClientRect()
    setCoords(calcPosition(tRect, cRect, side, align))
  }, [isOpen, side, align])

  // Click outside
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !contentRef.current?.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, setOpen])

  // Escape key
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, setOpen])

  // A-03: Inject ref + onClick directly into the trigger element.
  // Removes the non-accessible <div> wrapper. The trigger manages its own
  // keyboard accessibility (Button, etc. already handle Enter/Space).
  const triggerElement = isValidElement(trigger)
    ? cloneElement(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        trigger as React.ReactElement<any>,
        {
          ref: triggerRef,
          onClick: (e: React.MouseEvent) => {
            // Preserve original onClick if present
            ;(trigger as React.ReactElement<{ onClick?: React.MouseEventHandler }>).props.onClick?.(e)
            setOpen(!isOpen)
          },
        }
      )
    : trigger

  return (
    <>
      {triggerElement}

      {mounted && createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              key="popover"
              ref={contentRef}
              role="dialog"
              aria-modal="true"
              variants={popoverV}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{
                position: 'fixed',
                top:      coords.top,
                left:     coords.left,
                zIndex:   Z_TOOLTIP,   // --z-tooltip token
                minWidth: 160,
                maxWidth: 320,
              }}
              className={cn(
                // T-01: use border token instead of hardcoded hex
                'bg-surface-studio border rounded-md shadow-md',
                'focus:outline-none',
                className
              )}
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
