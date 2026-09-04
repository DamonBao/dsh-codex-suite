/**
 * Host-only Codex banked rate-limit resets ("resets"): list the credits
 * granted to the account and redeem one to restore eligible limit windows.
 */

import { randomUUID } from 'node:crypto'
import type { CredentialStore } from '@earendil-works/pi-ai'
import { CODEX_PROVIDER } from './credential-store.ts'
import type { CodexResetCredit, CodexResetCreditsSnapshot, CodexResetRedeemOutcome } from './types.ts'
import { codexAccountIdOf, codexWhamHeaders } from './usage-service.ts'
import type { CodexUsageFetch, CodexUsageModels } from './usage-service.ts'

/** OpenAI's banked-reset listing endpoint used by Codex clients. */
export const CODEX_RESET_CREDITS_URL = 'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits'
/** OpenAI's banked-reset redemption endpoint used by Codex clients. */
export const CODEX_RESET_CONSUME_URL = `${CODEX_RESET_CREDITS_URL}/consume`
const RESET_TIMEOUT_MS = 15_000

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

/** ISO-8601 timestamp to epoch milliseconds; null when absent or unparsable. */
function nullableTimestamp(value: unknown): number | null {
  const text = nullableText(value)
  if (text === null) return null
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? parsed : null
}

/** Validate and redact one untrusted reset-credit entry. */
function parseResetCredit(value: unknown): CodexResetCredit {
  const input = record(value)
  if (input === undefined
    || typeof input.id !== 'string'
    || input.id.length === 0
    || typeof input.status !== 'string'
    || input.status.length === 0) {
    throw new Error('Codex reset-credits response contains an invalid credit entry')
  }
  return {
    id: input.id,
    status: input.status,
    resetType: nullableText(input.reset_type),
    title: nullableText(input.title),
    description: nullableText(input.description),
    grantedAt: nullableTimestamp(input.granted_at),
    expiresAt: nullableTimestamp(input.expires_at),
  }
}

/** Validate and redact one untrusted rate-limit-reset-credits listing. */
export function parseCodexResetCreditsPayload(value: unknown, fetchedAt = Date.now()): CodexResetCreditsSnapshot {
  const input = record(value)
  if (input === undefined) throw new Error('Codex reset-credits response must be an object')
  if (typeof input.available_count !== 'number'
    || !Number.isFinite(input.available_count)
    || input.available_count < 0) {
    throw new Error('Codex reset-credits response contains an invalid available count')
  }
  if (input.credits !== undefined && input.credits !== null && !Array.isArray(input.credits)) {
    throw new Error('Codex reset-credits response contains invalid credit entries')
  }
  const credits = (Array.isArray(input.credits) ? input.credits : []).map(parseResetCredit)
  return {
    fetchedAt,
    availableCount: Math.trunc(input.available_count),
    credits,
  }
}

/** Validate one untrusted consume response into a browser-safe outcome. */
export function parseCodexResetRedeemPayload(value: unknown): CodexResetRedeemOutcome {
  const input = record(value)
  if (input === undefined) throw new Error('Codex reset-credits consume response must be an object')
  const windowsReset = typeof input.windows_reset === 'number'
    && Number.isFinite(input.windows_reset)
    && input.windows_reset >= 0
    ? Math.trunc(input.windows_reset)
    : null
  switch (input.code) {
    case 'reset': return { outcome: 'reset', windowsReset }
    case 'already_redeemed': return { outcome: 'already-redeemed', windowsReset }
    case 'nothing_to_reset': return { outcome: 'nothing-to-reset' }
    case 'no_credit': return { outcome: 'no-credit' }
    default: throw new Error('Codex reset-credits consume response contains an unknown result code')
  }
}

/**
 * List and redeem banked resets with a fresh pi-ai bearer while keeping all
 * secrets on the Host. `availableCount` is authoritative; the backend may cap
 * the number of listed entries, so `credits.length` is not a substitute.
 */
export class CodexResetService {
  constructor(
    private readonly models: CodexUsageModels,
    private readonly credentials: CredentialStore,
    private readonly fetcher: CodexUsageFetch = fetch,
    private readonly newRequestId: () => string = randomUUID,
  ) {}

  /** Return null when disconnected; otherwise return a validated credit listing. */
  async list(): Promise<CodexResetCreditsSnapshot | null> {
    const headers = await this.authHeaders()
    if (headers === null) return null
    const response = await this.fetcher(CODEX_RESET_CREDITS_URL, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(RESET_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`Codex reset-credits request failed with HTTP ${response.status}${authHint(response.status)}`)
    }
    return parseCodexResetCreditsPayload(await response.json())
  }

  /**
   * Redeem one banked reset. `creditId` omitted lets OpenAI choose; each call
   * spends a fresh idempotency key and is never retried automatically, so an
   * ambiguous network failure never consumes a second credit.
   */
  async redeem(creditId?: string | null): Promise<CodexResetRedeemOutcome | null> {
    const headers = await this.authHeaders()
    if (headers === null) return null
    headers.set('content-type', 'application/json')
    const body: Record<string, string> = { redeem_request_id: this.newRequestId() }
    if (typeof creditId === 'string' && creditId.length > 0) body.credit_id = creditId
    const response = await this.fetcher(CODEX_RESET_CONSUME_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(RESET_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`Codex reset-credits consume failed with HTTP ${response.status}${authHint(response.status)}`)
    }
    return parseCodexResetRedeemPayload(await response.json())
  }

  /** Fresh account-scoped headers, or null while disconnected. */
  private async authHeaders(): Promise<Headers | null> {
    const auth = await this.models.getAuth(CODEX_PROVIDER)
    const access = auth?.auth.apiKey
    if (access === undefined || access.length === 0) return null
    const accountId = codexAccountIdOf(await this.credentials.read(CODEX_PROVIDER))
    return codexWhamHeaders(access, accountId)
  }
}

function authHint(status: number): string {
  return status === 401 || status === 403 ? ' (sign-in required)' : ''
}
