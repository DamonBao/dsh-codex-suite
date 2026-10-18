/** Conversation UI preferences on the installed bundle's configuration page. */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { IconRefreshOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConversationCardFace } from './conversation-ui-card-controller.ts'
import type { ConversationSettings } from '../settings.ts'
import css from './ConversationCard.module.css'

/** Props the renderer binds for the conversation-ui card. */
export type ConversationCardProps =
  PropsRuntime<'plugins.bundle.config'>
  & PropsLocale<'settings.conversationUi'>
  & InjectFace<ConversationCardFace>

/** Render the conversation-ui card independently of the core settings namespace allowlist. */
export function ConversationCard(props: ConversationCardProps) {
  const { t } = props
  const state = props.useConversationUiCard(snapshot => snapshot)
  const blocked = !state.dirty || state.saving || state.status !== 'ready'
  const versionLabel = state.version === undefined
    ? null
    : t(state.installation === 'development' ? 'developmentVersion' : 'version')
      .replace('{version}', state.version)

  return (
    <section className={`${css.card} ${css.cardOpen}`} aria-label={t('title')}>
      <div className={css.header}>
        <span className={css.headText}>
          <span className={css.name}>{t('title')}</span>
          <span className={css.description}>{t('description')}</span>
        </span>
        {versionLabel === null && !state.dirty ? null : (
          <span className={css.metadata}>
            {versionLabel === null ? null : <span className={css.version}>{versionLabel}</span>}
            {state.dirty ? <span className={css.pending}>{t('unsaved')}</span> : null}
          </span>
        )}
      </div>
      <div className={css.body}>
        {state.status === 'loading' ? <p className={css.readOnly} role="status">{t('loading')}</p> : null}
        {state.status === 'unavailable' ? (
          <div className={css.failure}>
            <p className={css.readOnly} role="status">{t('unavailable')}</p>
            <button type="button" className={css.discard} onClick={props.reload}>{t('retry')}</button>
          </div>
        ) : null}
        {state.status === 'ready' ? (
          <>
            {!state.writable ? <p className={css.readOnly} role="status">{t('readOnly')}</p> : null}
            <label className={css.field}>
              <span className={css.fieldHead}>
                <span className={css.label}>{t('mode')}</span>
                <select
                  className={css.select}
                  value={state.mode}
                  disabled={!state.writable}
                  onChange={(event) => {
                    props.edit({ mode: event.target.value as ConversationSettings['mode'] })
                  }}
                >
                  <option value="typewriter">{t('modeTypewriter')}</option>
                  <option value="teleprompter">{t('modeTeleprompter')}</option>
                </select>
              </span>
              <span className={css.hint}>{t('modeHint')}</span>
            </label>
            <label className={css.field}>
              <span className={css.fieldHead}>
                <span className={css.label}>{t('preset')}</span>
                <select
                  className={css.select}
                  value={state.preset}
                  disabled={!state.writable}
                  onChange={(event) => {
                    props.edit({ preset: event.target.value as ConversationSettings['preset'] })
                  }}
                >
                  <option value="realtime">{t('presetRealtime')}</option>
                  <option value="balanced">{t('presetBalanced')}</option>
                  <option value="silky">{t('presetSilky')}</option>
                </select>
              </span>
              <span className={css.hint}>{t('presetHint')}</span>
            </label>
            <label className={css.field}>
              <span className={css.fieldHead}>
                <span className={css.label}>{t('revealSpeed')}</span>
                <span className={css.value}>{state.revealCharsPerSec} {t('charsPerSecond')}</span>
              </span>
              <input
                type="range"
                className={css.range}
                min={5}
                max={200}
                step={5}
                value={state.revealCharsPerSec}
                disabled={!state.writable || state.mode !== 'typewriter'}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (Number.isFinite(value)) props.edit({ revealCharsPerSec: value })
                }}
              />
              <span className={css.hint}>{t('revealSpeedHint')}</span>
            </label>
            <label className={css.field}>
              <span className={css.fieldHead}>
                <span className={css.label}>{t('thinkAutoExpand')}</span>
                <input
                  type="checkbox"
                  className={css.toggle}
                  checked={state.thinkAutoExpand}
                  disabled={!state.writable}
                  onChange={(event) => { props.edit({ thinkAutoExpand: event.target.checked }) }}
                />
              </span>
              <span className={css.hint}>{t('thinkAutoExpandHint')}</span>
            </label>
            <div className={css.updateRow}>
              <span className={css.updateCopy}>
                <span className={css.label}>{t('updates')}</span>
                <span className={css.hint}>
                  {state.restartRequired
                    ? t('restartRequired')
                    : state.installation === 'npm' ? t('updateHint')
                      : state.installation === 'development' ? t('developmentBuild') : t('updateUnavailable')}
                </span>
              </span>
              <button
                type="button"
                className={css.update}
                disabled={!state.canUpgrade || state.upgrading || state.restartRequired}
                title={state.canUpgrade ? undefined : t('updateUnavailable')}
                onClick={props.upgrade}
              >
                <span aria-hidden="true"><IconRefreshOutlineMedium /></span>
                {t(state.upgrading ? 'updating' : 'update')}
              </button>
            </div>
            {state.upgradeFailed ? <p className={css.failed} role="status">{t('updateFailed')}</p> : null}
            <div className={css.footer}>
              {state.failed ? <p className={css.failed} role="status">{t('saveFailed')}</p> : null}
              <button
                type="button"
                className={css.discard}
                disabled={!state.dirty || state.saving}
                onClick={props.discard}
              >
                {t('discard')}
              </button>
              <button
                type="button"
                className={css.save}
                disabled={blocked}
                onClick={props.save}
              >
                {t(state.saving ? 'saving' : 'save')}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
