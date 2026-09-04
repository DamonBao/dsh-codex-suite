import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-store', () => ({
  createSnapshotStore: <T>(initial: T) => {
    let state = structuredClone(initial)
    const listeners = new Set<() => void>()
    return {
      getSnapshot: () => state,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      update: (mutate: (draft: T) => void) => {
        state = structuredClone(state)
        mutate(state)
        for (const listener of listeners) listener()
      },
    }
  },
}))

import { CodexAuthCardController } from '../src/client/controller.ts'
import type { CodexAuthRpcClient } from '../src/rpc-contract.ts'
import type {
  CodexAuthState,
  CodexNetworkState,
  CodexResetCreditsSnapshot,
  CodexResetRedeemOutcome,
  CodexUsageSnapshot,
} from '../src/types.ts'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const NETWORK: CodexNetworkState = {
  route: 'direct-or-tun',
  activeProxyMode: 'auto',
  configuredProxyMode: 'auto',
  restartRequired: false,
}

const RESET_CREDITS: CodexResetCreditsSnapshot = {
  fetchedAt: 42,
  availableCount: 1,
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
  ],
}

function remote(overrides: Partial<CodexAuthRpcClient> = {}): CodexAuthRpcClient {
  const disconnected: CodexAuthState = { phase: 'disconnected' }
  return {
    status: async () => ({ ok: true, value: disconnected }),
    network: async () => ({ ok: true, value: NETWORK }),
    setProxyMode: async mode => ({
      ok: true,
      value: { ...NETWORK, configuredProxyMode: mode, restartRequired: mode !== NETWORK.activeProxyMode },
    }),
    usage: async () => ({ ok: true, value: null }),
    resetCredits: async () => ({ ok: true, value: RESET_CREDITS }),
    redeemResetCredit: async () => ({ ok: true, value: { outcome: 'reset', windowsReset: 2 } }),
    login: async () => ({ ok: true, value: { phase: 'starting', method: 'browser' } }),
    cancel: async () => ({ ok: true, value: disconnected }),
    logout: async () => ({ ok: true, value: disconnected }),
    ...overrides,
  }
}

/** Status reply for an account the redemption dialog can act on. */
function connectedStatus() {
  return vi.fn(async () => ({ ok: true as const, value: { phase: 'connected' as const, expiresAt: 100 } }))
}

const USAGE: CodexUsageSnapshot = {
  fetchedAt: 42,
  planType: 'plus',
  limitReached: false,
  primary: null,
  secondary: { usedPercent: 24, resetAt: 1_700_000_000_000, limitWindowSeconds: 604_800 },
  credits: null,
  resetCreditsAvailable: 1,
}

describe('CodexAuthCardController', () => {
  it('publishes connected auth without waiting for a slow usage request', async () => {
    const usage = deferred<Awaited<ReturnType<CodexAuthRpcClient['usage']>>>()
    const controller = new CodexAuthCardController(remote({
      status: vi.fn(async () => ({ ok: true as const, value: { phase: 'connected' as const, expiresAt: 100 } })),
      usage: vi.fn(() => usage.promise),
    }))

    const loading = controller.load()
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot()).toMatchObject({
        status: 'ready',
        auth: { phase: 'connected' },
        usageStatus: 'loading',
      })
    })

    usage.resolve({ ok: true, value: USAGE })
    await loading
    expect(controller.store.getSnapshot()).toMatchObject({ usageStatus: 'ready', usage: USAGE })
  })

  it('does not let a stale load resurrect auth after logout', async () => {
    const status = deferred<Awaited<ReturnType<CodexAuthRpcClient['status']>>>()
    const usage = deferred<Awaited<ReturnType<CodexAuthRpcClient['usage']>>>()
    const controller = new CodexAuthCardController(remote({
      status: vi.fn(() => status.promise),
      usage: vi.fn(() => usage.promise),
    }))

    const loading = controller.load()
    controller.logout()
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot().auth).toEqual({ phase: 'disconnected' })
      expect(controller.store.getSnapshot().action).toBeNull()
    })

    status.resolve({ ok: true, value: { phase: 'connected', expiresAt: 100 } })
    usage.resolve({ ok: true, value: USAGE })
    await loading
    expect(controller.store.getSnapshot()).toMatchObject({
      auth: { phase: 'disconnected' },
      usage: null,
    })
  })

  it('surfaces a failed network-status RPC instead of staying in loading', async () => {
    const controller = new CodexAuthCardController(remote({
      network: vi.fn(async () => { throw new Error('connection reset') }),
    }))

    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({
      networkStatus: 'error',
      network: null,
    })
  })

  it('publishes the restart-required snapshot after saving proxy mode', async () => {
    const setProxyMode = vi.fn(async () => ({
      ok: true as const,
      value: { ...NETWORK, configuredProxyMode: 'off' as const, restartRequired: true },
    }))
    const controller = new CodexAuthCardController(remote({ setProxyMode }))
    await controller.load()

    controller.setProxyMode('off')
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot()).toMatchObject({
        action: null,
        network: { activeProxyMode: 'auto', configuredProxyMode: 'off', restartRequired: true },
      })
    })
    expect(setProxyMode).toHaveBeenCalledWith('off')
  })

  it('clears usage and stays actionable when the Host reports reauth-required', async () => {
    const controller = new CodexAuthCardController(remote({
      status: vi.fn(async () => ({ ok: true as const, value: { phase: 'reauth-required' as const } })),
      usage: vi.fn(async () => ({ ok: true as const, value: USAGE })),
    }))

    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready',
      auth: { phase: 'reauth-required' },
      usage: null,
      action: null,
    })
  })

  it('publishes the banked-reset listing for the redemption dialog', async () => {
    const controller = new CodexAuthCardController(remote())
    controller.loadResetCredits()
    expect(controller.store.getSnapshot()).toMatchObject({ resetStatus: 'loading', resetCredits: null })
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot()).toMatchObject({
        resetStatus: 'ready',
        resetCredits: RESET_CREDITS,
      })
    })
  })

  it('silently loads reset details when the usage summary reports resets', async () => {
    const resetCredits = vi.fn(async () => ({ ok: true as const, value: RESET_CREDITS }))
    const controller = new CodexAuthCardController(remote({
      status: connectedStatus(),
      usage: vi.fn(async () => ({ ok: true as const, value: USAGE })),
      resetCredits,
    }))

    await controller.load()
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot()).toMatchObject({
        resetStatus: 'ready',
        resetCredits: RESET_CREDITS,
      })
    })
    expect(resetCredits).toHaveBeenCalledOnce()
  })

  it('does not fetch reset details when no resets are available', async () => {
    const resetCredits = vi.fn(async () => ({ ok: true as const, value: RESET_CREDITS }))
    const controller = new CodexAuthCardController(remote({
      status: connectedStatus(),
      usage: vi.fn(async () => ({ ok: true as const, value: { ...USAGE, resetCreditsAvailable: 0 } })),
      resetCredits,
    }))

    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({ resetStatus: 'idle', resetCredits: null })
    expect(resetCredits).not.toHaveBeenCalled()
  })

  it('reports an unreadable listing instead of staying in loading', async () => {
    const controller = new CodexAuthCardController(remote({
      resetCredits: vi.fn(async () => ({ ok: false as const, error: { code: 'internal', message: '', details: {} } })),
    }))
    controller.loadResetCredits()
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot()).toMatchObject({ resetStatus: 'error', resetCredits: null })
    })
  })

  it('redeems one banked reset, then silently refreshes usage and the listing', async () => {
    const usage = vi.fn(async () => ({ ok: true as const, value: { ...USAGE, resetCreditsAvailable: 0 } }))
    const resetCredits = vi.fn(async () => ({ ok: true as const, value: RESET_CREDITS }))
    const redeemResetCredit = vi.fn(async () => ({ ok: true as const, value: { outcome: 'reset', windowsReset: 2 } as CodexResetRedeemOutcome }))
    const controller = new CodexAuthCardController(remote({
      status: connectedStatus(),
      usage,
      resetCredits,
      redeemResetCredit,
    }))
    await controller.load()
    controller.loadResetCredits()
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot().resetStatus).toBe('ready')
    })

    controller.redeemResetCredit()
    expect(controller.store.getSnapshot()).toMatchObject({
      action: 'reset-redeem',
      redeemStatus: 'redeeming',
    })
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot()).toMatchObject({
        action: null,
        redeemStatus: 'done',
        redeemResult: { outcome: 'reset', windowsReset: 2 },
      })
    })
    expect(redeemResetCredit).toHaveBeenCalledWith(null)
    await vi.waitFor(() => {
      expect(usage.mock.calls.length).toBeGreaterThanOrEqual(2)
      expect(resetCredits.mock.calls.length).toBeGreaterThanOrEqual(2)
    })
    // The silent refresh keeps the settled redemption result visible.
    expect(controller.store.getSnapshot().redeemStatus).toBe('done')
    expect(controller.store.getSnapshot().resetStatus).toBe('ready')
  })

  it('keeps the dialog actionable when a redemption fails', async () => {
    const controller = new CodexAuthCardController(remote({
      status: connectedStatus(),
      redeemResetCredit: vi.fn(async () => ({ ok: false as const, error: { code: 'internal', message: '', details: {} } })),
    }))
    await controller.load()
    controller.redeemResetCredit()
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot()).toMatchObject({
        action: null,
        redeemStatus: 'error',
        redeemResult: null,
        actionFailed: false,
      })
    })
  })

  it('does not run a second redemption while one is in flight', async () => {
    const redeemResetCredit = vi.fn(async () => ({ ok: true as const, value: { outcome: 'reset', windowsReset: 2 } as CodexResetRedeemOutcome }))
    const controller = new CodexAuthCardController(remote({
      status: connectedStatus(),
      redeemResetCredit,
    }))
    await controller.load()

    controller.redeemResetCredit()
    controller.redeemResetCredit()
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot().redeemStatus).toBe('done')
    })
    expect(redeemResetCredit).toHaveBeenCalledOnce()
  })

  it('clears reset state when the account disconnects mid-dialog', async () => {
    const controller = new CodexAuthCardController(remote({ status: connectedStatus() }))
    await controller.load()
    controller.loadResetCredits()
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot().resetStatus).toBe('ready')
    })
    controller.redeemResetCredit()
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot().redeemStatus).toBe('done')
    })

    controller.logout()
    await vi.waitFor(() => {
      expect(controller.store.getSnapshot().auth).toEqual({ phase: 'disconnected' })
    })
    expect(controller.store.getSnapshot()).toMatchObject({
      resetStatus: 'idle',
      resetCredits: null,
      redeemStatus: 'idle',
      redeemResult: null,
    })
  })
})
