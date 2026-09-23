/** Old settings backups import once, preserving profile edits and source credentials. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, type Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { describe, expect, it, onTestFinished } from 'vitest'
import { mountSettingsProfile } from './support/settings-profile.ts'
import { importLegacySettings, missingSettings } from '../src/legacy-settings.ts'

const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
  options: z.dict(z.string()).default({}).volatile(),
  token: z.string().role('secret').volatile(),
})
interface Config { enabled: Volatile<boolean>; options: Volatile<Record<string, string>>; token: Volatile<string | undefined> }

function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'plugin-legacy-settings-'))
  const contexts: Context[] = []
  onTestFinished(async () => {
    for (const ctx of contexts) await ctx.fiber.dispose()
    rmSync(home, { recursive: true, force: true })
  })
  const start = async () => {
    const ctx = new Context()
    contexts.push(ctx)
    let live: Config | undefined
    const mounted = await mountSettingsProfile(ctx, home, {
      Config, inject: ['settings'],
      apply(child: Context, config: Config) {
        live = config
        importLegacySettings(child, 'old-name', 'new-entry')
      },
    }, 'new-entry')
    return { ctx, live: () => live!, ...mounted }
  }
  return { home, start, marker: join(home, 'profile', '.plugin-settings-migrations', 'new-entry.json') }
}

describe('legacy settings migration', () => {
  it('keeps false, arrays and newer nested keys while importing missing fields', () => {
    expect(missingSettings({ enabled: true, models: [1], options: { old: 'keep', edited: 'old' } },
      { enabled: false, models: [], options: { edited: 'new' } })).toEqual({ options: { old: 'keep' } })
  })

  it.each(['settings.yaml', 'settings.yaml.imported'])('imports an alias from %s, preserves the source and never reimports a reset field', async filename => {
    const f = fixture()
    const original = 'old-name:\n  enabled: false\n  options: { preserved: legacy }\n  token: secret-fixture\n'
    writeFileSync(join(f.home, filename), original)
    const first = await f.start()
    await expect.poll(() => existsSync(f.marker)).toBe(true)
    expect(first.live().enabled.get()).toBe(false)
    expect(first.live().token.get()).toBe('secret-fixture')
    expect(first.ctx.settings.describe({ redactSecrets: true })[0]?.value).not.toHaveProperty('token')
    expect(readFileSync(join(f.home, 'settings.yaml.imported'), 'utf8')).toBe(original)
    await first.ctx.settings.update('new-entry', { enabled: true, options: { preserved: 'edited' } })
    await first.ctx.fiber.dispose()
    const second = await f.start()
    expect(second.live().enabled.get()).toBe(true)
    expect(second.live().options.get()).toEqual({ preserved: 'edited' })
  })

  it('preserves profile overrides when a backup is imported for the first time', async () => {
    const f = fixture()
    writeFileSync(join(f.home, 'settings.yaml.imported'), 'old-name:\n  enabled: true\n  options: { old: retained, edited: legacy }\n')
    mkdirSync(join(f.home, 'profile'))
    writeFileSync(join(f.home, 'profile', 'cordis.patch.yml'), JSON.stringify([{ id: 'new-entry', config: { enabled: false, options: { edited: 'current' } } }]))
    const result = await f.start()
    await expect.poll(() => existsSync(f.marker)).toBe(true)
    expect(result.live().enabled.get()).toBe(false)
    expect(result.live().options.get()).toEqual({ old: 'retained', edited: 'current' })
  })
})
