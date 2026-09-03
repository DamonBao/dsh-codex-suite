import { memo, type Ref } from 'react'
// Type-only: SessionStandardProps supplies useSession to Chat node owners.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {
  ChatNodeViewProps,
  TurnProcessOwnerProps,
} from '@deepseek-ai/dsh-client-ui-chat/client'
import {
  IconChevronDownOutline14,
  IconChevronRightOutline14,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { formatTurnElapsed } from './turnElapsed.ts'
import { useCompactTranscript } from './TranscriptViewBridge.tsx'
import { loadedProcessStart, usesTurnProcessFallback } from './turnProcessFallback.ts'
import { useChatSeatVisible } from './useChatSeatHidden.ts'
import css from './TypewriterAssistantNodeView.module.css'

type TurnProcessT = ChatNodeViewProps<'turn-process'>['t']

function processSummary(
  counts: { messageCount: number; toolCallCount: number; subagentCount: number },
  t: TurnProcessT,
): string {
  const labels: string[] = []
  if (counts.toolCallCount > 0) {
    labels.push(t(
      counts.toolCallCount === 1
        ? 'message.turnProcess.toolCalls.one'
        : 'message.turnProcess.toolCalls.other',
      { count: counts.toolCallCount },
    ))
  }
  if (counts.messageCount > 0) {
    labels.push(t(
      counts.messageCount === 1
        ? 'message.turnProcess.messages.one'
        : 'message.turnProcess.messages.other',
      { count: counts.messageCount },
    ))
  }
  if (counts.subagentCount > 0) {
    labels.push(t(
      counts.subagentCount === 1
        ? 'message.turnProcess.subagents.one'
        : 'message.turnProcess.subagents.other',
      { count: counts.subagentCount },
    ))
  }
  return labels.length === 0
    ? t('message.turnProcess.thoughtForAWhile')
    : labels.join(t('message.turnProcess.separator'))
}

/** Shared Codex disclosure button for native and paginated-history fallback seats. */
export function CodexTurnProcessControl({
  turn,
  messageCount,
  toolCallCount,
  subagentCount,
  elapsedMs,
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
  readonly turnProcess: TurnProcessOwnerProps
  readonly t: TurnProcessT
  readonly fallback?: boolean
  readonly rootRef?: Ref<HTMLDivElement> | undefined
}) {
  const label = elapsedMs === undefined
    ? processSummary({ messageCount, toolCallCount, subagentCount }, t)
    : formatTurnElapsed(Math.max(0, elapsedMs), t)
  return (
    <div
      ref={rootRef}
      className={css.turnFoldRow}
      data-turn-fold-row=""
      data-turn-fold-state="completed"
      data-turn-process-fallback={fallback || undefined}
    >
      <button
        type="button"
        className={css.turnFoldButton}
        data-open={turnProcess.open || undefined}
        data-turn-process={turn}
        data-turn-process-messages={messageCount}
        data-turn-process-tool-calls={toolCallCount}
        data-turn-process-subagents={subagentCount}
        aria-expanded={turnProcess.open}
        onClick={(event) => {
          event.currentTarget.focus()
          turnProcess.setOpen(!turnProcess.open)
        }}
      >
        <span>{label}</span>
        {turnProcess.open ? <IconChevronDownOutline14 /> : <IconChevronRightOutline14 />}
      </button>
    </div>
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
  if (!turnProcess.foldable && !fallback) return null
  const location = node.location
  const turn = location.kind === 'turn' || location.kind === 'step' ? location.turn : undefined
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
      turnProcess={turnProcess}
      t={t}
      fallback={fallback}
      rootRef={seatRef}
    />
  )
})
