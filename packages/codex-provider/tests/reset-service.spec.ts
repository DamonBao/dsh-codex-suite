import { describe, expect, it, vi } from 'vitest'
import type { Credential, CredentialStore } from '@earendil-works/pi-ai'
import {
  CODEX_RESET_CONSUME_URL,
  CODEX_RESET_CREDITS_URL,
  CodexResetService,
  parseCodexResetCreditsPayload,
  parseCodexResetRedeemPayload,
} from '../src/reset-service.ts'

const OAUTH: Credential = {
  type: 'oauth',
  access: 'stored-access-token',
  refresh: 'refresh-token',
  expires: Date.now() + 60_000,
  accountId: 'account-123',
}

function store(current: Credential | undefined): CredentialStore {
  return {
    read: async () => current,
    list: async () => [],
    modify: async (_provider, operation) => operation(current),
    delete: async () => {},
  }
}

const AUTH = { getAuth: vi.fn(async () => ({ auth: { apiKey: 'fresh-access-token' }, source: 'OAuth' })) }

const LISTING = {
  credits: [
    {
      id: 'RateLimitResetCredit_1',
      reset_type: 'codex_rate_limits',
      status: 'available',
      granted_at: '2026-06-17T00:00:00Z',
      expires_at: '2026-07-17T00:00:00Z',
      redeem_started_at: null,
      redeemed_at: null,
      profile_image_url: 'https://example.test/avatar.png',
      profile_user_id: '@friend',
      title: 'Full reset (Weekly + 5 hr)',
      description: 'Ready to redeem',
    },
    {
      id: 'RateLimitResetCredit_2',
      reset_type: 'codex_rate_limits',
      status: 'available',
      granted_at: '2026-06-18T00:00:00Z',
      expires_at: null,
    },
  ],
  available_count: 2,
  total_earned_count: 0,
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('CodexResetService', () => {
  it('lists banked resets with account-scoped auth and redacts unknown fields', async () => {
    const fetcher = vi.fn(async (_input: string, _init: RequestInit) => jsonResponse(LISTING))
    const service = new CodexResetService(AUTH, store(OAUTH), fetcher)

    const listing = await service.list()

    expect(listing).toEqual({
      fetchedAt: expect.any(Number),
      availableCount: 2,
      credits: [
        {
          id: 'RateLimitResetCredit_1',
          status: 'available',
          resetType: 'codex_rate_limits',
          title: 'Full reset (Weekly + 5 hr)',
          description: 'Ready to redeem',
          grantedAt: Date.parse('2026-06-17T00:00:00Z'),
          expiresAt: Date.parse('2026-07-17T00:00:00Z'),
        },
        {
          id: 'RateLimitResetCredit_2',
          status: 'available',
          resetType: 'codex_rate_limits',
          title: null,
          description: null,
          grantedAt: Date.parse('2026-06-18T00:00:00Z'),
          expiresAt: null,
        },
      ],
    })
    expect(JSON.stringify(listing)).not.toContain('profile_image_url')
    expect(JSON.stringify(listing)).not.toContain('total_earned_count')
    expect(fetcher).toHaveBeenCalledOnce()
    const [url, init] = fetcher.mock.calls[0] ?? []
    expect(url).toBe(CODEX_RESET_CREDITS_URL)
    expect(init?.method).toBe('GET')
    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBe('Bearer fresh-access-token')
    expect(headers.get('chatgpt-account-id')).toBe('account-123')
  })

  it('returns null without calling OpenAI while disconnected', async () => {
    const fetcher = vi.fn()
    const service = new CodexResetService(
      { getAuth: vi.fn(async () => undefined) },
      store(undefined),
      fetcher,
    )

    await expect(service.list()).resolves.toBeNull()
    await expect(service.redeem()).resolves.toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('redeems one reset with a fresh idempotency key and no automatic retries', async () => {
    const fetcher = vi.fn(async (_input: string, _init: RequestInit) => jsonResponse({
      code: 'reset',
      credit: { id: 'RateLimitResetCredit_1', status: 'redeemed' },
      windows_reset: 2,
    }))
    const service = new CodexResetService(AUTH, store(OAUTH), fetcher, () => 'redeem-123')

    await expect(service.redeem()).resolves.toEqual({ outcome: 'reset', windowsReset: 2 })

    expect(fetcher).toHaveBeenCalledOnce()
    const [url, init] = fetcher.mock.calls[0] ?? []
    expect(url).toBe(CODEX_RESET_CONSUME_URL)
    expect(init?.method).toBe('POST')
    const headers = new Headers(init?.headers)
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('chatgpt-account-id')).toBe('account-123')
    expect(JSON.parse(String(init?.body))).toEqual({ redeem_request_id: 'redeem-123' })
  })

  it('passes an explicit credit id through when redeeming', async () => {
    const fetcher = vi.fn(async (_input: string, _init: RequestInit) => jsonResponse({
      code: 'already_redeemed',
      windows_reset: 1,
    }))
    const service = new CodexResetService(AUTH, store(OAUTH), fetcher, () => 'redeem-456')

    await expect(service.redeem('RateLimitResetCredit_1')).resolves.toEqual({
      outcome: 'already-redeemed',
      windowsReset: 1,
    })
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      redeem_request_id: 'redeem-456',
      credit_id: 'RateLimitResetCredit_1',
    })
  })

  it('surfaces HTTP failures without leaking response bodies', async () => {
    const fetcher = vi.fn(async (_input: string, _init: RequestInit) =>
      jsonResponse({ error: 'secret upstream text' }, 403))
    const service = new CodexResetService(AUTH, store(OAUTH), fetcher)

    await expect(service.list()).rejects.toThrow('HTTP 403 (sign-in required)')
    await expect(service.redeem()).rejects.toThrow('HTTP 403 (sign-in required)')
  })
})

describe('parseCodexResetCreditsPayload', () => {
  it('accepts a listing without entries and rounds fractional counts away', () => {
    expect(parseCodexResetCreditsPayload({ credits: [], available_count: 0 }, 42)).toEqual({
      fetchedAt: 42,
      availableCount: 0,
      credits: [],
    })
    expect(parseCodexResetCreditsPayload({ available_count: 3.9 }, 42).availableCount).toBe(3)
  })

  it('rejects malformed listings', () => {
    expect(() => parseCodexResetCreditsPayload(null)).toThrow('must be an object')
    expect(() => parseCodexResetCreditsPayload({ credits: [] })).toThrow('invalid available count')
    expect(() => parseCodexResetCreditsPayload({ available_count: -1 })).toThrow('invalid available count')
    expect(() => parseCodexResetCreditsPayload({ available_count: 1, credits: 'no' }))
      .toThrow('invalid credit entries')
    expect(() => parseCodexResetCreditsPayload({
      available_count: 1,
      credits: [{ status: 'available' }],
    })).toThrow('invalid credit entry')
    expect(() => parseCodexResetCreditsPayload({
      available_count: 1,
      credits: [{ id: 'x', status: '' }],
    })).toThrow('invalid credit entry')
  })
})

describe('parseCodexResetRedeemPayload', () => {
  it('maps every documented result code and tolerates missing window counts', () => {
    expect(parseCodexResetRedeemPayload({ code: 'reset', windows_reset: 2 }))
      .toEqual({ outcome: 'reset', windowsReset: 2 })
    expect(parseCodexResetRedeemPayload({ code: 'reset' }))
      .toEqual({ outcome: 'reset', windowsReset: null })
    expect(parseCodexResetRedeemPayload({ code: 'already_redeemed', windows_reset: 0 }))
      .toEqual({ outcome: 'already-redeemed', windowsReset: 0 })
    expect(parseCodexResetRedeemPayload({ code: 'nothing_to_reset' }))
      .toEqual({ outcome: 'nothing-to-reset' })
    expect(parseCodexResetRedeemPayload({ code: 'no_credit' }))
      .toEqual({ outcome: 'no-credit' })
  })

  it('rejects unknown codes and non-object payloads', () => {
    expect(() => parseCodexResetRedeemPayload({ code: 'mystery' })).toThrow('unknown result code')
    expect(() => parseCodexResetRedeemPayload('reset')).toThrow('must be an object')
    // A nonsense window count degrades to null instead of failing a redemption
    // that already succeeded server-side.
    expect(parseCodexResetRedeemPayload({ code: 'reset', windows_reset: -1 }))
      .toEqual({ outcome: 'reset', windowsReset: null })
  })
})
