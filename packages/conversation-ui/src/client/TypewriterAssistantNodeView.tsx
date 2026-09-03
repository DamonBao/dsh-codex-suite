import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import {
  JsonBlock,
  MarkdownText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatNodeViewProps, TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
// Type-only: the SessionStandardProps merge delivering `sessionId`.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { useConversationContent, type ConversationSmoothingPreset } from './useConversationContent.ts'
import { useFpsGuard } from './useFpsGuard.ts'
import { FollowHost } from './FollowHost.tsx'
import { DEFAULT_CONVERSATION_CONFIG, type ConversationMode } from '../config.ts'
import { DEFAULT_CONVERSATION_SETTINGS } from '../settings.ts'
import { useSearchableHidden } from './useSearchableHidden.ts'
import { useChatSeatHidden } from './useChatSeatHidden.ts'
import {
  isFallbackProcessMember,
  loadedProcessStart,
  ownsFallbackProcessControl,
} from './turnProcessFallback.ts'
import { useCompactTranscript } from './TranscriptViewBridge.tsx'
import css from './TypewriterAssistantNodeView.module.css'

type AssistantProps = ChatNodeViewProps<'assistant-step'>
type MarkdownProps = Pick<ComponentProps<typeof MarkdownText>, 'labels' | 'fileMentions' | 'text'>

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  )
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia === undefined) return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

interface AnimatedMarkdownTextProps extends MarkdownProps {
  streaming: boolean
  announce: boolean
  /** True while this final text arm is still draining its reveal queue. */
  ownFollow: boolean
  mode: ConversationMode
  preset: ConversationSmoothingPreset
  revealCharsPerSec: number
  scrollSpeedPxPerSec: number
  maxScrollSpeedPxPerSec: number
  shouldHoldBack: () => boolean
}

/**
 * Smooth streaming text arm. While the reply runs, the accumulated source is
 * revealed through the smoother at a rate that tracks the model's arrival
 * and rendered by the Harness `MarkdownText`
 * streaming arm (incremental parse, frozen non-tail blocks), so there is no
 * raw-text tail and no text-to-markdown swap: the tree stays markdown
 * throughout. DSH ChatView remains the sole owner of viewport follow while
 * this component only smooths content reveal. Once the stream closes and the
 * reveal queue drains, the settled full parse (KaTeX math, fence highlighting, file
 * mentions) swaps in exactly once.
 */
function AnimatedMarkdownText({
  text,
  labels,
  fileMentions,
  streaming,
  announce,
  ownFollow,
  mode,
  preset,
  revealCharsPerSec,
  scrollSpeedPxPerSec,
  maxScrollSpeedPxPerSec,
  shouldHoldBack,
}: AnimatedMarkdownTextProps) {
  const reduced = usePrefersReducedMotion()
  const [typing, setTyping] = useState(streaming)
  const speedCpsRef = useRef(35)
  const displayed = useConversationContent(text, {
    enabled: mode === 'typewriter' && typing && !reduced,
    preset,
    shouldHoldBack,
    steadyCps: mode === 'typewriter' ? revealCharsPerSec : undefined,
    speedCpsRef,
  })
  const shown = reduced || mode === 'teleprompter' ? text : displayed
  const live = typing && !reduced

  // The stream closed: keep revealing the remaining queue, then swap to the
  // settled parse exactly once. The markdown tree stays mounted until then.
  useEffect(() => {
    if (typing && !streaming && shown.length === text.length) setTyping(false)
  }, [shown, streaming, text, typing])

  if (live) {
    return (
      <>
        {announce && <span className={css.visuallyHidden} aria-live="polite">{text}</span>}
        <FollowHost
          active={ownFollow}
          speedCpsRef={speedCpsRef}
          minSpeedPxPerSec={scrollSpeedPxPerSec}
          maxSpeedPxPerSec={maxScrollSpeedPxPerSec}
        >
          <div className={css.markdownFlow}>
            <MarkdownText text={shown} streaming labels={labels} />
          </div>
        </FollowHost>
      </>
    )
  }
  return (
    <div className={css.markdownFlow}>
      <MarkdownText text={text} labels={labels} fileMentions={fileMentions} />
    </div>
  )
}

/**
 * Think is part of the Turn document flow rather than a second disclosure
 * card. It uses the same streaming smoother as ordinary assistant prose, so
 * reasoning reads as a continuous body while the surrounding Turn still owns
 * process folding and viewport follow.
 */
function AnimatedReasoning({
  text,
  labels,
  running,
  mode,
  preset,
  revealCharsPerSec,
  shouldHoldBack,
}: {
  text: string
  labels: MarkdownLabels
  running: boolean
  mode: ConversationMode
  preset: ConversationSmoothingPreset
  revealCharsPerSec: number
  shouldHoldBack: () => boolean
}) {
  const reduced = usePrefersReducedMotion()
  const [typing, setTyping] = useState(running)
  const speedCpsRef = useRef(35)
  const displayed = useConversationContent(text, {
    enabled: mode === 'typewriter' && typing && !reduced,
    preset,
    shouldHoldBack,
    steadyCps: mode === 'typewriter' ? revealCharsPerSec : undefined,
    speedCpsRef,
  })
  const shown = reduced || mode === 'teleprompter' ? text : displayed
  useEffect(() => {
    if (typing && !running && shown.length === text.length) setTyping(false)
  }, [shown, running, text, typing])
  const live = typing && !reduced
  return (
    <div
      className={css.reasoningText}
      data-stream-node="reasoning"
      data-stream-state={running ? 'running' : 'settled'}
      data-stream-reasoning=""
    >
      {live ? <MarkdownText text={shown} streaming labels={labels} /> : <MarkdownText text={text} labels={labels} />}
    </div>
  )
}

function ProcessReasoning({
  hidden,
  reveal,
  autoExpand,
  t,
  children,
}: {
  readonly hidden: boolean
  readonly reveal: () => void
  readonly autoExpand: boolean
  readonly t: AssistantProps['t']
  readonly children: ReactNode
}) {
  const ref = useSearchableHidden(hidden, reveal)
  return (
    <div ref={ref} data-turn-process-inline={hidden || undefined}>
      {autoExpand ? children : (
        <details className={css.reasoningDisclosure}>
          <summary className={css.reasoningSummary}>{t('message.turnProcess.thoughtForAWhile')}</summary>
          {children}
        </details>
      )}
    </div>
  )
}

/**
 * Assistant renderer for the Codex-style event stream. Teleprompter mode
 * publishes each latest model snapshot immediately; typewriter mode reveals
 * complete grapheme clusters at the configured rate. Reasoning stays in the
 * same document flow as ordinary prose, and the final Assistant message is marked separately
 * from intermediate process updates. The FPS guard holds offscreen typewriter
 * commits when the frame rate is degraded. Settled text uses the full Markdown
 * pipeline.
 */
export const TypewriterAssistantNodeView = memo(function TypewriterAssistantNodeView({
  mode = DEFAULT_CONVERSATION_CONFIG.mode,
  preset = DEFAULT_CONVERSATION_CONFIG.preset,
  revealCharsPerSec = DEFAULT_CONVERSATION_CONFIG.revealCharsPerSec,
  scrollSpeedPxPerSec = DEFAULT_CONVERSATION_CONFIG.scrollSpeedPxPerSec,
  maxScrollSpeedPxPerSec = DEFAULT_CONVERSATION_CONFIG.maxScrollSpeedPxPerSec,
  thinkAutoExpand = DEFAULT_CONVERSATION_SETTINGS.thinkAutoExpand,
  node,
  turnProcess,
  useTurnData,
  useSession,
  openFile,
  renderMessageImages,
  fileMentions,
  t,
}: AssistantProps & {
  mode?: ConversationMode
  preset?: ConversationSmoothingPreset
  revealCharsPerSec?: number
  scrollSpeedPxPerSec?: number
  maxScrollSpeedPxPerSec?: number
  thinkAutoExpand?: boolean
}) {
  const data = node.data
  const streaming = data.status === 'running'
  const reducedMotion = usePrefersReducedMotion()
  const { ref: guardRef, shouldHoldBack } = useFpsGuard(streaming)
  const rootSpeedRef = useRef(35)
  const turn = node.location.kind === 'turn' || node.location.kind === 'step'
    ? node.location.turn
    : undefined
  const compactTranscript = useCompactTranscript()
  const historyIncomplete = useSession(snapshot => snapshot.hasMore)
  const processStartLoaded = loadedProcessStart(node, turnProcess)
  const fallbackGate = { compactTranscript, historyIncomplete, processStartLoaded }
  const tail = useTurnData('turn-tail')
  const finalAnswer = data.status === 'settled'
    && data.finalNode !== undefined
    && tail?.closing?.finalNode.seq === data.finalNode.seq
  const phase = streaming
    ? 'streaming'
    : data.status === 'interrupted' ? 'interrupted' : finalAnswer ? 'final' : 'process'
  const owner = useMemo<TurnTailOwnerProps | undefined>(() => {
    if (turn?.status !== 'closed' || data.finalNode === undefined) return undefined
    if (tail?.closing?.finalNode.seq !== data.finalNode.seq) return undefined
    return { turn, seq: data.finalNode.seq, openFile }
  }, [data.finalNode, openFile, tail, turn])
  const mentions = useMemo(
    () => owner === undefined ? undefined : fileMentions(owner),
    [fileMentions, owner],
  )
  const labels = useMemo<MarkdownLabels>(() => ({
    code: { copyLabel: t('copy'), copiedLabel: t('copied') },
    footnotes: t('markdown.footnotes'),
  }), [t])
  const hasVisible = streaming
    || data.status === 'interrupted'
    || data.blocks.some(block => block.kind !== 'tool-call')
  const fallbackControl = ownsFallbackProcessControl(node, turnProcess, fallbackGate)
  const fallbackMember = isFallbackProcessMember(node, turnProcess, fallbackGate)
  const processCollapsible = turnProcess?.foldable === true || fallbackControl
  const reasoningHidden = processCollapsible
    && turnProcess?.spec.answerStep === data.step
    && turnProcess.spec.inlineReasoning
    && !turnProcess.open
  const fallbackHidden = fallbackMember && turnProcess?.open === false
  const revealProcess = useCallback(() => { turnProcess?.setOpen(true) }, [turnProcess])
  const seatRef = useChatSeatHidden(fallbackHidden, revealProcess)
  const rootRef = useCallback((element: HTMLElement | null) => {
    guardRef(element)
    seatRef(element)
  }, [guardRef, seatRef])
  if (!hasVisible) return null

  const rendered: ReactNode[] = []
  const last = data.blocks.length - 1
  let lastFollow = -1
  for (let index = 0; index < data.blocks.length; index += 1) {
    const kind = data.blocks[index]?.kind
    if (kind === 'text' || kind === 'reasoning') lastFollow = index
  }
  for (let index = 0; index < data.blocks.length; index += 1) {
    const block = data.blocks[index]
    if (block === undefined) continue
    switch (block.kind) {
      case 'text':
        rendered.push(
          <AnimatedMarkdownText
            key={index}
            text={block.text}
            labels={labels}
            fileMentions={mentions}
            streaming={streaming}
            announce={index === last}
            ownFollow={!streaming && index === lastFollow}
            mode={mode}
            preset={preset}
            revealCharsPerSec={revealCharsPerSec}
            scrollSpeedPxPerSec={scrollSpeedPxPerSec}
            maxScrollSpeedPxPerSec={maxScrollSpeedPxPerSec}
            shouldHoldBack={shouldHoldBack}
          />,
        )
        break
      case 'reasoning':
        rendered.push(
          <ProcessReasoning
            key={index}
            hidden={reasoningHidden}
            reveal={revealProcess}
            autoExpand={thinkAutoExpand || !streaming}
            t={t}
          >
            <AnimatedReasoning
              text={block.text}
              labels={labels}
              running={streaming && index === last}
              mode={mode}
              preset={preset}
              revealCharsPerSec={revealCharsPerSec}
              shouldHoldBack={shouldHoldBack}
            />
          </ProcessReasoning>,
        )
        break
      case 'image': {
        const start = index
        const group = [block]
        while (index + 1 < data.blocks.length) {
          const next = data.blocks[index + 1]
          if (next === undefined || next.kind !== 'image') break
          group.push(next)
          index += 1
        }
        rendered.push(
          <span key={start}>{renderMessageImages({ images: group, align: 'start' })}</span>,
        )
        break
      }
      case 'tool-call':
        break
      case 'other':
        rendered.push(
          <JsonBlock
            key={index}
            label={t('message.unknownBlock')}
            payload={block.block}
            truncatedLabel={total => t('json.truncated', { total })}
          />,
        )
        break
    }
  }

  return (
    <div
      ref={rootRef}
      className={css.root}
      data-stream-node="assistant-step"
      data-stream-phase={phase}
      data-streaming={streaming || undefined}
    >
      <FollowHost
        active={streaming && !reducedMotion}
        speedCpsRef={rootSpeedRef}
        minSpeedPxPerSec={scrollSpeedPxPerSec}
        maxSpeedPxPerSec={maxScrollSpeedPxPerSec}
      >
        <div className={css.body}>
          {rendered}
          {data.status === 'interrupted' && <span className={css.stopped}>{t('message.stopped')}</span>}
        </div>
      </FollowHost>
    </div>
  )
})
