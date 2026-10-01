import { useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import {
  IconChevronDownOutlineMedium,
  IconChevronUpOutlineMedium,
  IconGlobeOutlineMedium,
  IconProjectAddOutlineMedium,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { selectDeliverables, type DeliverableEntry } from './deliverables.ts'
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
  return matched === null ? null : <DeliverablesCard {...props} matched={matched} />
}

/** Codex-style turn-tail card for edited files and deployed websites. */
export function DeliverablesCard({ matched: entries, openFile, t }: DeliverablesCardProps) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? entries : entries.slice(0, 3)
  const hidden = entries.length - visible.length
  const summary = countLabel(entries, t)
  const hasFiles = entries.some(entry => !isWebsite(entry))
  const firstWebsite = entries.find(isWebsite)
  return (
    <section className={css.root} data-stream-deliverables-card data-stream-deliverables-count={entries.length}>
      <div className={css.header}>
        <span className={css.headerIcon} aria-hidden>
          {hasFiles ? <IconProjectAddOutlineMedium size={20} /> : <IconGlobeOutlineMedium size={20} />}
        </span>
        <div className={css.heading}>
          <strong className={css.title}>{summary}</strong>
          {hasFiles ? (
            <button type="button" className={css.subtitle} onClick={() => { setExpanded(true) }}>
              {t('deliveriesViewChanges')} ↗
            </button>
          ) : firstWebsite !== undefined ? (
            <button type="button" className={css.subtitle} onClick={() => { openWebsite(firstWebsite.path) }}>
              {t('deliveriesOpenWebsite')} ↗
            </button>
          ) : null}
        </div>
      </div>
      <div className={css.list}>
        {visible.map(entry => {
          const website = isWebsite(entry)
          const parts = pathParts(entry.path)
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
                  <span className={css.fileName}>{parts.name || entry.path}</span>
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
