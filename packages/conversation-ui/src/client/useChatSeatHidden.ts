import { useCallback, useLayoutEffect, useRef } from 'react'

const OWNER_ATTR = 'data-codex-process-hidden'

/**
 * Apply searchable hiding to the outer Chat row for a proven paginated-history
 * fallback. Resolving the seat on every render follows rows moved by Tool-group
 * portals without leaving ownership or beforematch listeners on stale seats.
 */
export function useChatSeatHidden(hidden: boolean, reveal: () => void): (element: HTMLElement | null) => void {
  const rootRef = useRef<HTMLElement | null>(null)
  const revealRef = useRef(reveal)
  revealRef.current = reveal

  const ref = useCallback((element: HTMLElement | null) => {
    rootRef.current = element
  }, [])

  useLayoutEffect(() => {
    const seat = rootRef.current?.closest<HTMLElement>('[data-chat-anchor-key]')
    if (seat === null || seat === undefined) return
    if (!hidden) {
      if (seat.hasAttribute(OWNER_ATTR)) {
        seat.removeAttribute(OWNER_ATTR)
        seat.removeAttribute('hidden')
      }
      return
    }

    const beforeMatch = () => { revealRef.current() }
    seat.addEventListener('beforematch', beforeMatch)
    const applyHidden = () => {
      if (seat.contains(seat.ownerDocument.activeElement)) {
        revealRef.current()
        return
      }
      if (seat.getAttribute('hidden') !== 'until-found') seat.setAttribute('hidden', 'until-found')
      seat.setAttribute(OWNER_ATTR, '')
    }
    applyHidden()

    // ChatNodeSeat also commits native false while history is incomplete. A
    // later parent effect may remove our attribute; restore it in the same
    // mutation checkpoint, before the browser paints an expanded row.
    const observer = typeof MutationObserver === 'undefined'
      ? undefined
      : new MutationObserver(() => { applyHidden() })
    observer?.observe(seat, { attributes: true, attributeFilter: ['hidden'] })

    return () => {
      observer?.disconnect()
      seat.removeEventListener('beforematch', beforeMatch)
      if (!seat.hasAttribute(OWNER_ATTR)) return
      seat.removeAttribute(OWNER_ATTR)
      seat.removeAttribute('hidden')
    }
  })

  return ref
}

const VISIBLE_OWNER_ATTR = 'data-codex-process-control'

/** Keep DSH's normally inactive turn-process seat visible for the fallback. */
export function useChatSeatVisible(visible: boolean): (element: HTMLElement | null) => void {
  const rootRef = useRef<HTMLElement | null>(null)
  const ref = useCallback((element: HTMLElement | null) => {
    rootRef.current = element
  }, [])

  useLayoutEffect(() => {
    if (!visible) return
    const seat = rootRef.current?.closest<HTMLElement>('[data-chat-anchor-key]')
    if (seat === null || seat === undefined) return
    const applyVisible = () => {
      seat.setAttribute(VISIBLE_OWNER_ATTR, '')
      seat.removeAttribute('hidden')
    }
    applyVisible()
    const observer = typeof MutationObserver === 'undefined'
      ? undefined
      : new MutationObserver(() => { applyVisible() })
    observer?.observe(seat, { attributes: true, attributeFilter: ['hidden'] })
    return () => {
      observer?.disconnect()
      seat.removeAttribute(VISIBLE_OWNER_ATTR)
    }
  })

  return ref
}
