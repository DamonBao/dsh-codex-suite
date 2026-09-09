/** Host half keeps the setting durable and exposes it on its own fenced RPC route. */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { SettingsProvider, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { afterEach, describe, expect, it } from 'vitest'
import { CONVERSATION_PACKAGE_NAME, CONVERSATION_PACKAGE_VERSION } from '../src/package-meta.ts'
import { apply, Config } from '../src/plugin.ts'
import { CONVERSATION_SETTINGS_RPC, CONVERSATION_SETTINGS_RPC_CHANNEL } from '../src/settings-api.ts'
import { CONVERSATION_SETTINGS_NS, DEFAULT_CONVERSATION_SETTINGS } from '../src/settings.ts'

/** In-memory settings provider -- same shape as the Harness's own specs. */
class MemorySettings extends SettingsProvider {
  readonly writable = true
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve({}) }
  protected persist(_ns: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve()
  }
}

/** The prefix route the plugin registers on the webServer stub. */
interface RouteRegistration {
  path: string
  handler: (req: never, res: never) => void | Promise<void>
}

interface RpcReply {
  status: number
  result: unknown
}

const tempProfiles = new Set<string>()

afterEach(() => {
  for (const directory of tempProfiles) rmSync(directory, { recursive: true, force: true })
  tempProfiles.clear()
})

function profileBaseUrl(specifier: string, bundled = true): string {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-conversation-ui-profile-'))
  tempProfiles.add(directory)
  writeFileSync(join(directory, 'package.json'), JSON.stringify({
    name: 'dsh-profile-test',
    private: true,
    dsh: { profile: { bundles: bundled ? [CONVERSATION_PACKAGE_NAME] : [] } },
    dependencies: { [CONVERSATION_PACKAGE_NAME]: specifier },
  }), 'utf8')
  return `${pathToFileURL(directory).href}/`
}

async function mountHost(baseUrl: string): Promise<{
  ctx: Context
  fiber: ReturnType<Context['plugin']>
  route: RouteRegistration
  removed: () => number
}> {
  const ctx = new Context()
  ctx.baseUrl = baseUrl
  const routes: RouteRegistration[] = []
  let removeCalls = 0
  // The plugin fences its own route through the connection service and mounts
  // it on the webServer (dsh 0.1.5: dedicated channels are plugin-served).
  ctx.provide('connection', {
    requestRejection: () => undefined,
  } as never)
  ctx.provide('webServer', {
    register(route: RouteRegistration): () => void {
      routes.push(route)
      return () => { removeCalls += 1 }
    },
  } as never)
  await ctx.plugin(MemorySettings).await()
  const fiber = ctx.plugin({ apply, Config })
  await fiber.await()
  const route = routes.find(candidate => candidate.path === CONVERSATION_SETTINGS_RPC_CHANNEL)
  if (route === undefined) throw new Error('conversation-ui RPC route was not registered')
  return { ctx, fiber, route, removed: () => removeCalls }
}

/** Drive one unary RPC through the registered route exactly as the browser does. */
async function callRpc(route: RouteRegistration, endpoint: string, payload: unknown): Promise<RpcReply> {
  const envelope = JSON.stringify({
    type: 'client-request',
    rpcId: `rpc-${endpoint}`,
    method: endpoint,
    payload,
  })
  const req = {
    method: 'POST',
    url: `${CONVERSATION_SETTINGS_RPC_CHANNEL}/${endpoint}`,
    headers: { 'content-type': 'application/json', host: '127.0.0.1:3080' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(envelope)
    },
  }
  let status = 0
  let body = ''
  const res = {
    writableEnded: false,
    on() {},
    writeHead(value: number) { status = value },
    end(chunk?: unknown) {
      body = chunk === undefined ? '' : String(chunk)
      ;(this as { writableEnded: boolean }).writableEnded = true
    },
  }
  await route.handler(req as never, res as never)
  let result: unknown
  try {
    const parsed = JSON.parse(body) as { result?: unknown }
    result = parsed.result ?? parsed
  } catch {
    result = body
  }
  return { status: status || 200, result }
}

describe('conversation-ui host settings', () => {
  it('reads the running package version from its manifest', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { name: string; version: string }
    expect(CONVERSATION_PACKAGE_NAME).toBe(manifest.name)
    expect(CONVERSATION_PACKAGE_VERSION).toBe(manifest.version)
  })

  it('registers the namespace with the default and disposes it with the fiber', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    const fiber = ctx.plugin({ apply, Config })
    await fiber.await()

    const ns = CONVERSATION_SETTINGS_NS
    expect(ctx.settings.get(ns)).toEqual(DEFAULT_CONVERSATION_SETTINGS)

    await ctx.settings.update(ns, { thinkAutoExpand: false })
    expect(ctx.settings.get(ns)).toEqual({ thinkAutoExpand: false })

    await expect(ctx.settings.update(ns, { thinkAutoExpand: 'nope' })).rejects.toThrow()

    await fiber.dispose()
    expect(ctx.settings.describe().map(row => row.ns)).not.toContain(ns)
  })

  it('serves the durable setting over the fenced plugin RPC route', async () => {
    const { ctx, fiber, route, removed } = await mountHost(profileBaseUrl(`link:${process.cwd()}`))

    expect(route.path).toBe(CONVERSATION_SETTINGS_RPC_CHANNEL)
    const initial = await callRpc(route, CONVERSATION_SETTINGS_RPC.read, {})
    expect(initial.status).toBe(200)
    expect(initial.result).toEqual({
      ok: true,
      value: {
        version: CONVERSATION_PACKAGE_VERSION,
        installation: 'development',
        writable: true,
        thinkAutoExpand: DEFAULT_CONVERSATION_SETTINGS.thinkAutoExpand,
        canUpgrade: false,
      },
    })

    const updated = await callRpc(route, CONVERSATION_SETTINGS_RPC.write, { thinkAutoExpand: false })
    expect(updated.result).toMatchObject({ ok: true, value: { thinkAutoExpand: false } })
    expect(ctx.settings.get(CONVERSATION_SETTINGS_NS)).toEqual({ thinkAutoExpand: false })

    const malformed = await callRpc(route, CONVERSATION_SETTINGS_RPC.write, { thinkAutoExpand: 'false' })
    expect(malformed.result).toMatchObject({ ok: false, error: { code: 'settings-rejected' } })

    const blockedUpdate = await callRpc(route, CONVERSATION_SETTINGS_RPC.upgrade, {})
    expect(blockedUpdate.result).toMatchObject({ ok: false, error: { code: 'internal' } })
    await fiber.dispose()
    expect(removed()).toBe(1)
  })

  it('enables the upgrade action only for a confirmed npm profile dependency', async () => {
    const npm = await mountHost(profileBaseUrl('^0.1.0'))
    const npmRead = await callRpc(npm.route, CONVERSATION_SETTINGS_RPC.read, {})
    expect(npmRead.result).toMatchObject({
      ok: true,
      value: { installation: 'npm', canUpgrade: true },
    })
    await npm.fiber.dispose()

    const npmAlias = await mountHost(profileBaseUrl(`npm:${CONVERSATION_PACKAGE_NAME}@^0.1.0`))
    const aliasRead = await callRpc(npmAlias.route, CONVERSATION_SETTINGS_RPC.read, {})
    expect(aliasRead.result).toMatchObject({
      ok: true,
      value: { installation: 'npm', canUpgrade: true },
    })
    await npmAlias.fiber.dispose()

    const localAlias = await mountHost(profileBaseUrl(`npm:${CONVERSATION_PACKAGE_NAME}@file:../conversation-ui`))
    const localAliasRead = await callRpc(localAlias.route, CONVERSATION_SETTINGS_RPC.read, {})
    expect(localAliasRead.result).toMatchObject({
      ok: true,
      value: { installation: 'unmanaged', canUpgrade: false },
    })
    await localAlias.fiber.dispose()

    const unmanaged = await mountHost(profileBaseUrl('workspace:*'))
    const unmanagedRead = await callRpc(unmanaged.route, CONVERSATION_SETTINGS_RPC.read, {})
    expect(unmanagedRead.result).toMatchObject({
      ok: true,
      value: { installation: 'unmanaged', canUpgrade: false },
    })
    await unmanaged.fiber.dispose()

    const catalog = await mountHost(profileBaseUrl('catalog:conversation-ui'))
    const catalogRead = await callRpc(catalog.route, CONVERSATION_SETTINGS_RPC.read, {})
    expect(catalogRead.result).toMatchObject({
      ok: true,
      value: { installation: 'unmanaged', canUpgrade: false },
    })
    await catalog.fiber.dispose()

    const unbundled = await mountHost(profileBaseUrl('^0.1.0', false))
    const unbundledRead = await callRpc(unbundled.route, CONVERSATION_SETTINGS_RPC.read, {})
    expect(unbundledRead.result).toMatchObject({
      ok: true,
      value: { installation: 'unmanaged', canUpgrade: false },
    })
    await unbundled.fiber.dispose()
  })

  it('applies without a settings service present', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin({ apply, Config })
    await fiber.await()
    // No throw means the optional settings injection skipped cleanly.
    await fiber.dispose()
  })
})
