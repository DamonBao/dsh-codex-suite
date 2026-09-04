import { describe, expect, it, vi } from 'vitest'
import {
  CODEX_AUTH_RPC_CHANNEL,
  createCodexAuthRpcClient,
  parseCodexAuthState,
  parseCodexNetworkState,
  parseCodexResetCreditsSnapshot,
  parseCodexResetRedeemOutcome,
  parseCodexUsageSnapshot,
} from '../src/rpc-contract.ts'
import { handleCodexAuthRpc } from '../src/rpc.ts'

const NETWORK = {
  route: 'direct-or-tun' as const,
  activeProxyMode: 'auto' as const,
  configuredProxyMode: 'auto' as const,
  restartRequired: false,
}

const RESET_CREDITS = {
  fetchedAt: 1_700_000_000_000,
  availableCount: 2,
  credits: [
    {
      id: 'RateLimitResetCredit_1',
      status: 'available',
      resetType: 'codex_rate_limits',
      title: 'Full reset (Weekly + 5 hr)',
      description: 'Ready to redeem',
      grantedAt: 1_781_635_200_000,
      expiresAt: 1_784_284_800_000,
    },
    {
      id: 'RateLimitResetCredit_2',
      status: 'available',
      resetType: null,
      title: null,
      description: null,
      grantedAt: null,
      expiresAt: null,
    },
  ],
}

describe('Codex authentication RPC', () => {
  it('validates Host requests and redacts internal failures', async () => {
    const service = {
      status: vi.fn(async () => ({ phase: 'disconnected' as const })),
      network: vi.fn(async () => NETWORK),
      setProxyMode: vi.fn(async mode => ({
        ...NETWORK,
        configuredProxyMode: mode,
        restartRequired: mode !== NETWORK.activeProxyMode,
      })),
      usage: vi.fn(async () => null),
      resetCredits: vi.fn(async () => RESET_CREDITS),
      redeemResetCredit: vi.fn(async () => ({ outcome: 'nothing-to-reset' as const })),
      login: vi.fn(() => ({ phase: 'starting' as const, method: 'browser' as const })),
      cancel: vi.fn(async () => ({ phase: 'disconnected' as const })),
      logout: vi.fn(async () => { throw new Error('secret provider response') }),
    }

    await expect(handleCodexAuthRpc(service, 'status', {})).resolves.toEqual({
      ok: true, value: { phase: 'disconnected' },
    })
    await expect(handleCodexAuthRpc(service, 'network', {})).resolves.toEqual({
      ok: true, value: NETWORK,
    })
    await expect(handleCodexAuthRpc(service, 'proxy-mode', { mode: 'off' })).resolves.toEqual({
      ok: true,
      value: { ...NETWORK, configuredProxyMode: 'off', restartRequired: true },
    })
    await expect(handleCodexAuthRpc(service, 'proxy-mode', { mode: 'bad' })).resolves.toMatchObject({
      ok: false, error: { code: 'bad-request' },
    })
    await expect(handleCodexAuthRpc(service, 'usage', {})).resolves.toEqual({
      ok: true, value: null,
    })
    await expect(handleCodexAuthRpc(service, 'reset-credits', {})).resolves.toEqual({
      ok: true, value: RESET_CREDITS,
    })
    await expect(handleCodexAuthRpc(service, 'reset-credits', { creditId: null })).resolves.toMatchObject({
      ok: false, error: { code: 'bad-request' },
    })
    await expect(handleCodexAuthRpc(service, 'reset-credits/consume', { creditId: null })).resolves.toEqual({
      ok: true, value: { outcome: 'nothing-to-reset' },
    })
    expect(service.redeemResetCredit).toHaveBeenCalledWith(null)
    await expect(handleCodexAuthRpc(service, 'reset-credits/consume', {
      creditId: 'RateLimitResetCredit_1',
    })).resolves.toEqual({
      ok: true, value: { outcome: 'nothing-to-reset' },
    })
    expect(service.redeemResetCredit).toHaveBeenCalledWith('RateLimitResetCredit_1')
    // An omitted creditId is valid: OpenAI then chooses which reset to spend.
    await expect(handleCodexAuthRpc(service, 'reset-credits/consume', {})).resolves.toEqual({
      ok: true, value: { outcome: 'nothing-to-reset' },
    })
    for (const payload of [{ creditId: 42 }, { creditId: '' }, { creditId: 'x', extra: 1 }]) {
      await expect(handleCodexAuthRpc(service, 'reset-credits/consume', payload)).resolves.toMatchObject({
        ok: false, error: { code: 'bad-request' },
      })
    }
    const failing = {
      ...service,
      redeemResetCredit: vi.fn(async () => { throw new Error('secret provider response') }),
    }
    const failed = await handleCodexAuthRpc(failing, 'reset-credits/consume', { creditId: null })
    expect(failed).toMatchObject({ ok: false, error: { code: 'internal' } })
    expect(JSON.stringify(failed)).not.toContain('secret')
    const failedListing = await handleCodexAuthRpc(
      { ...service, resetCredits: vi.fn(async () => { throw new Error('secret provider response') }) },
      'reset-credits',
      {},
    )
    expect(failedListing).toMatchObject({ ok: false, error: { code: 'internal' } })
    expect(JSON.stringify(failedListing)).not.toContain('secret')
    await expect(handleCodexAuthRpc(service, 'login', { method: 'browser' })).resolves.toEqual({
      ok: true, value: { phase: 'starting', method: 'browser' },
    })
    await expect(handleCodexAuthRpc(service, 'login', { method: 'bad' })).resolves.toMatchObject({
      ok: false, error: { code: 'bad-request' },
    })
    const failedLogout = await handleCodexAuthRpc(service, 'logout', {})
    expect(failedLogout).toMatchObject({ ok: false, error: { code: 'internal' } })
    expect(JSON.stringify(failedLogout)).not.toContain('secret')
  })

  it('validates untrusted Host replies before updating browser state', async () => {
    const call = vi.fn(async () => ({ ok: true as const, value: { phase: 'connected', expiresAt: 42 } }))
    const client = createCodexAuthRpcClient({ call })

    await expect(client.status()).resolves.toEqual({
      ok: true, value: { phase: 'connected', expiresAt: 42 },
    })
    expect(parseCodexAuthState({ phase: 'connected', expiresAt: 'secret' })).toBeUndefined()
    expect(parseCodexAuthState({ phase: 'reauth-required' })).toEqual({ phase: 'reauth-required' })
    expect(parseCodexAuthState({ phase: 'reauth-required', accessToken: 'secret' }))
      .toEqual({ phase: 'reauth-required' })
    expect(parseCodexAuthState({ phase: 'awaiting-device', verificationUri: 'https://x', userCode: 'ABCD' }))
      .toEqual({ phase: 'awaiting-device', verificationUri: 'https://x', userCode: 'ABCD' })
    expect(parseCodexAuthState({ phase: 'failed', method: 'browser', reason: 'browser-callback' }))
      .toEqual({ phase: 'failed', method: 'browser', reason: 'browser-callback' })
    expect(parseCodexAuthState({ phase: 'failed', method: 'browser', reason: 'browser-callback-port' }))
      .toEqual({ phase: 'failed', method: 'browser', reason: 'browser-callback-port' })
    expect(parseCodexAuthState({ phase: 'failed', method: 'browser', reason: 'browser-callback-timeout' }))
      .toEqual({ phase: 'failed', method: 'browser', reason: 'browser-callback-timeout' })
    expect(parseCodexAuthState({ phase: 'failed', method: 'browser', reason: 'unsupported-region' }))
      .toEqual({ phase: 'failed', method: 'browser', reason: 'unsupported-region' })
    expect(parseCodexAuthState({ phase: 'failed', method: 'browser', reason: 'secret-response-text' }))
      .toBeUndefined()
    expect(parseCodexNetworkState({ ...NETWORK, route: 'system-proxy', proxyUrl: 'http://secret@proxy' }))
      .toEqual({ ...NETWORK, route: 'system-proxy' })
    expect(parseCodexNetworkState({ ...NETWORK, issue: 'unsupported-proxy' }))
      .toEqual({ ...NETWORK, issue: 'unsupported-proxy' })
    expect(parseCodexNetworkState({ ...NETWORK, route: 'host-dispatcher' }))
      .toEqual({ ...NETWORK, route: 'host-dispatcher' })
    expect(parseCodexNetworkState({ ...NETWORK, issue: 'system-proxy-detection-failed' }))
      .toEqual({ ...NETWORK, issue: 'system-proxy-detection-failed' })
    expect(parseCodexNetworkState({ ...NETWORK, configuredProxyMode: 'secret' })).toBeUndefined()
    expect(parseCodexNetworkState({ route: 'direct-or-tun' })).toBeUndefined()
    expect(parseCodexNetworkState({ ...NETWORK, route: 'socks-proxy' })).toBeUndefined()
  })

  it('sends validated proxy-mode writes over the plugin channel', async () => {
    const value = { ...NETWORK, configuredProxyMode: 'off' as const, restartRequired: true }
    const call = vi.fn(async () => ({ ok: true as const, value }))
    const client = createCodexAuthRpcClient({ call })

    await expect(client.setProxyMode('off')).resolves.toEqual({ ok: true, value })
    expect(call).toHaveBeenCalledWith(
      CODEX_AUTH_RPC_CHANNEL,
      'proxy-mode',
      { mode: 'off' },
      undefined,
    )
  })

  it('accepts only secret-free, structurally valid usage snapshots', async () => {
    const snapshot = {
      fetchedAt: 1_700_000_000_000,
      planType: 'plus',
      limitReached: false,
      primary: null,
      secondary: { usedPercent: 24, resetAt: 1_700_100_000_000, limitWindowSeconds: 604_800 },
      credits: { hasCredits: true, unlimited: false, balance: 12.5 },
      resetCreditsAvailable: 3,
    }
    const call = vi.fn(async (_channel: string, endpoint: string) => ({
      ok: true as const,
      value: endpoint === 'usage' ? snapshot : { phase: 'connected', expiresAt: 42 },
    }))
    const client = createCodexAuthRpcClient({ call })

    await expect(client.usage()).resolves.toEqual({ ok: true, value: snapshot })
    expect(parseCodexUsageSnapshot({ ...snapshot, secondary: { ...snapshot.secondary, usedPercent: 101 } }))
      .toBeUndefined()
    expect(parseCodexUsageSnapshot({ ...snapshot, accessToken: 'secret' })).toEqual(snapshot)
    expect(parseCodexUsageSnapshot({ ...snapshot, resetCreditsAvailable: null }))
      .toEqual({ ...snapshot, resetCreditsAvailable: null })
    expect(parseCodexUsageSnapshot({ ...snapshot, resetCreditsAvailable: -1 })).toBeUndefined()
    expect(parseCodexUsageSnapshot({ ...snapshot, resetCreditsAvailable: 'two' })).toBeUndefined()
  })

  it('sends banked-reset reads and redemptions over the plugin channel', async () => {
    const call = vi.fn(async (_channel: string, endpoint: string) => ({
      ok: true as const,
      value: endpoint === 'reset-credits' ? RESET_CREDITS : { outcome: 'reset' as const, windowsReset: 2 },
    }))
    const client = createCodexAuthRpcClient({ call })

    await expect(client.resetCredits()).resolves.toEqual({ ok: true, value: RESET_CREDITS })
    expect(call).toHaveBeenCalledWith(CODEX_AUTH_RPC_CHANNEL, 'reset-credits', {}, undefined)
    await expect(client.redeemResetCredit(null)).resolves.toEqual({
      ok: true,
      value: { outcome: 'reset', windowsReset: 2 },
    })
    expect(call).toHaveBeenCalledWith(
      CODEX_AUTH_RPC_CHANNEL,
      'reset-credits/consume',
      { creditId: null },
      undefined,
    )
  })

  it('accepts only secret-free, structurally valid banked-reset payloads', () => {
    expect(parseCodexResetCreditsSnapshot(RESET_CREDITS)).toEqual(RESET_CREDITS)
    expect(parseCodexResetCreditsSnapshot({
      ...RESET_CREDITS,
      credits: [
        ...RESET_CREDITS.credits,
        { id: 'x', status: 'available', secret: 'leak', accessToken: 'leak' },
      ],
    })).toEqual({
      ...RESET_CREDITS,
      credits: [
        ...RESET_CREDITS.credits,
        { id: 'x', status: 'available', resetType: null, title: null, description: null, grantedAt: null, expiresAt: null },
      ],
    })
    expect(JSON.stringify(parseCodexResetCreditsSnapshot({
      ...RESET_CREDITS,
      credits: [{ ...RESET_CREDITS.credits[0], profileImageUrl: 'secret' }],
    }))).not.toContain('secret')
    expect(parseCodexResetCreditsSnapshot({ ...RESET_CREDITS, availableCount: -1 })).toBeUndefined()
    expect(parseCodexResetCreditsSnapshot({ ...RESET_CREDITS, credits: null })).toBeUndefined()
    expect(parseCodexResetCreditsSnapshot({
      ...RESET_CREDITS,
      credits: [{ id: '', status: 'available' }],
    })).toBeUndefined()
    expect(parseCodexResetCreditsSnapshot({
      ...RESET_CREDITS,
      credits: [{ id: 'x', status: 'available', title: 42 }],
    })).toBeUndefined()

    expect(parseCodexResetRedeemOutcome({ outcome: 'reset', windowsReset: 2 }))
      .toEqual({ outcome: 'reset', windowsReset: 2 })
    expect(parseCodexResetRedeemOutcome({ outcome: 'reset', windowsReset: null }))
      .toEqual({ outcome: 'reset', windowsReset: null })
    expect(parseCodexResetRedeemOutcome({ outcome: 'already-redeemed', windowsReset: 0 }))
      .toEqual({ outcome: 'already-redeemed', windowsReset: 0 })
    expect(parseCodexResetRedeemOutcome({ outcome: 'nothing-to-reset' }))
      .toEqual({ outcome: 'nothing-to-reset' })
    expect(parseCodexResetRedeemOutcome({ outcome: 'no-credit' })).toEqual({ outcome: 'no-credit' })
    expect(parseCodexResetRedeemOutcome({ outcome: 'reset', windowsReset: -1 })).toBeUndefined()
    expect(parseCodexResetRedeemOutcome({ outcome: 'reset', windowsReset: 'two' })).toBeUndefined()
    expect(parseCodexResetRedeemOutcome({ outcome: 'mystery' })).toBeUndefined()
    expect(parseCodexResetRedeemOutcome({ outcome: 'reset', creditId: 'secret' }))
      .toEqual({ outcome: 'reset', windowsReset: null })
  })
})
