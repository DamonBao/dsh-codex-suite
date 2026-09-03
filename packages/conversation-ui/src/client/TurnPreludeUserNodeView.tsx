import { createElement, useEffect, useState, type ComponentType } from 'react'
import type { FollowWrapProps } from './TypewriterToolNodeView.tsx'
import { formatTurnProcessed, type TurnElapsedTranslator } from './turnElapsed.ts'
import css from './TypewriterAssistantNodeView.module.css'

interface TimelineTurn {
  readonly turn: number
  readonly status: 'open' | 'closed' | 'unknown'
  readonly start?: { readonly time?: number } | undefined
}

function nodeKey(node: unknown): string | undefined {
  if (node === null || typeof node !== 'object' || !('key' in node)) return undefined
  return typeof (node as { key: unknown }).key === 'string' ? (node as { key: string }).key : undefined
}

function userTime(node: unknown): number | undefined {
  if (node === null || typeof node !== 'object' || !('data' in node)) return undefined
  const data = (node as { data: unknown }).data
  if (data === null || typeof data !== 'object' || !('time' in data)) return undefined
  return typeof (data as { time: unknown }).time === 'number' ? (data as { time: number }).time : undefined
}

function turnFromNode(node: unknown): TimelineTurn | undefined {
  if (node === null || typeof node !== 'object' || !('location' in node)) return undefined
  const location = (node as { location: unknown }).location
  if (location === null || typeof location !== 'object' || !('kind' in location)) return undefined
  const kind = (location as { kind: unknown }).kind
  if (kind !== 'turn' && kind !== 'step') return undefined
  const turn = (location as { turn?: unknown }).turn
  if (turn === null || typeof turn !== 'object' || !('turn' in turn) || !('status' in turn)) return undefined
  return turn as TimelineTurn
}

function useElapsedNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

function hasPublishedProcess(snapshot: unknown, userKey: string, turnNumber: number): boolean {
  if (snapshot === null || typeof snapshot !== 'object' || !('order' in snapshot) || !('nodes' in snapshot)) return false
  const order = (snapshot as { order: unknown }).order
  const nodes = (snapshot as { nodes: unknown }).nodes
  if (!Array.isArray(order) || nodes === null || typeof nodes !== 'object' || !('get' in nodes)) return false
  const get = (nodes as { get: unknown }).get
  if (typeof get !== 'function') return false
  const current = order.indexOf(userKey)
  if (current < 0) return false
  for (let index = current + 1; index < order.length; index += 1) {
    const key = order[index]
    if (typeof key !== 'string') continue
    const node = get.call(nodes, key)
    if (node === null || typeof node !== 'object') continue
    const kind = 'kind' in node ? (node as { kind: unknown }).kind : undefined
    if (kind === 'turn-process' || kind === 'turn-tail') continue
    const locationTurn = turnFromNode(node)
    if (locationTurn?.turn === turnNumber) return true
  }
  return false
}

function TurnPrelude({ startTime, waiting, t }: {
  readonly startTime: number
  readonly waiting: boolean
  readonly t: TurnElapsedTranslator
}) {
  const now = useElapsedNow(true)
  return (
    <div className={css.turnPrelude} data-turn-prelude="">
      <div className={css.turnFoldRow} data-turn-fold-row="" data-turn-fold-state="running">
        <span className={css.turnFoldLabel} aria-live="off">{formatTurnProcessed(now - startTime, t)}</span>
      </div>
      {waiting && (
        <div className={css.turnWaiting} data-turn-waiting="" role="status" aria-live="polite">
          思考中
        </div>
      )}
    </div>
  )
}

function ChatAwareTurnPrelude({
  useChat,
  userKey,
  turnNumber,
  startTime,
  t,
}: {
  readonly useChat: (selector: (snapshot: unknown) => unknown) => unknown
  readonly userKey: string
  readonly turnNumber: number
  readonly startTime: number
  readonly t: TurnElapsedTranslator
}) {
  const waiting = useChat(snapshot => !hasPublishedProcess(snapshot, userKey, turnNumber)) as boolean
  return <TurnPrelude startTime={startTime} waiting={waiting} t={t} />
}

/**
 * Add a running-only status boundary after the opening user row. Completed
 * Turn disclosure is owned exclusively by DSH's native `turnProcess` state;
 * this wrapper disappears as soon as the Turn closes.
 */
export function wrapTurnPreludeNodeView(Inner: ComponentType<FollowWrapProps>) {
  return function TurnPreludeUserNodeView(props: FollowWrapProps) {
    const turn = turnFromNode(props.node)
    const time = userTime(props.node)
    if (turn?.status !== 'open' || time === undefined || typeof props.t !== 'function') {
      return createElement(Inner, props)
    }
    const startTime = typeof turn.start?.time === 'number' ? turn.start.time : time
    const key = nodeKey(props.node)
    const t = props.t as TurnElapsedTranslator
    const useChat = props.useChat
    return (
      <>
        {createElement(Inner, props)}
        {key !== undefined && typeof useChat === 'function' ? (
          <ChatAwareTurnPrelude
            useChat={useChat as (selector: (snapshot: unknown) => unknown) => unknown}
            userKey={key}
            turnNumber={turn.turn}
            startTime={startTime}
            t={t}
          />
        ) : <TurnPrelude startTime={startTime} waiting t={t} />}
      </>
    )
  }
}
