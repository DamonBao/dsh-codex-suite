import { diffLines as diffTextLines } from 'diff'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-session/surface'
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'

export const DELIVERABLES_DATA_KEY = 'dsh-conversation-ui-deliverables' as const

export interface DeliverableEntry {
  readonly path: string
  readonly seq: number
  readonly added: number
  readonly removed: number
  readonly kind: 'file' | 'website'
}

export interface ConversationDeliverablesData {
  readonly entries: readonly DeliverableEntry[]
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap {
    'dsh-conversation-ui-deliverables': ConversationDeliverablesData
  }
}

interface CallRecord {
  readonly name: string
  readonly argsRaw: string | undefined
}

interface DeliverablesState extends ConversationDeliverablesData {
  readonly turn: number
  readonly calls: ReadonlyMap<string, CallRecord>
}

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === 'object' ? value as UnknownRecord : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** Preserve file contents verbatim; only reject empty/non-string values. */
function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function lineCount(value: unknown): number {
  const text = textValue(value)
  if (text === undefined) return 0
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body === '' ? 0 : body.split(/\r?\n/).length
}

/**
 * Real added/removed line counts for one edited file. Metadata `diffs` carry
 * the replaced snippet, so counting the whole `oldText`/`newText` as changed
 * over-reports a one-line edit in a large block. Fall back to raw line counts
 * only when the diff engine cannot process the values.
 */
function fileStat(oldValue: unknown, newValue: unknown): { added: number; removed: number } {
  const oldText = textValue(oldValue)
  const newText = textValue(newValue)
  if (oldText === undefined && newText === undefined) return { added: 0, removed: 0 }
  if (oldText === undefined) return { added: lineCount(newText), removed: 0 }
  if (newText === undefined) return { added: 0, removed: lineCount(oldText) }
  try {
    let added = 0
    let removed = 0
    for (const change of diffTextLines(oldText, newText)) {
      const count = change.count ?? 0
      if (change.added) added += count
      else if (change.removed) removed += count
    }
    return { added, removed }
  } catch {
    return { added: lineCount(newText), removed: lineCount(oldText) }
  }
}

/** Normalize separators, a leading `./`, and macOS's `/private` aliases. */
function normalizePath(path: string): string {
  let normalized = path.replaceAll('\\', '/')
  if (normalized.startsWith('./')) normalized = normalized.slice(2)
  for (const root of ['/private/tmp', '/private/var', '/private/etc']) {
    if (normalized === root) return root.slice('/private'.length)
    if (normalized.startsWith(`${root}/`)) return normalized.slice('/private'.length)
  }
  return normalized
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:\//.test(path)
}

/** Whether two spellings name the same file (relative vs absolute target). */
export function samePath(left: string, right: string): boolean {
  const a = normalizePath(left)
  const b = normalizePath(right)
  if (a === b) return true
  return a.endsWith(`/${b}`) || b.endsWith(`/${a}`)
}

/** Prefer the workspace-relative spelling for display and native file open. */
function preferredPath(left: string, right: string): string {
  const a = normalizePath(left)
  const b = normalizePath(right)
  if (isAbsolutePath(a) !== isAbsolutePath(b)) return isAbsolutePath(a) ? b : a
  return a.length <= b.length ? a : b
}

function jsonArgs(argsRaw: string | undefined): UnknownRecord {
  if (argsRaw === undefined) return {}
  try {
    const parsed: unknown = JSON.parse(argsRaw)
    return record(parsed) ?? {}
  } catch {
    return {}
  }
}

/**
 * Entries carried by a tool result's opaque `meta` payload. First-party file
 * tools publish applied diffs there (`{ diffs: [{ path, oldText, newText }] }`),
 * the same payload the native diff-card derivation reads.
 */
function metaEntries(meta: unknown): readonly Omit<DeliverableEntry, 'seq'>[] {
  const object = record(meta)
  if (object === undefined) return []
  const diffs = Array.isArray(object.diffs) ? object.diffs : []
  if (diffs.length === 0) return []
  return diffs.flatMap(diff => {
    const item = record(diff)
    const path = stringValue(item?.path)
    if (path === undefined) return []
    return [{
      path,
      ...fileStat(item?.oldText, item?.newText),
      kind: 'file' as const,
    }]
  })
}

function mutationPath(name: string, argsRaw: string | undefined): string | undefined {
  const args = jsonArgs(argsRaw)
  const path = stringValue(args.file_path) ?? stringValue(args.path) ?? stringValue(args.filename)
  if (path === undefined || /^https?:\/\//i.test(path)) return undefined
  const tokens = name.toLowerCase().split(/[^a-z\d]+/).filter(Boolean)
  return tokens.some(token => ['edit', 'write', 'patch', 'replace', 'create', 'insert', 'append'].includes(token))
    ? path
    : undefined
}

function websiteTool(name: string): boolean {
  const tokens = name.toLowerCase().split(/[^a-z\d]+/).filter(Boolean)
  return tokens.some(token => ['deploy', 'publish', 'preview', 'website', 'site', 'artifact'].includes(token))
}

/** Read tool-result text only; metadata/args URLs are not deliverables. */
function resultText(value: unknown): string {
  if (typeof value === 'string') return value
  const message = record(value)
  const content = Array.isArray(message?.content) ? message.content : []
  const parts: string[] = []
  for (const item of content) {
    const text = textValue(record(item)?.text)
    if (text !== undefined) parts.push(text)
  }
  return parts.join('\n')
}

function resultWebsiteEntries(name: string, value: unknown): readonly Omit<DeliverableEntry, 'seq'>[] {
  if (!websiteTool(name)) return []
  const text = resultText(value)
  if (text === '') return []
  const urls = text.match(/https?:\/\/[^\s"'<>\\]+/gi) ?? []
  return [...new Set(urls.map(url => url.replace(/[),.;]+$/g, '')))].map(path => ({
    path,
    added: 0,
    removed: 0,
    kind: 'website' as const,
  }))
}

function websiteUrl(name: string, argsRaw: string | undefined): string | undefined {
  const args = jsonArgs(argsRaw)
  const candidate = stringValue(args.url)
    ?? stringValue(args.href)
    ?? stringValue(args.preview_url)
    ?? stringValue(args.website_url)
  if (candidate === undefined || !/^https?:\/\//i.test(candidate)) return undefined
  const tokens = name.toLowerCase().split(/[^a-z\d]+/).filter(Boolean)
  return tokens.some(token => ['deploy', 'publish', 'preview', 'website', 'site', 'artifact'].includes(token))
    ? candidate
    : undefined
}

function appendEntries(
  current: readonly DeliverableEntry[],
  next: readonly Omit<DeliverableEntry, 'seq'>[],
  seq: number,
): readonly DeliverableEntry[] {
  const entries = [...current]
  for (const candidate of next) {
    const existing = entries.findIndex(entry => entry.kind === candidate.kind
      && (candidate.kind === 'website' ? entry.path === candidate.path : samePath(entry.path, candidate.path)))
    if (existing === -1) {
      entries.push({ ...candidate, seq })
      continue
    }
    const previous = entries[existing]
    if (previous === undefined) continue
    entries[existing] = {
      ...previous,
      ...(candidate.kind === 'file' ? { path: preferredPath(previous.path, candidate.path) } : {}),
      seq: Math.max(previous.seq, seq),
      added: previous.added + candidate.added,
      removed: previous.removed + candidate.removed,
    }
  }
  return entries
}

function entriesForCall(call: CallRecord): readonly Omit<DeliverableEntry, 'seq'>[] {
  const path = mutationPath(call.name, call.argsRaw)
  if (path !== undefined) {
    const args = jsonArgs(call.argsRaw)
    return [{
      path,
      ...fileStat(
        args.old_string ?? args.old_text ?? args.old_str,
        args.new_string ?? args.new_text ?? args.new_str ?? args.content ?? args.file_text,
      ),
      kind: 'file',
    }]
  }
  const url = websiteUrl(call.name, call.argsRaw)
  return url === undefined ? [] : [{ path: url, added: 0, removed: 0, kind: 'website' }]
}

/** Conversation data used by the Codex-style delivery card. */
export const deliverablesDefinition: ConversationNodeDefinition<DeliverablesState> = {
  kind: DELIVERABLES_DATA_KEY,
  match: (event) => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (event.type === 'tool/call') return { id: String(event.data.turn), role: 'update' }
    if (event.type === 'tool/result') {
      // Capture the turn while the event is still cleanly narrowed; the
      // surface guard below intersects the union and would widen `.data`.
      const turn = event.data.turn
      if (isAppendSurfaceEvent(event)) return { id: String(turn), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'turn/start') throw new Error('deliverables start requires turn/start')
    return { turn: match.event.data.turn, calls: new Map(), entries: [] }
  },
  update: (context, match) => {
    if (match.event.type === 'tool/call') {
      const calls = new Map(context.state.calls)
      const name = stringValue(match.event.data.name) ?? ''
      const argsRaw = stringValue(match.event.data.arguments)
      calls.set(String(match.event.data.callId), { name, argsRaw })
      return { ...context.state, calls }
    }
    if (match.event.type !== 'tool/result') return context.state
    if (match.event.data.message.content[0]?.isError === true) return context.state
    const callId = String(match.event.data.message.source.callId)
    const call = context.state.calls.get(callId)
    if (call === undefined) return context.state
    const fromMeta = metaEntries(match.event.data.meta)
    const fromCall = fromMeta.length > 0 ? fromMeta : entriesForCall(call)
    const fromResult = resultWebsiteEntries(call.name, match.event.data.message)
    const entries = appendEntries(context.state.entries, [...fromCall, ...fromResult], match.event.seq)
    const unchanged = entries.length === context.state.entries.length
      && entries.every((entry, index) => {
        const previous = context.state.entries[index]
        return previous?.path === entry.path
          && previous.seq === entry.seq
          && previous.added === entry.added
          && previous.removed === entry.removed
          && previous.kind === entry.kind
      })
    return unchanged ? context.state : { ...context.state, entries }
  },
  buildLocationData: (context, scope) => scope !== 'turn' || context.state === undefined || context.state.entries.length === 0
    ? null
    : {
      kind: 'turn',
      turn: context.state.turn,
      key: DELIVERABLES_DATA_KEY,
      value: { entries: context.state.entries },
    },
}

function nativeDeliverables(owner: TurnTailOwnerProps): UnknownRecord | undefined {
  return record((owner.turn.data as unknown as { get(key: string): unknown }).get('deliverables'))
}

function nativeProducedEntries(owner: TurnTailOwnerProps): readonly DeliverableEntry[] {
  const produced = nativeDeliverables(owner)?.produced
  if (!Array.isArray(produced)) return []
  const entries: DeliverableEntry[] = []
  for (const item of produced) {
    const value = record(item)
    const path = stringValue(value?.path)
    const seq = typeof value?.seq === 'number' ? value.seq : Number.POSITIVE_INFINITY
    if (path === undefined || seq > owner.seq || entries.some(entry => samePath(entry.path, path))) continue
    entries.push({ path, seq, added: 0, removed: 0, kind: 'file' })
  }
  return entries
}

/**
 * Whether DSH's own turn-tail deliverables card will claim this Turn. It
 * renders changed files when developer tools are enabled, so the plugin must
 * not draw a second file card in that case.
 */
export function nativeDeliverablesPresent(owner: TurnTailOwnerProps): boolean {
  return nativeDeliverables(owner)?.changes !== undefined
}

/**
 * Select entries that were delivered before the closing assistant message.
 * Native produced paths are merged instead of replacing the plugin's richer
 * entries, so a tool the plugin did not classify cannot hide the file.
 */
export function selectDeliverables(owner: TurnTailOwnerProps): readonly DeliverableEntry[] | null {
  const value = owner.turn.data.get(DELIVERABLES_DATA_KEY)
  const pluginEntries = value === undefined
    ? []
    : value.entries.filter(entry => entry.seq <= owner.seq)
  let entries: readonly DeliverableEntry[] = [...pluginEntries]
  for (const entry of nativeProducedEntries(owner)) {
    entries = appendEntries(entries, [{
      path: entry.path,
      added: entry.added,
      removed: entry.removed,
      kind: entry.kind,
    }], entry.seq)
  }
  return entries.length === 0 ? null : entries
}
