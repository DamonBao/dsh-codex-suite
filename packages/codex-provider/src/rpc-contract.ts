/** Browser-safe dedicated Connection RPC contract owned by this plugin. */

import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection'
import type {
  CodexAuthFailureReason,
  CodexAuthState,
  CodexLoginMethod,
  CodexNetworkIssue,
  CodexNetworkRoute,
  CodexNetworkState,
  CodexProxyMode,
  CodexResetCredit,
  CodexResetCreditsSnapshot,
  CodexResetRedeemOutcome,
  CodexUsageCredits,
  CodexUsageSnapshot,
  CodexUsageWindow,
} from './types.ts'

/** Carrier-neutral result shape shared by both halves of this channel. */
export type RpcResult<T> = ConnectionRpcResult<T>

/** Logical channel registered by the Host half and called by the browser half. */
export const CODEX_AUTH_RPC_CHANNEL = '/dsh-codex-provider'

/** Browser-safe authentication RPC face. */
export interface CodexAuthRpcClient {
  status(signal?: AbortSignal): Promise<RpcResult<CodexAuthState>>
  network(signal?: AbortSignal): Promise<RpcResult<CodexNetworkState>>
  setProxyMode(mode: CodexProxyMode, signal?: AbortSignal): Promise<RpcResult<CodexNetworkState>>
  usage(signal?: AbortSignal): Promise<RpcResult<CodexUsageSnapshot | null>>
  resetCredits(signal?: AbortSignal): Promise<RpcResult<CodexResetCreditsSnapshot | null>>
  redeemResetCredit(creditId: string | null, signal?: AbortSignal): Promise<RpcResult<CodexResetRedeemOutcome | null>>
  login(method: CodexLoginMethod, signal?: AbortSignal): Promise<RpcResult<CodexAuthState>>
  cancel(signal?: AbortSignal): Promise<RpcResult<CodexAuthState>>
  logout(signal?: AbortSignal): Promise<RpcResult<CodexAuthState>>
}

/** Minimal Connection caller required by this package. */
export interface CodexAuthConnectionRpc {
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<RpcResult<unknown>>
}

/** Build the browser face over Connection's plugin-owned unary channel. */
export function createCodexAuthRpcClient(rpc: CodexAuthConnectionRpc): CodexAuthRpcClient {
  const callAuth = async (
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<RpcResult<CodexAuthState>> => {
    const result = await rpc.call(CODEX_AUTH_RPC_CHANNEL, endpoint, payload, signal)
    if (!result.ok) return result
    const state = parseCodexAuthState(result.value)
    return state === undefined ? invalidResponse(endpoint) : { ok: true, value: state }
  }
  const callNetwork = async (
    endpoint: 'network' | 'proxy-mode',
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<RpcResult<CodexNetworkState>> => {
    const result = await rpc.call(CODEX_AUTH_RPC_CHANNEL, endpoint, payload, signal)
    if (!result.ok) return result
    const network = parseCodexNetworkState(result.value)
    return network === undefined ? invalidResponse(endpoint) : { ok: true, value: network }
  }
  const callUsage = async (signal?: AbortSignal): Promise<RpcResult<CodexUsageSnapshot | null>> => {
    const result = await rpc.call(CODEX_AUTH_RPC_CHANNEL, 'usage', {}, signal)
    if (!result.ok) return result
    if (result.value === null) return { ok: true, value: null }
    const usage = parseCodexUsageSnapshot(result.value)
    return usage === undefined ? invalidResponse('usage') : { ok: true, value: usage }
  }
  const callResetCredits = async (signal?: AbortSignal): Promise<RpcResult<CodexResetCreditsSnapshot | null>> => {
    const result = await rpc.call(CODEX_AUTH_RPC_CHANNEL, 'reset-credits', {}, signal)
    if (!result.ok) return result
    if (result.value === null) return { ok: true, value: null }
    const credits = parseCodexResetCreditsSnapshot(result.value)
    return credits === undefined ? invalidResponse('reset-credits') : { ok: true, value: credits }
  }
  const callRedeemResetCredit = async (
    creditId: string | null,
    signal?: AbortSignal,
  ): Promise<RpcResult<CodexResetRedeemOutcome | null>> => {
    const result = await rpc.call(CODEX_AUTH_RPC_CHANNEL, 'reset-credits/consume', { creditId }, signal)
    if (!result.ok) return result
    if (result.value === null) return { ok: true, value: null }
    const outcome = parseCodexResetRedeemOutcome(result.value)
    return outcome === undefined ? invalidResponse('reset-credits/consume') : { ok: true, value: outcome }
  }
  return {
    status: signal => callAuth('status', {}, signal),
    network: signal => callNetwork('network', {}, signal),
    setProxyMode: (mode, signal) => callNetwork('proxy-mode', { mode }, signal),
    usage: callUsage,
    resetCredits: callResetCredits,
    redeemResetCredit: callRedeemResetCredit,
    login: (method, signal) => callAuth('login', { method }, signal),
    cancel: signal => callAuth('cancel', {}, signal),
    logout: signal => callAuth('logout', {}, signal),
  }
}

/** Validate one untrusted Host reply before it reaches UI state. */
export function parseCodexAuthState(value: unknown): CodexAuthState | undefined {
  if (!isRecord(value) || typeof value.phase !== 'string') return undefined
  switch (value.phase) {
    case 'disconnected': return { phase: 'disconnected' }
    case 'starting':
      return value.method === 'browser' || value.method === 'device'
        ? { phase: 'starting', method: value.method }
        : undefined
    case 'awaiting-browser':
      return typeof value.authorizationUrl === 'string' && value.authorizationUrl.length > 0
        ? { phase: 'awaiting-browser', authorizationUrl: value.authorizationUrl }
        : undefined
    case 'awaiting-device':
      return typeof value.verificationUri === 'string' && value.verificationUri.length > 0
        && typeof value.userCode === 'string' && value.userCode.length > 0
        ? { phase: 'awaiting-device', verificationUri: value.verificationUri, userCode: value.userCode }
        : undefined
    case 'connected':
      return typeof value.expiresAt === 'number' && Number.isFinite(value.expiresAt)
        ? { phase: 'connected', expiresAt: value.expiresAt }
        : undefined
    case 'reauth-required': return { phase: 'reauth-required' }
    case 'failed':
      return isLoginMethod(value.method) && isFailureReason(value.reason)
        ? { phase: 'failed', method: value.method, reason: value.reason }
        : undefined
    default: return undefined
  }
}

/** Validate one secret-free network route returned by the Host. */
export function parseCodexNetworkState(value: unknown): CodexNetworkState | undefined {
  if (!isRecord(value)
    || !isNetworkRoute(value.route)
    || !isProxyMode(value.activeProxyMode)
    || !isProxyMode(value.configuredProxyMode)
    || typeof value.restartRequired !== 'boolean') return undefined
  if (value.issue !== undefined && !isNetworkIssue(value.issue)) return undefined
  return {
    route: value.route,
    ...(value.issue === undefined ? {} : { issue: value.issue }),
    activeProxyMode: value.activeProxyMode,
    configuredProxyMode: value.configuredProxyMode,
    restartRequired: value.restartRequired,
  }
}

/** Validate one secret-free usage snapshot returned by the Host. */
export function parseCodexUsageSnapshot(value: unknown): CodexUsageSnapshot | undefined {
  if (!isRecord(value)
    || !isFiniteNumber(value.fetchedAt)
    || (value.planType !== null && typeof value.planType !== 'string')
    || typeof value.limitReached !== 'boolean') return undefined
  const primary = parseUsageWindow(value.primary)
  const secondary = parseUsageWindow(value.secondary)
  const credits = parseUsageCredits(value.credits)
  if (primary === undefined || secondary === undefined || credits === undefined) return undefined
  if (primary === null && secondary === null && value.planType === null && credits === null) return undefined
  const resetCreditsAvailable = value.resetCreditsAvailable
  if (resetCreditsAvailable !== undefined && resetCreditsAvailable !== null
    && (!isFiniteNumber(resetCreditsAvailable) || resetCreditsAvailable < 0)) return undefined
  return {
    fetchedAt: value.fetchedAt,
    planType: value.planType,
    limitReached: value.limitReached,
    primary,
    secondary,
    credits,
    resetCreditsAvailable: resetCreditsAvailable ?? null,
  }
}

/** Validate one secret-free banked-reset listing returned by the Host. */
export function parseCodexResetCreditsSnapshot(value: unknown): CodexResetCreditsSnapshot | undefined {
  if (!isRecord(value)
    || !isFiniteNumber(value.fetchedAt)
    || !isFiniteNumber(value.availableCount)
    || value.availableCount < 0
    || !Array.isArray(value.credits)) return undefined
  const credits: CodexResetCredit[] = []
  for (const entry of value.credits) {
    const credit = parseResetCredit(entry)
    if (credit === undefined) return undefined
    credits.push(credit)
  }
  return { fetchedAt: value.fetchedAt, availableCount: value.availableCount, credits }
}

function parseResetCredit(value: unknown): CodexResetCredit | undefined {
  if (value === null) return undefined
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || value.id.length === 0
    || typeof value.status !== 'string'
    || value.status.length === 0) return undefined
  const resetType = value.resetType ?? null
  const title = value.title ?? null
  const description = value.description ?? null
  const grantedAt = value.grantedAt ?? null
  const expiresAt = value.expiresAt ?? null
  if ((resetType !== null && typeof resetType !== 'string')
    || (title !== null && typeof title !== 'string')
    || (description !== null && typeof description !== 'string')
    || !isNullableNonNegativeNumber(grantedAt)
    || !isNullableNonNegativeNumber(expiresAt)) return undefined
  return {
    id: value.id,
    status: value.status,
    resetType,
    title,
    description,
    grantedAt,
    expiresAt,
  }
}

/** Validate one secret-free redemption outcome returned by the Host. */
export function parseCodexResetRedeemOutcome(value: unknown): CodexResetRedeemOutcome | undefined {
  if (!isRecord(value)) return undefined
  switch (value.outcome) {
    case 'reset':
    case 'already-redeemed': {
      const windowsReset = value.windowsReset ?? null
      return isNullableNonNegativeNumber(windowsReset)
        ? { outcome: value.outcome, windowsReset }
        : undefined
    }
    case 'nothing-to-reset': return { outcome: 'nothing-to-reset' }
    case 'no-credit': return { outcome: 'no-credit' }
    default: return undefined
  }
}

function parseUsageWindow(value: unknown): CodexUsageWindow | null | undefined {
  if (value === null) return null
  if (!isRecord(value)
    || !isFiniteNumber(value.usedPercent)
    || value.usedPercent < 0
    || value.usedPercent > 100
    || !isNullablePositiveNumber(value.resetAt)
    || !isNullablePositiveNumber(value.limitWindowSeconds)) return undefined
  return {
    usedPercent: value.usedPercent,
    resetAt: value.resetAt,
    limitWindowSeconds: value.limitWindowSeconds,
  }
}

function parseUsageCredits(value: unknown): CodexUsageCredits | null | undefined {
  if (value === null) return null
  if (!isRecord(value)
    || typeof value.hasCredits !== 'boolean'
    || typeof value.unlimited !== 'boolean'
    || (value.balance !== null && (!isFiniteNumber(value.balance) || value.balance < 0))) return undefined
  return {
    hasCredits: value.hasCredits,
    unlimited: value.unlimited,
    balance: value.balance,
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNullablePositiveNumber(value: unknown): value is number | null {
  return value === null || (isFiniteNumber(value) && value > 0)
}

function isNullableNonNegativeNumber(value: unknown): value is number | null {
  return value === null || (isFiniteNumber(value) && value >= 0)
}

function invalidResponse(endpoint: string): RpcResult<never> {
  return {
    ok: false,
    error: {
      code: 'internal',
      message: `Codex provider returned an invalid ${endpoint} response`,
      details: {},
    },
  }
}

function isNetworkRoute(value: unknown): value is CodexNetworkRoute {
  return value === 'direct-or-tun'
    || value === 'environment-proxy'
    || value === 'host-dispatcher'
    || value === 'system-proxy'
}

function isProxyMode(value: unknown): value is CodexProxyMode {
  return value === 'auto' || value === 'environment' || value === 'off'
}

function isNetworkIssue(value: unknown): value is CodexNetworkIssue {
  return value === 'proxy-initialization-failed'
    || value === 'system-proxy-detection-failed'
    || value === 'unsupported-proxy'
}

function isFailureReason(value: unknown): value is CodexAuthFailureReason {
  return value === 'account-access'
    || value === 'browser-callback'
    || value === 'browser-callback-port'
    || value === 'browser-callback-timeout'
    || value === 'device-code-disabled'
    || value === 'network'
    || value === 'token-exchange'
    || value === 'unsupported-region'
    || value === 'unknown'
}

function isLoginMethod(value: unknown): value is CodexLoginMethod {
  return value === 'browser' || value === 'device'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
