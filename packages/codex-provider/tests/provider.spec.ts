import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mountSettingsProfile } from './support/settings-profile.ts'
import { describe, expect, it, onTestFinished } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type {
  CredentialInfo,
  CredentialKey,
  CredentialRecord,
  CredentialRecordEntry,
  CredentialRecordInfo,
  CredentialRef,
  ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'
import { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as CodexProvider from '../src/index.ts'

class MemoryCredentials extends CredentialProvider {
  override resolve(_ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    return Promise.resolve(undefined)
  }

  override describe(_ref: CredentialRef): Promise<CredentialInfo> {
    return Promise.resolve({ configured: false, writable: true })
  }

  override set(_ref: CredentialRef, _value: string): Promise<void> {
    return Promise.resolve()
  }

  override unset(_ref: CredentialRef): Promise<void> {
    return Promise.resolve()
  }

  override readRecord(_key: CredentialKey): Promise<CredentialRecord | undefined> {
    return Promise.resolve(undefined)
  }

  override describeRecord(_key: CredentialKey): Promise<CredentialRecordInfo> {
    return Promise.resolve({ configured: false, writable: true })
  }

  override listRecords(): Promise<readonly CredentialRecordEntry[]> {
    return Promise.resolve([])
  }

  override modifyRecord(
    _key: CredentialKey,
    _mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined> {
    return Promise.resolve(undefined)
  }

  override deleteRecord(_key: CredentialKey): Promise<void> {
    return Promise.resolve()
  }
}

describe('Codex provider plugin', () => {
  it('registers the native catalog and exposes exact context metadata', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(MemoryCredentials)
    const home = mkdtempSync(join(tmpdir(), 'codex-profile-'))
    onTestFinished(async () => { await ctx.fiber.dispose(); rmSync(home, { recursive: true, force: true }) })
    const { fiber } = await mountSettingsProfile(ctx, home, CodexProvider, 'codex-provider')

    expect(ctx.settings.describe()).toEqual([
      expect.objectContaining({
        ns: 'codex-provider',
        value: { proxyMode: 'auto' },
        applies: 'live',
      }),
    ])
    await ctx.settings.update('codex-provider', { proxyMode: 'off' })
    expect(ctx.settings.describe().find(row => row.ns === 'codex-provider')?.value).toEqual({ proxyMode: 'off' })

    expect(ctx.llm.listProviders()).toEqual([{ id: 'openai-codex', name: 'OpenAI Codex' }])
    const models = await ctx.llm.listModels('openai-codex')
    expect(models.length).toBeGreaterThan(0)
    for (const model of models) {
      const info = await ctx.llm.resolveModelInfo('openai-codex', model.id)
      expect(info.context?.contextWindow).toBeGreaterThan(0)
      expect(Number.isSafeInteger(info.context?.contextWindow)).toBe(true)
    }

    await fiber.dispose()
    expect(ctx.llm.listProviders()).toEqual([])
  })

  it('validates defaults, timer bounds, and incomplete model catalogs', () => {
    expect(CodexProvider.Config({})).toMatchObject({
      credentialRef: 'OPENAI_CODEX_OAUTH',
      transport: 'sse',
      streamIdleTimeoutMs: CodexProvider.DEFAULT_STREAM_IDLE_TIMEOUT_MS,
      ipv6CallbackBridge: true,
      proactiveRefresh: true,
    })
    expect(CodexProvider.Config({}).proxyMode.get()).toBe('auto')
    expect(CodexProvider.resolveConfig({})).toMatchObject({
      credentialRef: 'OPENAI_CODEX_OAUTH',
      transport: 'sse',
      ipv6CallbackBridge: true,
      proxyMode: 'auto',
    })
    expect(CodexProvider.resolveConfig({ ipv6CallbackBridge: false }).ipv6CallbackBridge).toBe(false)
    expect(CodexProvider.resolveConfig({ transport: 'auto' }).transport).toBe('auto')
    expect(() => CodexProvider.resolveConfig({ streamIdleTimeoutMs: 0 })).toThrow(/positive/)
    expect(() => CodexProvider.resolveConfig({ credentialRef: 'not-valid!' })).toThrow(/credential ref/)
    expect(() => CodexProvider.assertCodexCatalog({ getModels: () => [] } as never)).toThrow(/empty/)
    expect(() => CodexProvider.assertCodexCatalog({
      getModels: () => [{ id: 'bad-context', contextWindow: 0, maxTokens: 1 }],
    } as never)).toThrow(/contextWindow/)
    expect(() => CodexProvider.assertCodexCatalog({
      getModels: () => [{ id: 'bad-output', contextWindow: 1, maxTokens: 0 }],
    } as never)).toThrow(/maxTokens/)
  })
})
