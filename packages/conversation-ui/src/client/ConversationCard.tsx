/** Conversation UI preferences on the installed bundle's configuration page. */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { IconRefreshOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConversationCardFace } from './conversation-ui-card-controller.ts'
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
        {versionLabel === null ? null : <span className={css.version}>{versionLabel}</span>}
        {state.dirty ? <span className={css.pending}>{t('unsaved')}</span> : null}
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
                <span className={css.label}>{t('thinkAutoExpand')}</span>
                <input
                  type="checkbox"
                  className={css.toggle}
                  checked={state.thinkAutoExpand}
                  disabled={!state.writable}
                  onChange={(event) => { props.edit(event.target.checked) }}
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
                <span aria-hidden="true"><IconRefreshOutline14 /></span>
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
