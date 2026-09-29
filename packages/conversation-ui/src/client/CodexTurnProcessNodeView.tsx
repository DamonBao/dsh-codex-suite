import { memo, type Ref } from 'react'
// Type-only: SessionStandardProps supplies useSession to Chat node owners.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {
  ChatNodeViewProps,
  TurnProcessOwnerProps,
} from '@deepseek-ai/dsh-client-ui-chat/client'
import {
  IconChevronDownOutlineMedium,
  IconChevronRightOutlineMedium,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { formatTurnElapsed } from './turnElapsed.ts'
import { useCompactTranscript } from './TranscriptViewBridge.tsx'
import { loadedProcessStart, usesTurnProcessFallback } from './turnProcessFallback.ts'
import { useChatSeatVisible } from './useChatSeatHidden.ts'
import css from './TypewriterAssistantNodeView.module.css'

type TurnProcessT = ChatNodeViewProps<'turn-process'>['t']

/** Shared Codex disclosure button for native and paginated-history fallback seats. */
export function CodexTurnProcessControl({
  turn,
  messageCount,
  toolCallCount,
  subagentCount,
  elapsedMs,
  reason,
  canCollapse,
  turnProcess,
  t,
  fallback = false,
  rootRef,
}: {
  readonly turn: number
  readonly messageCount: number
  readonly toolCallCount: number
  readonly subagentCount: number
  readonly elapsedMs?: number | undefined
  readonly reason?: string | undefined
  readonly canCollapse: boolean
  readonly turnProcess: TurnProcessOwnerProps
  readonly t: TurnProcessT
  readonly fallback?: boolean
  readonly rootRef?: Ref<HTMLDivElement> | undefined
}) {
  const label = reason === 'aborted' ? t('message.stopped')
    : reason === 'error' ? t('message.turnProcess.failed')
      : elapsedMs === undefined ? t('message.turnProcess.worked')
        : formatTurnElapsed(Math.max(1_000, elapsedMs), t)
  const announcement = reason === 'aborted' ? t('message.stopped')
    : reason === 'error' ? t('message.turnProcess.failed')
      : t('message.turnProcess.worked')
  const open = !canCollapse || turnProcess.open
  return (
    <>
      <span className={css.visuallyHidden} role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
      <div
        ref={rootRef}
        className={css.turnFoldRow}
        data-turn-fold-row=""
        data-turn-fold-state={reason === 'aborted' ? 'stopped' : reason === 'error' ? 'failed' : 'completed'}
        data-turn-process-fallback={fallback || undefined}
      >
        <button
          type="button"
          className={css.turnFoldButton}
          data-open={open || undefined}
          data-turn-process={turn}
          data-turn-process-messages={messageCount}
          data-turn-process-tool-calls={toolCallCount}
          data-turn-process-subagents={subagentCount}
          disabled={!canCollapse}
          aria-expanded={turnProcess.hasContent || fallback ? open : undefined}
          onClick={(event) => {
            event.currentTarget.focus()
            turnProcess.setOpen(!open)
          }}
        >
          <span>{label}</span>
          {canCollapse && (open ? <IconChevronDownOutlineMedium /> : <IconChevronRightOutlineMedium />)}
        </button>
      </div>
    </>
  )
}

/** Codex-style presentation over DSH's authoritative Turn-process state. */
export const CodexTurnProcessNodeView = memo(function CodexTurnProcessNodeView({
  node,
  turnProcess,
  useSession,
  t,
}: ChatNodeViewProps<'turn-process'>) {
  if (turnProcess === undefined) throw new Error('turn-process node requires DSH turnProcess owner state')
  const compactTranscript = useCompactTranscript()
  const historyIncomplete = useSession(snapshot => snapshot.hasMore)
  const fallback = usesTurnProcessFallback(node, turnProcess, {
    compactTranscript,
    historyIncomplete,
    processStartLoaded: loadedProcessStart(node, turnProcess),
  })
  const seatRef = useChatSeatVisible(fallback)
  const location = node.location
  const turn = location.kind === 'turn' || location.kind === 'step' ? location.turn : undefined
  if (turn?.status !== 'closed') return null
  const reason = turn.end?.data.reason.kind
  const canCollapse = (turnProcess.foldable && turnProcess.hasContent
    && reason !== 'aborted' && reason !== 'error') || fallback
  const elapsedMs = turn?.start !== undefined && turn.end !== undefined
    ? turn.end.time - turn.start.time
    : undefined
  return (
    <CodexTurnProcessControl
      turn={node.data.turn}
      messageCount={node.data.messageCount}
      toolCallCount={node.data.toolCallCount}
      subagentCount={node.data.subagentCount}
      elapsedMs={elapsedMs}
      reason={reason}
      canCollapse={canCollapse}
      turnProcess={turnProcess}
      t={t}
      fallback={fallback}
      rootRef={seatRef}
    />
  )
})
