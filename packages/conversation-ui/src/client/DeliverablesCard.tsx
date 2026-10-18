import { useState, useSyncExternalStore } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import {
  IconChevronDownOutlineMedium,
  IconChevronUpOutlineMedium,
  IconGlobeOutlineMedium,
  IconProjectAddOutlineMedium,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { nativeDeliverablesPresent, selectDeliverables, type DeliverableEntry } from './deliverables.ts'
import { developerTools } from './developer-tools.ts'
import css from './DeliverablesCard.module.css'

type DeliverablesTailProps = TurnTailOwnerProps & PropsLocale<'settings.conversationUi'>

export interface DeliverablesCardProps extends DeliverablesTailProps {
  readonly matched: readonly DeliverableEntry[]
}

function isWebsite(entry: DeliverableEntry): boolean {
  return entry.kind === 'website' || /^https?:\/\//i.test(entry.path)
}

function openWebsite(path: string): void {
  if (typeof window !== 'undefined') window.open(path, '_blank', 'noopener,noreferrer')
}

function pathParts(path: string): { parent: string; name: string } {
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (separator < 0) return { parent: '', name: path }
  return { parent: path.slice(0, separator + 1), name: path.slice(separator + 1) }
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)
}

/** First segments from relative entries, used to trim absolute siblings. */
function relativePrefixes(entries: readonly DeliverableEntry[]): readonly string[] {
  const prefixes = new Set<string>()
  for (const entry of entries) {
    if (isWebsite(entry) || isAbsolutePath(entry.path)) continue
    const first = entry.path.replaceAll('\\', '/').split('/')[0]
    if (first !== undefined && first !== '' && first !== '.' && first !== '..') prefixes.add(first)
  }
  return [...prefixes]
}

/**
 * Prefer the workspace-relative spelling for display. The slot owner does not
 * expose the session cwd, but a sibling relative entry identifies the first
 * path segment (`packages`, `src`, ...), which is enough to trim an absolute
 * tool-reported path without changing the path used for `openFile`.
 */
function displayPath(path: string, prefixes: readonly string[]): string {
  if (!isAbsolutePath(path)) return path
  const normalized = path.replaceAll('\\', '/')
  for (const prefix of prefixes) {
    const marker = `/${prefix}/`
    const index = normalized.indexOf(marker)
    if (index >= 0) return normalized.slice(index + 1)
  }
  return path
}

function hiddenKindLabel(entries: readonly DeliverableEntry[], t: DeliverablesTailProps['t']): string {
  if (entries.every(isWebsite)) return t('deliveriesWebsites')
  if (entries.every(entry => !isWebsite(entry))) return t('deliveriesFiles')
  return t('deliveriesItems')
}

function countLabel(entries: readonly DeliverableEntry[], t: DeliverablesTailProps['t']): string {
  const files = entries.filter(entry => !isWebsite(entry)).length
  const websites = entries.length - files
  if (files > 0 && websites === 0) return t('deliveriesEdited').replace('{count}', String(files))
  if (files === 0) return t('deliveriesWebsitesCount').replace('{count}', String(websites))
  return t('deliveriesCount').replace('{count}', String(entries.length))
}

/** Render this list contribution only when its Turn has delivered files or websites. */
export function DeliverablesTail(props: DeliverablesTailProps) {
  const matched = selectDeliverables(props)
  const showNativeFiles = useSyncExternalStore(
    developerTools.subscribe,
    developerTools.getSnapshot,
    developerTools.getSnapshot,
  ) && nativeDeliverablesPresent(props)
  if (matched === null) return null
  // DSH's own changed-files card owns files while developer tools are on;
  // adding the same files here would show two cards for one Turn. Websites
  // have no native owner, so they stay in the plugin card.
  const entries = showNativeFiles ? matched.filter(isWebsite) : matched
  return entries.length === 0 ? null : <DeliverablesCard {...props} matched={entries} />
}

/** Codex-style turn-tail card for edited files and deployed websites. */
export function DeliverablesCard({ matched: entries, openFile, t }: DeliverablesCardProps) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? entries : entries.slice(0, 3)
  const hidden = entries.length - visible.length
  const summary = countLabel(entries, t)
  const hasFiles = entries.some(entry => !isWebsite(entry))
  const firstWebsite = entries.find(isWebsite)
  const prefixes = relativePrefixes(entries)
  return (
    <section className={css.root} data-stream-deliverables-card data-stream-deliverables-count={entries.length}>
      <div className={css.header}>
        <span className={css.headerIcon} aria-hidden>
          {hasFiles ? <IconProjectAddOutlineMedium size={20} /> : <IconGlobeOutlineMedium size={20} />}
        </span>
        <div className={css.heading}>
          <strong className={css.title}>{summary}</strong>
          {!hasFiles && firstWebsite !== undefined ? (
            <button type="button" className={css.subtitle} onClick={() => { openWebsite(firstWebsite.path) }}>
              {t('deliveriesOpenWebsite')} ↗
            </button>
          ) : null}
        </div>
      </div>
      <div className={css.list}>
        {visible.map(entry => {
          const website = isWebsite(entry)
          const display = displayPath(entry.path, prefixes)
          const parts = pathParts(display)
          return (
            <button
              key={`${entry.kind}:${entry.path}`}
              type="button"
              className={css.item}
              title={entry.path}
              onClick={() => { website ? openWebsite(entry.path) : openFile(entry.path) }}
            >
              {website ? (
                <span className={css.websitePath}>{entry.path}</span>
              ) : (
                <span className={css.filePath}>
                  {parts.parent !== '' && <span className={css.parentPath}>{parts.parent}</span>}
                  <span className={css.fileName}>{parts.name || display}</span>
                </span>
              )}
              {!website && (entry.added > 0 || entry.removed > 0) && (
                <span className={css.stats}>
                  {entry.added > 0 && <span className={css.added}>+{entry.added}</span>}
                  {entry.removed > 0 && <span className={css.removed}>-{entry.removed}</span>}
                </span>
              )}
              {website && <span className={css.external} aria-hidden>↗</span>}
            </button>
          )
        })}
      </div>
      {hidden > 0 && (
        <button type="button" className={css.more} onClick={() => { setExpanded(true) }}>
          {t('deliveriesMore').replace('{count}', String(hidden)).replace('{kind}', hiddenKindLabel(entries.slice(visible.length), t))}
          <span className={css.moreIcon} aria-hidden><IconChevronDownOutlineMedium /></span>
        </button>
      )}
      {expanded && entries.length > 3 && (
        <button type="button" className={css.more} onClick={() => { setExpanded(false) }}>
          {t('deliveriesCollapse')} <span className={css.moreIcon} aria-hidden><IconChevronUpOutlineMedium /></span>
        </button>
      )}
    </section>
  )
}
