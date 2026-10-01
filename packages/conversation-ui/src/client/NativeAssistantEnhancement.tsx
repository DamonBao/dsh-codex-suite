import { createElement, useCallback, useEffect, useMemo, useSyncExternalStore, type ComponentType, type FunctionComponent } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { StoredEntry, LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'
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

const REGISTRANT = 'dsh-conversation-ui:assistant-enhancement'

/**
 * Use the public keyed replacement seat without mutating stored registrations.
 * The existing renderer's injection and locale travel with the delegated
 * component; load/unload order is handled by the slot declaration lifetime.
 * @param ctx - browser context with the slot registry.
 * @param config - validated reveal configuration.
 * @param preference - live auto-expand preference.
 * @returns disposer for the assistant contribution and registration listener.
 */
export function registerAssistantEnhancement(ctx: Context, config: ConversationConfig, preference: ThinkingPreference): () => void {
  let original: StoredEntry | undefined
  let dispose: (() => void) | undefined
  let changing = false
  const reconcile = (): void => {
    if (changing) return
    const next = ctx.slots.entries('conversation.chat.node').find(entry =>
      entry.options.key === 'assistant-step' && entry.registrant !== REGISTRANT)
    if (next === original) return
    changing = true
    try {
      dispose?.()
      dispose = undefined
      original = next
      if (next === undefined) return
      // A renderer that owns child slots cannot be delegated from a different
      // registration. Leave that renderer native rather than losing its seats.
      if (next.children !== undefined || next.store !== undefined) return
      // The registry erases injection parameters after validating registration.
      const originalInject = next.inject as ((sessionId: AssistantProps['sessionId']) => Record<string, unknown>) | undefined
      const component = enhanceNativeAssistant(next.component as ComponentType<AssistantProps>, config, preference)
      dispose = ctx.slots.register({
        name: 'conversation.chat.node',
        key: 'assistant-step',
        priority: (next.options.priority ?? 0) - 1,
        registrant: REGISTRANT,
        ...(next.locale === undefined ? {} : { locale: next.locale as keyof LocaleNamespaceMap }),
        inject: (sessionId: AssistantProps['sessionId']) => originalInject?.(sessionId) ?? {},
      }, component)
    } finally {
      changing = false
    }
  }
  const off = ctx.on('slots/changed', (name: string) => {
    if (name === 'conversation.chat.node') reconcile()
  })
  try { reconcile() } catch (error) { off(); throw error }
  return () => { off(); dispose?.() }
}
