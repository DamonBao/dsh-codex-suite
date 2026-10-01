import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BACKLOG_CHAR_CEILING, BACKLOG_SECOND_CEILING, PRESET_CONFIG,
  splitGraphemes, computeQueueReveal, computeSettleDrain, useConversationContent,
} from '../src/client/useConversationContent.ts'
import { DeliverablesCard, DeliverablesTail } from '../src/client/DeliverablesCard.tsx'
import { DELIVERABLES_DATA_KEY, deliverablesDefinition, selectDeliverables } from '../src/client/deliverables.ts'
import { DEFAULT_CONVERSATION_CONFIG } from '../src/config.ts'
import { Config } from '../src/plugin.ts'
import { zh } from '../src/client/locales.ts'

const t = (key: string, args?: Record<string, unknown>) =>
  Object.entries(args ?? {}).reduce((copy, [name, value]) => copy.replaceAll(`{${name}}`, String(value)), zh[key as keyof typeof zh] ?? key)
const FAKE = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] as const

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

function SmoothProbe({ text, ...options }: { text: string } & NonNullable<Parameters<typeof useConversationContent>[1]>) {
  return <div>{useConversationContent(text, options)}</div>
}

describe('useConversationContent', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: [...FAKE] }))

  it('reveals an appended stream progressively instead of dumping it', async () => {
    const view = render(<SmoothProbe text="" />)
    view.rerender(<SmoothProbe text={'x'.repeat(40)} />)

    expect(view.container.textContent).toBe('')
    await act(() => vi.advanceTimersByTimeAsync(120))
    const partial = view.container.textContent?.length ?? 0
    expect(partial).toBeGreaterThan(0)
    expect(partial).toBeLessThan(40)

    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(view.container.textContent).toBe('x'.repeat(40))
  })

  it('reveals at the steady rate while input streams and drains at 1.8x after', async () => {
    const view = render(<SmoothProbe text="" steadyCps={25} />)
    view.rerender(<SmoothProbe text={'x'.repeat(100)} steadyCps={25} />)
    // ~48ms minimum commit interval: a few commits land, far below the input.
    await act(() => vi.advanceTimersByTimeAsync(200))
    const partial = view.container.textContent?.length ?? 0
    expect(partial).toBeGreaterThan(0)
    expect(partial).toBeLessThan(40)
    // After the (fake) stream goes idle and settling kicks in, the 1.8x
    // drain clears the remaining backlog quickly but not instantly.
    await act(() => vi.advanceTimersByTimeAsync(2500))
    expect(view.container.textContent).toBe('x'.repeat(100))
  })

  it('keeps up with a fast chunked arrival instead of trailing at the old 72cps cap', async () => {
    const view = render(<SmoothProbe text="" />)
    view.rerender(<SmoothProbe text={'x'.repeat(20)} />)
    await act(() => vi.advanceTimersByTimeAsync(40))
    view.rerender(<SmoothProbe text={'x'.repeat(40)} />)
    await act(() => vi.advanceTimersByTimeAsync(40))
    view.rerender(<SmoothProbe text={'x'.repeat(60)} />)
    await act(() => vi.advanceTimersByTimeAsync(40))
    view.rerender(<SmoothProbe text={'x'.repeat(80)} />)
    await act(() => vi.advanceTimersByTimeAsync(80))
    const partial = view.container.textContent?.length ?? 0
    // 80 chars over ~200ms is 400 cps arrival. The old maxCps=72 cap would
    // have revealed ~15 chars; keep-up must be well past that.
    expect(partial).toBeGreaterThan(40)
    expect(partial).toBeLessThanOrEqual(80)
  })

  it('queues a large append instead of dumping it', async () => {
    const view = render(<SmoothProbe text="" />)
    view.rerender(<SmoothProbe text={'x'.repeat(240)} />)
    await act(() => vi.advanceTimersByTimeAsync(120))
    const partial = view.container.textContent?.length ?? 0
    expect(partial).toBeGreaterThan(0)
    expect(partial).toBeLessThan(240)
    await act(() => vi.advanceTimersByTimeAsync(8000))
    expect(view.container.textContent).toBe('x'.repeat(240))
  })

  it('holds back the DOM commit while the guard vetoes and flushes after', async () => {
    let hold = true
    const view = render(<SmoothProbe text="" shouldHoldBack={() => hold} />)
    view.rerender(<SmoothProbe text="hello world" shouldHoldBack={() => hold} />)

    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(view.container.textContent).toBe('')

    hold = false
    view.rerender(<SmoothProbe text="hello world" shouldHoldBack={() => hold} />)
    await act(() => vi.advanceTimersByTimeAsync(1200))
    expect(view.container.textContent).toBe('hello world')
  })

  it('reveals whole grapheme clusters instead of splitting an emoji sequence', () => {
    expect(splitGraphemes('A👩‍💻B')).toEqual(['A', '👩‍💻', 'B'])
  })
})

describe('Codex-style deliverables', () => {
  it('aggregates a successful diff call into immutable turn data', () => {
    const start = deliverablesDefinition.start(
      {} as never,
      { event: { type: 'turn/start', data: { turn: 1 } } } as never,
      {} as never,
    )
    const called = deliverablesDefinition.update(
      { state: start } as never,
      {
        event: {
          type: 'tool/call',
          data: { turn: 1, step: 1, callId: 'edit-1', name: 'edit', arguments: '{}' },
        },
      } as never,
    )
    const updated = deliverablesDefinition.update(
      { state: called } as never,
      {
        event: {
          type: 'tool/result',
          seq: 3,
          surfaceOp: 'append',
          data: {
            turn: 1,
            step: 1,
            message: {
              source: { type: 'tool-result', callId: 'edit-1' },
              content: [{ type: 'tool-result', content: [], isError: false }],
            },
            meta: { diffs: [{ path: 'src/App.tsx', oldText: 'old', newText: 'new\nnext' }] },
          },
        },
      } as never,
    )
    const websiteCalled = deliverablesDefinition.update(
      { state: updated } as never,
      {
        event: {
          type: 'tool/call',
          data: { turn: 1, step: 1, callId: 'deploy-1', name: 'deploy_site', arguments: '{}' },
        },
      } as never,
    )
    const websiteUpdated = deliverablesDefinition.update(
      { state: websiteCalled } as never,
      {
        event: {
          type: 'tool/result',
          seq: 4,
          surfaceOp: 'append',
          data: {
            turn: 1,
            step: 1,
            message: {
              source: { type: 'tool-result', callId: 'deploy-1' },
              content: [{ type: 'text', text: 'Preview: https://preview.example.test' }],
            },
          },
        },
      } as never,
    )
    expect(websiteUpdated.entries).toEqual([
      { path: 'src/App.tsx', seq: 3, added: 2, removed: 1, kind: 'file' },
      { path: 'https://preview.example.test', seq: 4, added: 0, removed: 0, kind: 'website' },
    ])
    expect(DELIVERABLES_DATA_KEY).toBe('dsh-conversation-ui-deliverables')
  })

  it('falls back to the native produced-file data when available', () => {
    const owner = {
      seq: 5,
      turn: {
        data: {
          get: (key: string) => key === 'deliverables'
            ? { produced: [{ seq: 2, path: 'test-file-1.txt' }, { seq: 3, path: 'test-file-2.txt' }] }
            : undefined,
        },
      },
    }
    expect(selectDeliverables(owner as never)).toEqual([
      { seq: 2, path: 'test-file-1.txt', added: 0, removed: 0, kind: 'file' },
      { seq: 3, path: 'test-file-2.txt', added: 0, removed: 0, kind: 'file' },
    ])
  })

  it('renders list-slot owner props without a chain matched prop and hides empty Turns', () => {
    const openFile = vi.fn()
    const owner = {
      turn: { turn: 1, data: { get: () => undefined } },
      seq: 3,
      openFile,
    } as unknown as TurnTailOwnerProps
    const view = render(<DeliverablesTail t={t} {...owner} />)
    expect(view.container.childElementCount).toBe(0)

    const entries = [
      { path: 'visible.txt', seq: 2, added: 1, removed: 0, kind: 'file' },
      { path: 'later.txt', seq: 4, added: 1, removed: 0, kind: 'file' },
    ]
    const withFiles = {
      ...owner,
      turn: { turn: 1, data: { get: (key: string) => key === DELIVERABLES_DATA_KEY ? { entries } : undefined } },
    } as unknown as TurnTailOwnerProps
    view.rerender(<DeliverablesTail t={t} {...withFiles} />)
    expect(view.queryByTitle('later.txt')).toBeNull()
    fireEvent.click(view.getByTitle('visible.txt'))
    expect(openFile).toHaveBeenCalledWith('visible.txt')
    view.rerender(<DeliverablesTail t={t} {...owner} />)
    expect(view.container.childElementCount).toBe(0)
  })

  it('renders expandable file rows and opens website deliverables externally', () => {
    const openFile = vi.fn()
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const view = render(
      <DeliverablesCard
        t={t}
        matched={[
          { path: '/workspace/src/App.tsx', seq: 1, added: 2, removed: 1, kind: 'file' },
          { path: '/workspace/src/App.css', seq: 1, added: 4, removed: 0, kind: 'file' },
          { path: '/workspace/README.md', seq: 1, added: 1, removed: 0, kind: 'file' },
          { path: '/workspace/index.html', seq: 1, added: 8, removed: 2, kind: 'file' },
          { path: 'https://preview.example.test', seq: 1, added: 0, removed: 0, kind: 'website' },
        ]}
        turn={{ data: { get: () => undefined } } as never}
        seq={2}
        openFile={openFile}
      />,
    )
    expect(view.getByText('已交付 5 项产物')).toBeTruthy()
    expect(view.getByText('+2')).toBeTruthy()
    expect(view.getByText('-1')).toBeTruthy()
    expect(view.getByRole('button', { name: /再显示 2 个产物/ })).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: /再显示 2 个产物/ }))
    fireEvent.click(view.getByTitle('/workspace/src/App.tsx'))
    expect(openFile).toHaveBeenCalledWith('/workspace/src/App.tsx')
    fireEvent.click(view.getByTitle('https://preview.example.test'))
    expect(open).toHaveBeenCalledWith('https://preview.example.test', '_blank', 'noopener,noreferrer')
  })
})

describe('plugin Config schema', () => {
  it('fills defaults when the overlay config is omitted', () => {
    const resolved = Config({} as never)
    expect(resolved).toMatchObject(DEFAULT_CONVERSATION_CONFIG)
    expect(resolved.thinkAutoExpand.get()).toBe(true)
  })

  it('accepts a full override and rejects invalid values', () => {
    const resolved = Config({
      mode: 'teleprompter',
      preset: 'realtime',
      revealCharsPerSec: 60,
      scrollSpeedPxPerSec: 100,
      maxScrollSpeedPxPerSec: 400,
    })
    expect(resolved).toMatchObject({
      mode: 'teleprompter',
      preset: 'realtime',
      revealCharsPerSec: 60,
      scrollSpeedPxPerSec: 100,
      maxScrollSpeedPxPerSec: 400,
    })
    expect(() => Config({ mode: 'diagonal' } as never)).toThrow()
    expect(() => Config({ scrollSpeedPxPerSec: 0 } as never)).toThrow()
    expect(() => Config({ maxScrollSpeedPxPerSec: 9000 } as never)).toThrow()
    expect(() => Config({ revealCharsPerSec: 0 } as never)).toThrow()
  })
})

describe('computeQueueReveal', () => {
  it('types one glyph per frame when the queue is small', () => {
    expect(computeQueueReveal(3, 16.67)).toBe(1)
  })

  it('raises the step when the queue is backlogged', () => {
    expect(computeQueueReveal(40, 16.67)).toBe(5)
    expect(computeQueueReveal(80, 16.67)).toBe(10)
  })

  it('never exceeds the backlog', () => {
    expect(computeQueueReveal(2, 1000)).toBe(2)
    expect(computeQueueReveal(0, 16)).toBe(0)
  })
})

describe('computeSettleDrain', () => {
  it('drains ordinary backlog within the settle window', () => {
    const config = PRESET_CONFIG.balanced
    const ordinary = computeSettleDrain(config, { backlog: 200, inputActive: false, settling: true })
    expect(ordinary).toBeGreaterThanOrEqual(config.flushCps)
    expect(ordinary).toBeLessThanOrEqual(config.maxFlushCps)
  })

  it('climbs past the settle window to close a backlog beyond the lag ceiling', () => {
    const config = PRESET_CONFIG.balanced
    const lagged = computeSettleDrain(config, { backlog: 2000, inputActive: false, settling: true })
    const ordinary = computeSettleDrain(config, { backlog: 50, inputActive: false, settling: true })
    expect(lagged).toBeGreaterThan(ordinary)
    expect(lagged).toBe(config.maxFlushCps)
    // Ceiling drain alone closes a 2000-char backlog within two seconds:
    // the whole reply drains at maxFlushCps while the overflow pays for itself.
    expect((2000 - BACKLOG_CHAR_CEILING) * 1000 / BACKLOG_SECOND_CEILING).toBeGreaterThan(config.maxFlushCps)
  })

  it('stays in the settle band while input is still active or not yet settling', () => {
    const config = PRESET_CONFIG.balanced
    expect(computeSettleDrain(config, { backlog: 5000, inputActive: true, settling: false })).toBe(0)
    expect(computeSettleDrain(config, { backlog: 5000, inputActive: false, settling: false })).toBe(0)
  })
})
