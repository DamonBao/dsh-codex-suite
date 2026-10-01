import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ChatNodeViewProps, ChatPresentationPolicy } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import { createElement, memo, useSyncExternalStore, type FunctionComponent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyNativeChat } from './support/ui-chat-client.ts'
import { apply, inject } from '../src/client/index.ts'
import { CONVERSATION_BOOT_GLOBAL, DEFAULT_CONVERSATION_CONFIG } from '../src/config.ts'
import { enhanceNativeAssistant } from '../src/client/NativeAssistantEnhancement.tsx'

type AssistantProps = ChatNodeViewProps<'assistant-step'>
const NATIVE_INJECT = ['slots', 'locale', 'uiConversation', 'uiSession', 'configForms']
const contexts: Context[] = []
afterEach(async () => {
  cleanup()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function bench(pluginFirst = false) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const settings = createSnapshotStore({ value: { transcriptView: 'standard' } })
  ctx.provide('configForms', { get: () => ({ ...settings, set: () => Promise.resolve() }) } as never)
  const definition = vi.fn(() => () => {})
  ctx.provide('uiConversation', {
    events: { register: definition, registerFallback: definition },
    views: { register: definition }, groups: { register: definition },
  } as never)
  ctx.provide('uiSession', { provide: () => () => {} } as never)
  ctx.slots.register({
    name: 'root', children: {
      'conversation.view': { kind: 'list', scope: 'session' },
      'settings.general.item': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  const overlay = pluginFirst ? ctx.plugin({ inject: [...inject], apply }) : undefined
  if (overlay !== undefined) await overlay.await()
  const native = ctx.plugin({ inject: NATIVE_INJECT, apply: applyNativeChat })
  await native.await()
  const plugin = overlay ?? ctx.plugin({ inject: [...inject], apply })
  await plugin.await()
  return { ctx, locale, settings, native, plugin, definition }
}

function entry(ctx: Context, native = false): StoredEntry {
  const value = ctx.slots.entries('conversation.chat.node').find(item =>
    item.options.key === 'assistant-step' && (!native || item.registrant !== 'dsh-conversation-ui:assistant-enhancement'))
  if (value === undefined) throw new Error('assistant renderer is missing')
  return value
}

function props(ctx: Context, text: string, options: {
  status?: 'running' | 'settled' | 'interrupted'; reasoning?: string; groupPart?: string;
  reset?: ReturnType<typeof createSnapshotStore<number>>; sessionId?: string;
} = {}): AssistantProps {
  const native = entry(ctx)
  const injected = native.inject?.('session-1' as never) as {
    hooks: { presentation: ReturnType<typeof createSnapshotStore<ChatPresentationPolicy>> }
  }
  const policy = injected.hooks.presentation
  const reset = options.reset ?? createSnapshotStore(0)
  const hookContext = { disclosureReset: reset }
  const spec = ctx.slots.spec('conversation.chat.node')
  const useDisclosure = spec!.inject!.hooks.disclosure({} as never, hookContext as never)
  return {
    node: {
      key: 'assistant-1', id: 'assistant-1', target: 'chat', visibility: 'visible', kind: 'assistant-step', anchorSeq: 3,
      location: { kind: 'session' },
      data: { status: options.status ?? 'running', step: 1, turn: 1, time: 0,
        blocks: [
          ...options.reasoning === undefined ? [] : [{ kind: 'reasoning', text: options.reasoning }],
          { kind: 'text', text },
        ],
      },
    },
    sessionId: options.sessionId ?? 'session-1',
    ...(options.groupPart === undefined ? {} : { groupPart: options.groupPart }),
    useDisclosure,
    useTurnData: () => undefined,
    usePresentation: (select: (value: ChatPresentationPolicy) => unknown) => select(useSyncExternalStore(policy.subscribe, policy.getSnapshot)),
    renderMessageImages: () => null,
    fileMentions: () => undefined,
    openFile: vi.fn(),
    openSkill: vi.fn(), inspectCall: undefined, forkAt: vi.fn(),
    loadImage: Object.assign(async () => '', { peek: () => undefined }),
    t: ctx.locale.bind('chat'),
  } as never
}

function renderAssistant(ctx: Context, owner: AssistantProps) {
  const Renderer = entry(ctx).component as FunctionComponent<AssistantProps>
  return { Renderer, ...render(<Renderer {...owner} />) }
}

describe('native Chat integration', () => {
  it.each([false, true])('keeps all native components and child seats intact (plugin first: %s)', async (first) => {
    const { ctx, plugin } = await bench(first)
    const original = entry(ctx, true)
    const nativeRows = ctx.slots.entries('conversation.chat.node').filter(item => item !== entry(ctx))
    const nativeComponents = nativeRows.map(item => item.component)
    const view = ctx.slots.entries('conversation.view')[0]
    const NativeView = view?.component
    expect(nativeRows.filter(item => item.options.key === 'turn-process')).toHaveLength(1)
    expect(ctx.slots.entries('conversation.chat.turnTail')).toHaveLength(1)
    expect(ctx.slots.spec('conversation.chat.commandview')).toBeDefined()
    expect(ctx.slots.spec('conversation.chat.assistant-actions')).toBeDefined()
    expect(original.inject).toBeDefined()
    const nativeFace = original.inject!('session-1' as never)
    expect(entry(ctx).inject!('session-1' as never)).toEqual(nativeFace)
    await plugin.dispose()
    expect(ctx.slots.entries('conversation.view')[0]?.component).toBe(NativeView)
    expect(ctx.slots.entries('conversation.chat.node').map(item => item.component)).toEqual(nativeComponents)
    expect(entry(ctx)).toBe(original)
    expect(ctx.slots.entries('conversation.chat.turnTail')).toHaveLength(0)
  })

  it('retains native work-details previews and independent disclosure resets', async () => {
    const { ctx, settings } = await bench()
    const reset = createSnapshotStore(0)
    const view = renderAssistant(ctx, props(ctx, 'Answer', { status: 'settled', reasoning: 'Reasoning preview\n\nDetails', reset }))
    const row = view.container.querySelector('[data-variant="think"]')!
    expect(row.getAttribute('data-preview')).toBe('true')
    expect(row.getAttribute('data-expanded')).toBeNull()
    await act(async () => { settings.set({ value: { transcriptView: 'compact' } }) })
    expect(row.getAttribute('data-preview')).toBeNull()
    fireEvent.click(view.getByText(ctx.locale.bind('chat')('message.think')))
    expect(row.getAttribute('data-expanded')).toBe('true')
    await act(async () => { reset.set(1) })
    expect(row.getAttribute('data-expanded')).toBeNull()
  })

  it('opens streaming thinking once and keeps a manual collapse closed', async () => {
    const { ctx } = await bench()
    const owner = props(ctx, 'Answer', { reasoning: 'Thinking' })
    const view = renderAssistant(ctx, owner)
    const row = view.container.querySelector('[data-variant="think"]')!
    expect(row.getAttribute('data-expanded')).toBe('true')
    fireEvent.click(view.getByText(ctx.locale.bind('chat')('message.think')))
    expect(row.getAttribute('data-expanded')).toBeNull()
    view.rerender(<view.Renderer {...owner} node={{ ...owner.node, data: { ...owner.node.data, blocks: [{ kind: 'reasoning', text: 'Thinking more' }] } }} />)
    expect(row.getAttribute('data-expanded')).toBeNull()
  })

  it('delegates images, Markdown, unknown blocks and interrupted markers to published DSH', async () => {
    const { ctx } = await bench()
    const owner = props(ctx, '![image](/tmp/native-demo.png)', { status: 'interrupted' })
    const renderImages = vi.fn(() => <span>Native image gallery</span>)
    const attachment = { kind: 'image' }
    const view = renderAssistant(ctx, { ...owner, renderMessageImages: renderImages,
      node: { ...owner.node, data: { ...owner.node.data, blocks: [
        ...owner.node.data.blocks,
        { kind: 'image', attachment } as never,
        { kind: 'other', block: { type: 'custom', value: 42 } } as never,
      ] } },
    })
    expect(view.getByAltText('image').getAttribute('src')).toContain('/api/file?path=')
    expect(renderImages).toHaveBeenCalledWith({ images: [{ attachment }], align: 'start' })
    expect(view.getByText('Native image gallery')).toBeTruthy()
    fireEvent.click(view.getByText(ctx.locale.bind('chat')('message.unknownBlock'), { exact: false }))
    expect(view.container.textContent).toContain('42')
    expect(view.container.textContent).toMatch(/Stopped|已停止/)
  })

  it('reveals live text without losing final output or replaying history on session switch', async () => {
    vi.stubGlobal(CONVERSATION_BOOT_GLOBAL, { ...DEFAULT_CONVERSATION_CONFIG, mode: 'typewriter', revealCharsPerSec: 20 })
    const { ctx } = await bench()
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] })
    const owner = props(ctx, '')
    const view = renderAssistant(ctx, owner)
    const appended = { ...owner, node: { ...owner.node, data: { ...owner.node.data, blocks: [{ kind: 'text' as const, text: 'A👩‍💻'.repeat(20) }] } } }
    view.rerender(<view.Renderer {...appended} />)
    await act(() => vi.advanceTimersByTimeAsync(120))
    const partial = view.container.textContent!
    expect(partial.length).toBeGreaterThan(0)
    expect(partial.length).toBeLessThan(120)
    view.rerender(<view.Renderer {...appended} node={{ ...appended.node, data: { ...appended.node.data, status: 'settled' } }} />)
    expect(view.container.textContent).toBe('A👩‍💻'.repeat(20))
    view.rerender(<view.Renderer {...props(ctx, 'Historical answer', { status: 'settled', sessionId: 'session-2' })} />)
    expect(view.container.textContent).toBe('Historical answer')
  })

  it('renders reasoning and response group parts exactly once', async () => {
    const { ctx } = await bench()
    const Renderer = entry(ctx).component as FunctionComponent<AssistantProps>
    const owner = props(ctx, 'Final answer', { status: 'settled', reasoning: 'Native reasoning' })
    const view = render(<><Renderer {...owner} groupPart="reasoning" /><Renderer {...owner} groupPart="response" /></>)
    expect(view.getAllByText('Final answer')).toHaveLength(1)
    expect(view.getAllByText('Native reasoning')).toHaveLength(1)
  })

  it('applies live preferences through the native disclosure without remounting it', async () => {
    const { ctx } = await bench()
    const preference = createSnapshotStore(false)
    const Native = entry(ctx, true).component as FunctionComponent<AssistantProps>
    const Renderer = enhanceNativeAssistant(Native as never, DEFAULT_CONVERSATION_CONFIG, preference)
    const owner = props(ctx, 'Response', { reasoning: 'Live thinking' })
    const view = render(<Renderer {...owner} />)
    const row = view.container.querySelector('[data-variant="think"]')!
    expect(row.getAttribute('data-expanded')).toBeNull()
    await act(async () => { preference.set(true) })
    expect(row.getAttribute('data-expanded')).toBe('true')
    await act(async () => { preference.set(false) })
    expect(row.getAttribute('data-expanded')).toBeNull()
    expect(view.container.querySelector('[data-variant="think"]')).toBe(row)
  })

  it('bypasses the reveal queue when reduced motion is enabled during a stream', async () => {
    const listeners = new Set<() => void>()
    let reduced = false
    vi.stubGlobal('matchMedia', () => ({
      get matches() { return reduced },
      addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    }))
    vi.stubGlobal(CONVERSATION_BOOT_GLOBAL, { ...DEFAULT_CONVERSATION_CONFIG, mode: 'typewriter' })
    const { ctx } = await bench()
    const owner = props(ctx, '')
    const view = renderAssistant(ctx, owner)
    const updated = { ...owner, node: { ...owner.node, data: { ...owner.node.data, blocks: [{ kind: 'text' as const, text: 'Visible immediately' }] } } }
    view.rerender(<view.Renderer {...updated} />)
    expect(view.container.textContent).toBe('')
    await act(async () => { reduced = true; for (const listener of listeners) listener() })
    expect(view.container.textContent).toBe('Visible immediately')
    view.unmount()
    expect(listeners.size).toBe(0)
  })

  it('leaves a replacement assistant with child slots untouched', async () => {
    const { ctx } = await bench()
    const Custom = () => null
    const unregister = ctx.slots.register({
      name: 'conversation.chat.node', key: 'assistant-step', priority: -10,
      children: { 'custom.assistant.actions': { kind: 'single', scope: 'session' } },
    } as never, Custom)
    expect(entry(ctx).component).toBe(Custom)
    expect(ctx.slots.entries('conversation.chat.node').filter(item => item.registrant === 'dsh-conversation-ui:assistant-enhancement')).toHaveLength(0)
    unregister()
    expect(entry(ctx).registrant).toBe('dsh-conversation-ui:assistant-enhancement')
  })

  it('does not alter a tool registered after activation or its nested child slot', async () => {
    const { ctx } = await bench()
    const Tool = memo(() => <div data-tool="custom">Native custom tool</div>)
    ctx.slots.register({ name: 'conversation.chat.node', key: 'custom-tool', children: {
      'custom.tool.details': { kind: 'single', scope: 'session' },
    } } as never, Tool)
    expect(ctx.slots.entries('conversation.chat.node').find(item => item.options.key === 'custom-tool')?.component).toBe(Tool)
    const view = render(createElement(Tool))
    expect(view.getByText('Native custom tool').parentElement).toBe(view.container)
  })

  it('removes the delegate when the original unloads, and reattaches on reload', async () => {
    const { ctx, native } = await bench()
    await native.dispose()
    expect(ctx.slots.entries('conversation.chat.node')).toHaveLength(0)
    const reload = ctx.plugin({ inject: NATIVE_INJECT, apply: applyNativeChat })
    await reload.await()
    expect(entry(ctx).registrant).toBe('dsh-conversation-ui:assistant-enhancement')
    expect(entry(ctx, true).locale).toBe('chat')
  })
})
