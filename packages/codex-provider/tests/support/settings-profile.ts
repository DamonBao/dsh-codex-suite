/** Published DSH Loader, ConfigEditor, and Settings runtime in an isolated profile. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Timer from '@deepseek-ai/cordis-plugin-timer'
import { initProfile, mountRootInclude, readProfilePatches, type ProfileContext } from '@deepseek-ai/dsh-app-boot'
import ConfigEditor from '@deepseek-ai/dsh-config-editor'
import Hmr from '@deepseek-ai/dsh-hmr'
import Settings from '@deepseek-ai/dsh-settings'

export async function mountSettingsProfile(ctx: Context, home: string, plugin: Plugin, id: string, config: object = {}) {
  const dir = join(home, 'profile')
  initProfile(dir, ['test-bundle'])
  const bundle = join(dir, 'node_modules', 'test-bundle')
  mkdirSync(bundle, { recursive: true })
  writeFileSync(join(home, 'package.json'), '{"name":"test-installation"}\n')
  writeFileSync(join(bundle, 'package.json'), JSON.stringify({ name: 'test-bundle', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } } }))
  writeFileSync(join(bundle, 'cordis.patch.yml'), JSON.stringify([{ insert: [
    { id: 'timer', name: 'cordis:timer' },
    { id: 'hmr', name: 'cordis:hmr', config: { root: [], ignored: [], debounce: 0 } },
    { id: 'config-editor', name: 'cordis:editor' },
    { id: 'settings', name: 'cordis:settings' },
    { id, name: 'cordis:subject', config },
  ] }]))
  writeFileSync(join(dir, 'cordis.yml'), '[]\n')
  const profile: ProfileContext = {
    name: 'test', startedBundles: ['test-bundle'], dir, patchPath: join(dir, 'cordis.patch.yml'),
    installAnchor: join(home, 'package.json'), cwd: home, home, overlays: [], telemetryDisabledEnv: undefined,
  }
  await ctx.plugin(Loader).await()
  ctx.provide('profileContext', profile)
  ctx.provide('appReady', { onReady: (listener: () => void) => { listener(); return () => {} } })
  Object.assign(ctx.loader.builtins, { timer: Timer, hmr: Hmr, editor: ConfigEditor, settings: Settings, subject: plugin })
  await mountRootInclude(ctx, join(dir, 'cordis.yml'), readProfilePatches('test', profile))
  await ctx.loader.await()
  const entry = ctx.configEditor.entries().find(row => row.options.id === id)!
  await entry.fiber!.await()
  return { profile, entry, fiber: entry.fiber!, patchPath: profile.patchPath }
}
