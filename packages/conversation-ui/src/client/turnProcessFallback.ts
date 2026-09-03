import type {
  ChatNode,
  TurnProcessOwnerProps,
} from '@deepseek-ai/dsh-client-ui-chat/client'

const INDEPENDENT_KINDS: ReadonlySet<string> = new Set([
  'system-prompt',
  'user',
  'steering',
  'turn-process',
  'turn-error',
  'turn-max-tokens',
  'turn-tail',
])

export interface TurnProcessFallbackGate {
  readonly compactTranscript: boolean
  readonly historyIncomplete: boolean
  readonly processStartLoaded: boolean
}

function isChatNode(value: unknown): value is ChatNode {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as Partial<ChatNode>
  return typeof candidate.kind === 'string'
    && typeof candidate.anchorSeq === 'number'
    && candidate.location !== undefined
    && candidate.data !== undefined
}

/**
 * Prove that this Turn's actual start event is present in the loaded location.
 * A Chat row does not normally anchor at `turn/start`, so scanning row anchors
 * cannot establish this boundary; the shared Turn location is the authority.
 */
export function loadedProcessStart(node: unknown, turnProcess: TurnProcessOwnerProps | undefined): boolean {
  if (!isChatNode(node) || turnProcess === undefined) return false
  const location = node.location
  if (location.kind !== 'turn' && location.kind !== 'step') return false
  return location.turn.start?.seq === turnProcess.spec.processStartSeq
}

/**
 * Current DSH disables native folding for every loaded Turn while any older
 * history page remains. In Compact mode Codex presentation can safely fall
 * back only when the loaded window includes this Turn's start boundary.
 */
export function usesTurnProcessFallback(
  node: unknown,
  turnProcess: TurnProcessOwnerProps | undefined,
  gate: TurnProcessFallbackGate,
): boolean {
  if (!gate.compactTranscript || !gate.historyIncomplete || !gate.processStartLoaded) return false
  if (!isChatNode(node) || turnProcess === undefined || turnProcess.foldable) return false
  const location = node.location
  if (location.kind !== 'turn' && location.kind !== 'step') return false
  const spec = turnProcess.spec
  if (location.turn.status !== 'closed'
    || location.turn.end?.data.reason.kind !== 'completed'
    || location.turn.turn !== spec.turn
    || spec.answerAnchorSeq === null) return false
  return spec.inlineReasoning
    || spec.messageCount > 0
    || spec.toolCallCount > 0
    || spec.subagentCount > 0
}

/** Whether this row belongs to the fallback's bounded process window. */
export function isFallbackProcessMember(
  node: unknown,
  turnProcess: TurnProcessOwnerProps | undefined,
  gate: TurnProcessFallbackGate,
): boolean {
  if (!isChatNode(node) || !usesTurnProcessFallback(node, turnProcess, gate) || turnProcess === undefined) return false
  const answerAnchor = turnProcess.spec.answerAnchorSeq
  return answerAnchor !== null
    && !INDEPENDENT_KINDS.has(node.kind)
    && node.anchorSeq >= turnProcess.spec.processStartSeq
    && node.anchorSeq < answerAnchor
}

/** Whether this Assistant is the finalized answer that can host fallback control. */
export function ownsFallbackProcessControl(
  node: ChatNode<'assistant-step'>,
  turnProcess: TurnProcessOwnerProps | undefined,
  gate: TurnProcessFallbackGate,
): boolean {
  return usesTurnProcessFallback(node, turnProcess, gate)
    && turnProcess?.spec.answerStep === node.data.step
}
