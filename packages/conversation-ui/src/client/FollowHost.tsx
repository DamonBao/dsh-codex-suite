import type { ReactNode } from 'react'
import css from './TypewriterAssistantNodeView.module.css'

/**
 * Structural host for streaming content.
 *
 * Current DSH ChatView is the sole owner of session scroll restoration,
 * reader unpinning, and live bottom-follow. The plugin intentionally performs
 * no scrollTop or transform writes here; doing so would race ChatView's private
 * scroll ledger when switching between sessions.
 */
export function FollowHost({
  active,
  speedCpsRef,
  minSpeedPxPerSec,
  maxSpeedPxPerSec,
  children,
}: {
  active: boolean
  speedCpsRef: { current: number }
  minSpeedPxPerSec?: number | undefined
  maxSpeedPxPerSec?: number | undefined
  children: ReactNode
}) {
  // Retain the established component contract for configuration compatibility;
  // current DSH owns scrolling, so these legacy motion values are ignored.
  void speedCpsRef
  void minSpeedPxPerSec
  void maxSpeedPxPerSec
  return <div className={css.follow} data-stream-follow={active || undefined}>{children}</div>
}
