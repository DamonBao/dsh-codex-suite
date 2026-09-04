/** Native Settings section for the external Codex provider plugin. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Modal, StateDot, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  CodexAuthFailureReason,
  CodexAuthState,
  CodexLoginMethod,
  CodexNetworkIssue,
  CodexNetworkRoute,
  CodexProxyMode,
  CodexResetCredit,
  CodexResetRedeemOutcome,
  CodexUsageWindow,
} from '../types.ts'
import type { CodexAuthCardFace, CodexAuthCardState } from './controller.ts'
import type { CodexSettingsKey } from './locales.ts'
import { formatCodexPlanName, formatResetTime, formatUsageNumber } from './locale-format.ts'
import { OpenAILogo } from './OpenAILogo.tsx'
import css from './CodexSettingsSection.module.css'

/** Plugin-owned dependencies bound into the Settings section. */
export interface CodexSettingsInjected extends CodexAuthCardFace {
  /** Active DSH locale id, read at render time so date/number formatting follows language changes. */
  getLocale: () => string
}

/** Props bound by the Settings section slot. */
export type CodexSettingsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.codexProvider'>
  & InjectFace<CodexSettingsInjected>

function assertNever(value: never): never {
  throw new Error(`unhandled Codex auth state: ${JSON.stringify(value)}`)
}

/** Whether an auth phase owns a login still in progress. */
export function isLoginActive(state: CodexAuthState): boolean {
  switch (state.phase) {
    case 'starting':
    case 'awaiting-browser':
    case 'awaiting-device': return true
    case 'connected':
    case 'disconnected':
    case 'reauth-required':
    case 'failed': return false
    default: return assertNever(state)
  }
}

/** Resolve the state-dot semantic for one auth phase. */
export function authDot(state: CodexAuthState): StateDotState {
  switch (state.phase) {
    case 'connected': return 'done'
    case 'starting':
    case 'awaiting-browser':
    case 'awaiting-device': return 'ongoing'
    case 'failed':
    case 'reauth-required': return 'error'
    case 'disconnected': return 'warning'
    default: return assertNever(state)
  }
}

/** Resolve the localized status key for one auth phase. */
export function authLabel(state: CodexAuthState): CodexSettingsKey {
  switch (state.phase) {
    case 'connected': return 'connected'
    case 'starting': return 'starting'
    case 'awaiting-browser': return 'awaitingBrowser'
    case 'awaiting-device': return 'awaitingDevice'
    case 'failed': return 'failed'
    case 'reauth-required': return 'reauthRequired'
    case 'disconnected': return 'disconnected'
    default: return assertNever(state)
  }
}

/** Resolve actionable UI copy for one secret-free Host failure reason. */
export function authFailureLabel(reason: CodexAuthFailureReason): CodexSettingsKey {
  switch (reason) {
    case 'account-access': return 'failureAccountAccess'
    case 'browser-callback': return 'failureBrowserCallback'
    case 'browser-callback-port': return 'failureBrowserCallbackPort'
    case 'browser-callback-timeout': return 'failureBrowserCallbackTimeout'
    case 'device-code-disabled': return 'failureDeviceCodeDisabled'
    case 'network': return 'failureNetwork'
    case 'token-exchange': return 'failureTokenExchange'
    case 'unsupported-region': return 'failureUnsupportedRegion'
    case 'unknown': return 'failureUnknown'
    default: return assertNever(reason)
  }
}

export function networkRouteLabel(route: CodexNetworkRoute): CodexSettingsKey {
  switch (route) {
    case 'direct-or-tun': return 'networkDirectOrTun'
    case 'environment-proxy': return 'networkEnvironmentProxy'
    case 'host-dispatcher': return 'networkHostDispatcher'
    case 'system-proxy': return 'networkSystemProxy'
    default: return assertNever(route)
  }
}

export function proxyModeLabel(mode: CodexProxyMode): CodexSettingsKey {
  switch (mode) {
    case 'auto': return 'proxyModeAuto'
    case 'environment': return 'proxyModeEnvironment'
    case 'off': return 'proxyModeOff'
    default: return assertNever(mode)
  }
}

export function networkIssueLabel(issue: CodexNetworkIssue): CodexSettingsKey {
  switch (issue) {
    case 'proxy-initialization-failed': return 'networkProxyInitializationFailed'
    case 'system-proxy-detection-failed': return 'networkSystemProxyDetectionFailed'
    case 'unsupported-proxy': return 'networkUnsupportedProxy'
    default: return assertNever(issue)
  }
}

function diagnosticCode(reason: CodexAuthFailureReason): string {
  return `CODEX_AUTH_${reason.replaceAll('-', '_').toUpperCase()}`
}

function useCopyCode(code: string): { copied: boolean; copy: () => void } {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => { window.clearTimeout(timer.current) }, [])
  const copy = useCallback(() => {
    void writeClipboard(code).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => { setCopied(false) }, 1000)
    })
  }, [code])
  return { copied, copy }
}

function LoginBody({ state, t }: { state: CodexAuthState; t: (key: CodexSettingsKey) => string }): ReactNode {
  const code = state.phase === 'awaiting-device' ? state.userCode : ''
  const copy = useCopyCode(code)
  if (state.phase === 'awaiting-browser') {
    return (
      <div className={css.loginBody}>
        <p>{t('browserWaiting')}</p>
        <a className={css.externalLink} href={state.authorizationUrl} target="_blank" rel="noreferrer">
          {t('openLoginPage')}
        </a>
      </div>
    )
  }
  if (state.phase === 'awaiting-device') {
    return (
      <div className={css.loginBody}>
        <p>{t('deviceWaiting')}</p>
        <div className={css.deviceCodeRow}>
          <code className={css.deviceCode}>{state.userCode}</code>
          <Button size="sm" variant="outline" onClick={copy.copy}>
            {t(copy.copied ? 'copied' : 'copyCode')}
          </Button>
        </div>
        <a className={css.externalLink} href={state.verificationUri} target="_blank" rel="noreferrer">
          {t('openVerificationPage')}
        </a>
      </div>
    )
  }
  if (state.phase === 'starting') return <p className={css.waiting}>{t('starting')}</p>
  if (state.phase === 'failed') {
    return (
      <div className={css.loginFailure} role="status">
        <p className={css.error}>{t(authFailureLabel(state.reason))}</p>
        <code className={css.diagnosticCode}>{diagnosticCode(state.reason)}</code>
      </div>
    )
  }
  return null
}

function NetworkStatus({ state, t }: { state: CodexAuthCardState; t: Translate }): ReactNode {
  const route = state.networkStatus === 'error'
    ? t('networkStatusUnavailable')
    : state.network === null ? t('networkDetecting') : t(networkRouteLabel(state.network.route))
  return (
    <div className={css.networkStatus} role="status">
      <p><span>{t('networkRouteLabel')}</span> {route}</p>
      {state.network?.issue === undefined
        ? null
        : <p className={css.error}>{t(networkIssueLabel(state.network.issue))}</p>}
    </div>
  )
}

type Translate = (key: CodexSettingsKey) => string

function formatWindowDuration(seconds: number | null): string | null {
  if (seconds === null) return null
  if (seconds % 86_400 === 0) return `${seconds / 86_400}d`
  if (seconds % 3_600 === 0) return `${seconds / 3_600}h`
  return `${Math.max(1, Math.round(seconds / 60))}m`
}

function usageWindowTitle(window: CodexUsageWindow, fallback: CodexSettingsKey, t: Translate): string {
  const duration = formatWindowDuration(window.limitWindowSeconds)
  return duration === null ? t(fallback) : `${duration} ${t('usageWindow')}`
}

function UsageWindowRow({
  window,
  fallback,
  locale,
  t,
}: {
  window: CodexUsageWindow
  fallback: CodexSettingsKey
  locale: string
  t: Translate
}): ReactNode {
  const title = usageWindowTitle(window, fallback, t)
  const reset = formatResetTime(window.resetAt, locale)
  return (
    <div className={css.usageWindow}>
      <div className={css.usageWindowHead}>
        <span className={css.usageWindowTitle}>{title}</span>
        <span className={css.usagePercent}>{Math.round(window.usedPercent)}%</span>
      </div>
      <progress
        className={css.usageProgress}
        max={100}
        value={window.usedPercent}
        aria-label={`${title}: ${t('usedLabel')} ${Math.round(window.usedPercent)}%`}
      />
      <div className={css.usageWindowMeta}>
        <span>{t('usedLabel')} {Math.round(window.usedPercent)}%</span>
        {reset === null ? null : <span>{t('resetsLabel')} <time dateTime={new Date(window.resetAt ?? 0).toISOString()}>{reset}</time></span>}
      </div>
    </div>
  )
}

/** Banked resets that can still be redeemed, earliest expiration first. */
function redeemableCredits(state: CodexAuthCardState): readonly CodexResetCredit[] {
  const credits = state.resetCredits?.credits ?? []
  return credits
    .filter(credit => credit.status === 'available')
    .slice()
    .sort((a, b) => (a.expiresAt ?? Number.POSITIVE_INFINITY) - (b.expiresAt ?? Number.POSITIVE_INFINITY))
}

/** Earliest expiry among redeemable resets, or null when none reports one. */
function earliestResetExpiry(state: CodexAuthCardState): number | null {
  const expiries = redeemableCredits(state)
    .map(credit => credit.expiresAt)
    .filter((expiry): expiry is number => expiry !== null)
  return expiries.length === 0 ? null : Math.min(...expiries)
}

function ResetResultBody({
  outcome,
  locale,
  t,
}: {
  outcome: CodexResetRedeemOutcome
  locale: string
  t: Translate
}): ReactNode {
  const windowsReset = outcome.outcome === 'reset' || outcome.outcome === 'already-redeemed'
    ? outcome.windowsReset
    : null
  switch (outcome.outcome) {
    case 'reset':
      return (
        <div className={css.resetResult} role="status">
          <p className={css.resetResultText}>{t('resetResultReset')}</p>
          {windowsReset === null ? null : (
            <p className={css.resetResultMeta}>
              {formatUsageNumber(windowsReset, locale)} {t('resetResultWindowsReset')}
            </p>
          )}
        </div>
      )
    case 'already-redeemed': return <p className={css.resetResultText} role="status">{t('resetResultAlreadyRedeemed')}</p>
    case 'nothing-to-reset': return <p className={css.resetResultText} role="status">{t('resetResultNothingToReset')}</p>
    case 'no-credit': return <p className={css.resetResultText} role="status">{t('resetResultNoCredit')}</p>
    default: return null
  }
}

function ResetRedeemBody({
  state,
  locale,
  t,
  retry,
}: {
  state: CodexAuthCardState
  locale: string
  t: Translate
  retry: () => void
}): ReactNode {
  if (state.resetStatus === 'loading') return <p className={css.waiting}>{t('resetLoading')}</p>
  if (state.resetStatus === 'error' || state.resetCredits === null) {
    return (
      <div className={css.resetFailure} role="status">
        <p className={css.error}>{t('resetUnavailable')}</p>
        <Button size="sm" variant="outline" onClick={retry}>{t('retry')}</Button>
      </div>
    )
  }
  const credits = redeemableCredits(state)
  const available = state.resetCredits.availableCount
  return (
    <div className={css.resetList}>
      <p className={css.hint}>{t('resetHint')}</p>
      {available === 0
        ? <p className={css.resetNone} role="status">{t('resetNoneAvailable')}</p>
        : (
          <>
            <ul className={css.resetCredits}>
              {credits.map(credit => (
                <li key={credit.id} className={css.resetCredit}>
                  <span className={css.resetCreditTitle}>{credit.title ?? t('resetCreditFallbackTitle')}</span>
                  <span className={css.resetCreditMeta}>
                    {t('resetCreditExpiresLabel')}{' '}
                    {credit.expiresAt === null
                      ? t('resetCreditNoExpiry')
                      : <time dateTime={new Date(credit.expiresAt).toISOString()}>{formatResetTime(credit.expiresAt, locale)}</time>}
                  </span>
                </li>
              ))}
            </ul>
            {available > credits.length ? <p className={css.resetMore}>{t('resetMoreCredits')}</p> : null}
          </>
        )}
    </div>
  )
}

function UsagePanel({
  state,
  locale,
  t,
  refresh,
  isLoopback,
  openRedeem,
}: {
  state: CodexAuthCardState
  locale: string
  t: Translate
  refresh: () => void
  isLoopback: boolean
  openRedeem: () => void
}): ReactNode {
  const usage = state.usage
  const credits = usage?.credits
  const creditLabel = credits?.unlimited === true
    ? t('unlimitedCredits')
    : credits?.hasCredits === true && credits.balance !== null
      ? formatUsageNumber(credits.balance, locale)
      : null
  const resetsAvailable = usage?.resetCreditsAvailable ?? null
  const resetExpiryAt = resetsAvailable !== null && resetsAvailable > 0
    ? earliestResetExpiry(state)
    : null
  return (
    <div className={css.usagePanel}>
      <div className={css.usageHead}>
        <h3 className={css.usageTitle}>{t('usageTitle')}</h3>
        <div className={css.usageActions}>
          {resetsAvailable !== null && resetsAvailable > 0
            ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!isLoopback || state.action !== null}
                onClick={openRedeem}
              >
                {t('resetUsageButton')}
              </Button>
            )
            : null}
          <Button
            size="sm"
            variant="outline"
            disabled={state.usageStatus === 'loading'}
            onClick={refresh}
          >
            {t('refreshUsage')}
          </Button>
        </div>
      </div>
      {state.usageStatus === 'loading' && usage === null
        ? <p className={css.usageMessage}>{t('usageLoading')}</p>
        : null}
      {usage === null && state.usageStatus !== 'loading'
        ? <p className={css.error} role="status">{t('usageUnavailable')}</p>
        : null}
      {usage === null
        ? null
        : (
          <>
            {usage.planType === null && creditLabel === null && resetsAvailable === null
              ? null
              : (
                <dl className={css.usageFacts}>
                  {usage.planType === null
                    ? null
                    : <><dt>{t('planLabel')}</dt><dd>{formatCodexPlanName(usage.planType, locale)}</dd></>}
                  {creditLabel === null
                    ? null
                    : <><dt>{t('creditsLabel')}</dt><dd>{creditLabel}</dd></>}
                  {resetsAvailable === null
                    ? null
                    : (
                      <>
                        <dt>{t('resetCreditsLabel')}</dt>
                        <dd>
                          {resetsAvailable}
                          {resetExpiryAt === null
                            ? null
                            : (
                              <span className={css.factHint}>
                                {` · ${t('resetEarliestExpiry')} `}
                                <time dateTime={new Date(resetExpiryAt).toISOString()}>
                                  {formatResetTime(resetExpiryAt, locale)}
                                </time>
                              </span>
                            )}
                        </dd>
                      </>
                    )}
                </dl>
              )}
            {usage.limitReached ? <p className={css.usageLimit} role="status">{t('limitReached')}</p> : null}
            {usage.primary === null && usage.secondary === null
              ? null
              : (
                <div className={css.usageGrid}>
                  {usage.primary === null
                    ? null
                    : <UsageWindowRow window={usage.primary} fallback="primaryWindow" locale={locale} t={t} />}
                  {usage.secondary === null
                    ? null
                    : <UsageWindowRow window={usage.secondary} fallback="secondaryWindow" locale={locale} t={t} />}
                </div>
              )}
            {state.usageStatus === 'error'
              ? <p className={css.error} role="status">{t('usageUnavailable')}</p>
              : null}
          </>
        )}
    </div>
  )
}

/** Render the external provider's independent Settings section. */
export function CodexSettingsSection(props: CodexSettingsSectionProps): ReactNode {
  const { t } = props
  const locale = props.getLocale()
  const state = props.useCodexAuth(snapshot => snapshot)
  const [loginOpen, setLoginOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [redeemOpen, setRedeemOpen] = useState(false)
  const configuredProxyMode = state.network?.configuredProxyMode ?? 'auto'
  const [proxyMode, setProxyMode] = useState<CodexProxyMode>(configuredProxyMode)
  const active = isLoginActive(state.auth)
  const closeState = useRef({ action: state.action, active })
  closeState.current = { action: state.action, active }

  useEffect(() => { props.load() }, [props.load])
  useEffect(() => { setProxyMode(configuredProxyMode) }, [configuredProxyMode])
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(props.refresh, 600)
    return () => { window.clearInterval(timer) }
  }, [active, props.refresh])
  useEffect(() => {
    if (state.auth.phase !== 'connected') return
    setLoginOpen(false)
    const timer = window.setInterval(props.refresh, 60_000)
    return () => { window.clearInterval(timer) }
  }, [props.refresh, state.auth.phase])

  const closeLogin = (): void => {
    if (closeState.current.action === 'login') return
    if (closeState.current.active) props.cancel()
    setLoginOpen(false)
  }
  const start = (method: CodexLoginMethod): void => {
    setLoginOpen(true)
    props.login(method)
  }
  const openRedeem = useCallback(() => {
    setRedeemOpen(true)
    props.loadResetCredits()
  }, [props.loadResetCredits])
  const closeRedeem = (): void => {
    if (closeState.current.action === 'reset-redeem') return
    setRedeemOpen(false)
  }

  const redeemAvailable = state.resetStatus === 'ready'
    && state.resetCredits !== null
    && state.resetCredits.availableCount > 0
  const redeemFooter = state.redeemStatus === 'redeeming'
    ? (
      <Button variant="primary" disabled>{t('resetting')}</Button>
    )
    : state.redeemStatus === 'done'
      ? (
        <Button variant="primary" onClick={closeRedeem}>{t('close')}</Button>
      )
      : (
        <>
          <Button
            variant="outline"
            disabled={state.action === 'reset-redeem'}
            onClick={() => { setRedeemOpen(false) }}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!props.isLoopback || state.action !== null || !redeemAvailable}
            onClick={() => { props.redeemResetCredit() }}
          >
            {t('resetConfirm')}
          </Button>
        </>
      )

  const loginFooter = active
    ? (
      <Button variant="outline" disabled={state.action === 'cancel'} onClick={closeLogin}>
        {t('cancelLogin')}
      </Button>
    )
    : (
      <>
        <Button variant="outline" onClick={closeLogin}>{t('cancel')}</Button>
        <Button variant="outline" disabled={state.action !== null} onClick={() => { start('device') }}>
          {t('deviceLogin')}
        </Button>
        <Button variant="primary" disabled={state.action !== null} onClick={() => { start('browser') }}>
          {t('browserLogin')}
        </Button>
      </>
    )

  return (
    <section className={css.section}>
      <h2 className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('description')}</p>
      <div className={css.card}>
        <div className={css.cardHead}>
          <div className={css.identity}>
            <div className={css.providerLine}>
              <OpenAILogo className={css.providerIcon} />
              <span className={css.providerName}>{t('title')}</span>
            </div>
            <span className={css.status} role="status">
              <StateDot state={authDot(state.auth)} />
              {state.status === 'loading' || state.status === 'idle' ? t('loading') : t(authLabel(state.auth))}
            </span>
          </div>
          {state.status === 'error'
            ? <Button size="sm" variant="outline" onClick={props.load}>{t('retry')}</Button>
            : state.auth.phase === 'connected'
              ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={state.action !== null || !props.isLoopback}
                  onClick={() => { setLogoutOpen(true) }}
                >
                  {t('disconnect')}
                </Button>
              )
              : (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!props.isLoopback || state.status === 'loading' || state.action !== null || active}
                  onClick={() => { setLoginOpen(true) }}
                >
                  {t(state.auth.phase === 'failed'
                    ? 'retry'
                    : state.auth.phase === 'reauth-required' ? 'reconnect' : 'connect')}
                </Button>
              )}
        </div>
        <p className={css.contextInfo}>{t('contextInfo')}</p>
        <NetworkStatus state={state} t={t} />
        <div className={css.proxySettings}>
          <label className={css.proxyModeField}>
            <span>{t('proxyModeLabel')}</span>
            <select
              aria-label={t('proxyModeLabel')}
              value={proxyMode}
              disabled={!props.isLoopback || state.networkStatus !== 'ready' || state.action !== null}
              onChange={(event) => {
                const mode = event.currentTarget.value
                if (mode === 'auto' || mode === 'environment' || mode === 'off') setProxyMode(mode)
              }}
            >
              {(['auto', 'environment', 'off'] as const).map(mode => (
                <option key={mode} value={mode}>{t(proxyModeLabel(mode))}</option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={!props.isLoopback || state.networkStatus !== 'ready'
              || state.action !== null || proxyMode === configuredProxyMode}
            onClick={() => { props.setProxyMode(proxyMode) }}
          >
            {t(state.action === 'proxy-mode' ? 'proxyModeSaving' : 'proxyModeSave')}
          </Button>
        </div>
        {state.network?.restartRequired
          ? <p className={css.restartNotice} role="status">{t('proxyModeRestartRequired')}</p>
          : null}
        {!props.isLoopback ? <p className={css.error} role="status">{t('remoteHint')}</p> : null}
        {state.status === 'error' ? <p className={css.error} role="status">{t('loadFailed')}</p> : null}
        {state.actionFailed ? <p className={css.error} role="status">{t('actionFailed')}</p> : null}
        {state.auth.phase === 'reauth-required'
          ? <p className={css.error} role="status">{t('reauthRequiredDescription')}</p>
          : null}
      </div>

      {state.auth.phase === 'connected'
        ? (
          <UsagePanel
            state={state}
            locale={locale}
            t={t}
            refresh={props.load}
            isLoopback={props.isLoopback}
            openRedeem={openRedeem}
          />
        )
        : null}

      <Modal
        open={props.isLoopback && redeemOpen && state.auth.phase === 'connected'}
        onClose={closeRedeem}
        title={t('resetTitle')}
        closeLabel={t('close')}
        description={t('resetDescription')}
        footer={redeemFooter}
      >
        {state.redeemStatus === 'redeeming'
          ? <p className={css.waiting}>{t('resetting')}</p>
          : state.redeemStatus === 'done' && state.redeemResult !== null
            ? <ResetResultBody outcome={state.redeemResult} locale={locale} t={t} />
            : (
              <ResetRedeemBody
                state={state}
                locale={locale}
                t={t}
                retry={() => { props.loadResetCredits() }}
              />
            )}
        {state.redeemStatus === 'error'
          ? <p className={css.error} role="status">{t('resetFailed')}</p>
          : null}
        {!props.isLoopback ? <p className={css.error} role="status">{t('remoteHint')}</p> : null}
      </Modal>

      <Modal
        open={props.isLoopback && (loginOpen || active || state.action === 'login') && state.auth.phase !== 'connected'}
        onClose={closeLogin}
        title={t('connectTitle')}
        closeLabel={t('close')}
        description={t('connectDescription')}
        footer={loginFooter}
      >
        <p className={css.hint}>{t('localHint')}</p>
        <LoginBody state={state.auth} t={t} />
      </Modal>

      <Modal
        open={logoutOpen}
        onClose={() => { if (state.action !== 'logout') setLogoutOpen(false) }}
        title={t('disconnectTitle')}
        closeLabel={t('close')}
        description={t('disconnectDescription')}
        footer={(
          <>
            <Button variant="outline" disabled={state.action === 'logout'} onClick={() => { setLogoutOpen(false) }}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={state.action === 'logout'}
              onClick={() => {
                props.logout()
                setLogoutOpen(false)
              }}
            >
              {t(state.action === 'logout' ? 'disconnecting' : 'confirmDisconnect')}
            </Button>
          </>
        )}
      />
    </section>
  )
}
