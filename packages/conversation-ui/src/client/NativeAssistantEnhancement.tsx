import { createElement, useCallback, useEffect, useMemo, useSyncExternalStore, type ComponentType, type FunctionComponent } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatNodeViewProps, UseDisclosure } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ConversationConfig } from '../config.ts'
import { useConversationContent } from './useConversationContent.ts'

type AssistantProps = Omit<ChatNodeViewProps<'assistant-step'>, 't'>

/** Live plugin preference shared with the settings card. */
export interface ThinkingPreference {
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => boolean
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
function reducedMotion(): boolean {
  return window.matchMedia?.(REDUCED_MOTION).matches === true
}
function subscribeMotion(listener: () => void): () => void {
  const query = window.matchMedia?.(REDUCED_MOTION)
  query?.addEventListener('change', listener)
  return () => { query?.removeEventListener('change', listener) }
}

/**
 * Enhance assistant input while delegating every visual and owner prop to the
 * registered renderer. DSH retains Markdown, images, work-details policy,
 * disclosure resets, interrupted output, and final-answer actions.
 * @param NativeAssistant - existing assistant renderer, including memo components.
 * @param config - validated reveal configuration.
 * @param preference - live auto-expand preference.
 * @returns a renderer with no additional DOM or styles.
 */
export function enhanceNativeAssistant(
  NativeAssistant: ComponentType<AssistantProps>,
  config: ConversationConfig,
  preference: ThinkingPreference,
): FunctionComponent<AssistantProps> {
  function EnhancedAssistant(props: AssistantProps) {
    const autoExpand = useSyncExternalStore(preference.subscribe, preference.getSnapshot, preference.getSnapshot)
    const reduced = useSyncExternalStore(subscribeMotion, reducedMotion, () => false)
    const running = props.node.data.status === 'running'
    const blocks = props.node.data.blocks
    const source = useMemo(() => blocks.flatMap(block => {
      if (block.kind !== 'text' && block.kind !== 'reasoning') return []
      if (props.groupPart === 'reasoning' && block.kind !== 'reasoning') return []
      if (props.groupPart === 'response' && block.kind === 'reasoning') return []
      return [block.text]
    }).join(''), [blocks, props.groupPart])
    const displayed = useConversationContent(source, {
      enabled: running && config.mode === 'typewriter' && !reduced,
      preset: config.preset,
      steadyCps: config.revealCharsPerSec,
    })
    // A settled/interrupted snapshot is authoritative; native Turn folding must
    // never hide an answer whose reveal queue is still draining.
    const shown = running && config.mode === 'typewriter' && !reduced ? displayed : source
    const node = useMemo(() => {
      if (shown === source) return props.node
      let remaining = shown.length
      return {
        ...props.node,
        data: {
          ...props.node.data,
          blocks: blocks.map(block => {
            if (block.kind !== 'text' && block.kind !== 'reasoning') return block
            if (props.groupPart === 'reasoning' && block.kind !== 'reasoning') return block
            if (props.groupPart === 'response' && block.kind === 'reasoning') return block
            const text = block.text.slice(0, remaining)
            remaining = Math.max(0, remaining - block.text.length)
            return text === block.text ? block : { ...block, text }
          }),
        },
      }
    }, [blocks, props.groupPart, props.node, shown, source])
    const originalDisclosure = props.useDisclosure
    const useDisclosure = useCallback<UseDisclosure>(() => {
      const disclosure = originalDisclosure()
      const { setExpanded } = disclosure
      // Open once when streaming starts or the preference changes. Manual
      // collapse stays closed during the same stream; DSH still owns resets.
      useEffect(() => {
        if (running) setExpanded(autoExpand)
      }, [autoExpand, running, setExpanded])
      return disclosure
    }, [autoExpand, originalDisclosure, running])
    return createElement(NativeAssistant, { ...props, node, useDisclosure })
  }
  return props => createElement(EnhancedAssistant, {
    ...props, key: `${props.sessionId}:${props.node.key}:${props.groupPart ?? ''}`,
  })
}

/**
 * Enhance the winning assistant renderer in place. dsh 0.2.1 gives the native
 * assistant entry its own child slots (reasoning body, message images), which
 * a separate shadowing registration could not carry; swapping the entry's
 * component keeps children, inject, store, and locale seats untouched while
 * the enhancement delegates every visual to the native renderer.
 * @param ctx - browser context with the slot registry.
 * @param config - validated reveal configuration.
 * @param preference - live auto-expand preference.
 * @returns disposer restoring the original component.
 */
export function registerAssistantEnhancement(ctx: Context, config: ConversationConfig, preference: ThinkingPreference): () => void {
  let target: StoredEntry | undefined
  let original: unknown
  const restore = (): void => {
    if (target !== undefined) target.component = original
    target = undefined
    original = undefined
  }
  const reconcile = (): void => {
    // Lowest priority renders, and entries arrive sorted ascending.
    const winner = ctx.slots.entries('conversation.chat.node').find(entry => entry.options.key === 'assistant-step')
    if (winner === target) return
    restore()
    // Memoized native renderers are objects, plain components functions.
    if (winner === undefined || winner.component === null
      || (typeof winner.component !== 'function' && typeof winner.component !== 'object')) return
    target = winner
    original = winner.component
    winner.component = enhanceNativeAssistant(original as ComponentType<AssistantProps>, config, preference)
  }
  const off = ctx.on('slots/changed', (name: string) => {
    if (name === 'conversation.chat.node') reconcile()
  })
  try { reconcile() } catch (error) { off(); restore(); throw error }
  return () => { off(); restore() }
}
