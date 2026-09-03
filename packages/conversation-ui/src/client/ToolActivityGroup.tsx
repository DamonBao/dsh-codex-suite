import { createPortal } from 'react-dom'
import {
  useCallback,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from 'react'
import {
  IconChevronDownOutline14,
  IconChevronRightOutline14,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useSearchableHidden } from './useSearchableHidden.ts'
import css from './TypewriterAssistantNodeView.module.css'

export type ToolActivityGroupPosition = 'start' | 'middle' | 'end'

export interface ToolActivityGroupInfo {
  readonly id: string
  readonly domId: string
  readonly semantic: string
  readonly label: string
  readonly count: number
  readonly position: ToolActivityGroupPosition
  readonly hasGrowing: boolean
}

interface ToolActivityGroupState {
  collapsed: boolean
  readonly listeners: Set<() => void>
}

interface ToolActivityMount {
  target: HTMLElement | null
  readonly listeners: Set<() => void>
}

const groupStates = new Map<string, ToolActivityGroupState>()
const groupMounts = new Map<string, ToolActivityMount>()

function groupState(id: string): ToolActivityGroupState {
  const current = groupStates.get(id)
  if (current !== undefined) return current
  const created: ToolActivityGroupState = { collapsed: false, listeners: new Set() }
  groupStates.set(id, created)
  return created
}

function groupMount(id: string): ToolActivityMount {
  const current = groupMounts.get(id)
  if (current !== undefined) return current
  const created: ToolActivityMount = { target: null, listeners: new Set() }
  groupMounts.set(id, created)
  return created
}

function notify(listeners: Set<() => void>): void {
  for (const listener of listeners) listener()
}

function subscribeGroup(id: string, listener: () => void): () => void {
  const state = groupState(id)
  state.listeners.add(listener)
  return () => {
    state.listeners.delete(listener)
    if (state.listeners.size === 0) groupStates.delete(id)
  }
}

function subscribeMount(id: string, listener: () => void): () => void {
  const mount = groupMount(id)
  mount.listeners.add(listener)
  return () => {
    mount.listeners.delete(listener)
    if (mount.listeners.size === 0 && mount.target === null) groupMounts.delete(id)
  }
}

function setMount(id: string, target: HTMLElement | null): void {
  const mount = groupMount(id)
  if (mount.target === target) return
  mount.target = target
  notify(mount.listeners)
}

function hash(value: string): string {
  let result = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16_777_619)
  }
  return (result >>> 0).toString(36)
}

/** Stable identity for one contiguous semantic tool group in a Turn. */
export function toolActivityGroupId(
  sessionId: string,
  turn: number,
  semantic: string,
  firstNodeKey: string,
): string {
  return `dsh-tool-group-${hash(`${sessionId}\u0000${turn}\u0000${semantic}\u0000${firstNodeKey}`)}`
}

function useToolActivityFold(id: string): {
  collapsed: boolean
  toggle: () => void
  collapse: () => void
  expand: () => void
} {
  const subscribe = useCallback((listener: () => void) => subscribeGroup(id, listener), [id])
  const collapsed = useSyncExternalStore(
    subscribe,
    () => groupState(id).collapsed,
    () => false,
  )
  const toggle = useCallback(() => {
    const state = groupState(id)
    state.collapsed = !state.collapsed
    notify(state.listeners)
  }, [id])
  const collapse = useCallback(() => {
    const state = groupState(id)
    if (state.collapsed) return
    state.collapsed = true
    notify(state.listeners)
  }, [id])
  const expand = useCallback(() => {
    const state = groupState(id)
    if (!state.collapsed) return
    state.collapsed = false
    notify(state.listeners)
  }, [id])
  return { collapsed, toggle, collapse, expand }
}

function useToolActivityMount(id: string): HTMLElement | null {
  const subscribe = useCallback((listener: () => void) => subscribeMount(id, listener), [id])
  return useSyncExternalStore(
    subscribe,
    () => groupMount(id).target,
    () => null,
  )
}

function ToolActivityGroupFrame({
  group,
  collapsed,
  toggle,
  header,
  children,
}: {
  readonly group: ToolActivityGroupInfo
  readonly collapsed: boolean
  readonly toggle: () => void
  readonly header: ReactNode
  readonly children: ReactNode
}) {
  const register = useCallback((element: HTMLDivElement | null) => {
    setMount(group.id, element)
  }, [group.id])
  return (
    <div
      ref={register}
      id={group.domId}
      className={css.toolGroupFrame}
      data-stream-tool-group={group.semantic}
      data-stream-tool-group-frame=""
      data-stream-tool-group-position={group.position}
      data-stream-tool-group-count={group.count}
      data-stream-tool-group-collapsed={collapsed || undefined}
    >
      <button
        type="button"
        className={css.toolGroupHeader}
        aria-expanded={!collapsed}
        aria-controls={group.domId}
        data-stream-tool-group-toggle=""
        onClick={toggle}
      >
        {header}
        <span className={css.toolGroupHeaderChevron} aria-hidden>
          {collapsed ? <IconChevronRightOutline14 size={14} /> : <IconChevronDownOutline14 size={14} />}
        </span>
      </button>
      {children}
    </div>
  )
}

function SearchableActivityContent({ hidden, reveal, member = false, children }: {
  readonly hidden: boolean
  readonly reveal: () => void
  readonly member?: boolean | undefined
  readonly children: ReactNode
}) {
  const ref = useSearchableHidden(hidden, reveal)
  return (
    <div
      ref={ref}
      className={css.toolGroupContent}
      data-tool-group-member={member || undefined}
      data-tool-group-hidden={hidden || undefined}
    >
      {children}
    </div>
  )
}

interface ToolActivityGroupMemberProps {
  readonly group: ToolActivityGroupInfo
  readonly memberRef?: Ref<HTMLDivElement> | undefined
  readonly eventAttributes?: Readonly<Record<string, string | undefined>>
  readonly header: ReactNode
  readonly children: ReactNode
}

/**
 * Mount the first member as a group host and portal subsequent tool members
 * into the same host. DSH's outer Chat Node seat owns Turn visibility while a
 * contiguous run of commands keeps its own Codex-style disclosure block.
 */
export function ToolActivityGroupMember({
  group,
  memberRef,
  eventAttributes,
  header,
  children,
}: ToolActivityGroupMemberProps) {
  const activity = useToolActivityFold(group.id)
  const mount = useToolActivityMount(group.id)

  // Codex leaves a running tool group open while work is arriving, then folds
  // the completed batch automatically. A manual toggle after completion still
  // wins because this effect only reacts to the growing -> settled transition.
  useEffect(() => {
    if (group.position === 'start' && !group.hasGrowing) activity.collapse()
  }, [activity.collapse, group.hasGrowing, group.position])

  if (group.position === 'start') {
    return (
      <div className={css.toolGroupAnchor} data-stream-tool-group-anchor="">
        <ToolActivityGroupFrame
          group={group}
          collapsed={activity.collapsed}
          toggle={activity.toggle}
          header={header}
        >
          <SearchableActivityContent hidden={activity.collapsed} reveal={activity.expand}>
            <div
              {...eventAttributes}
              ref={memberRef}
              className={css.eventRow}
              data-stream-tool-group-member=""
              data-stream-tool-group-position="start"
              data-stream-tool-group-collapsed={activity.collapsed || undefined}
            >
              {children}
            </div>
          </SearchableActivityContent>
        </ToolActivityGroupFrame>
      </div>
    )
  }

  const member = (
    <SearchableActivityContent hidden={activity.collapsed} reveal={activity.expand} member>
      <div
        {...eventAttributes}
        ref={memberRef}
        className={css.eventRow}
        data-stream-tool-group-member=""
        data-stream-tool-group-position={group.position}
        data-stream-tool-group-collapsed={activity.collapsed || undefined}
      >
        {children}
      </div>
    </SearchableActivityContent>
  )

  if (mount === null) return member
  return (
    <span data-tool-group-proxy="" aria-hidden>
      {createPortal(member, mount)}
    </span>
  )
}

/** Render the group heading with the semantic icon supplied by the tool view. */
export function ToolActivityGroupHeader({
  label,
  icon,
}: {
  readonly label: string
  readonly icon: ReactNode
}) {
  return (
    <>
      <span className={css.toolGroupHeaderIcon} aria-hidden>{icon}</span>
      <span className={css.toolGroupHeaderLabel}>{label}</span>
    </>
  )
}
