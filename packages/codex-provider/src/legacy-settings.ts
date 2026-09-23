/** Import an old settings section once per profile without replacing newer overrides. */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/dsh-settings'

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Keep every existing override, including arrays and explicit false values. */
export function missingSettings(legacy: Record<string, unknown>, current: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(legacy)) {
    if (!object(current) || !Object.hasOwn(current, key)) {
      Object.defineProperty(result, key, { value, enumerable: true })
    } else if (object(value) && object(current[key])) {
      const nested = missingSettings(value, current[key])
      if (Object.keys(nested).length) Object.defineProperty(result, key, { value: nested, enumerable: true })
    }
  }
  return result
}

async function readOptional(path: string): Promise<string | undefined> {
  try { return await readFile(path, 'utf8') } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }
}

/** Import preserved legacy values after Loader settles; a failed write remains retryable. */
export function importLegacySettings(ctx: Context, legacyNs: string, entryId: string): void {
  ctx.inject(['settings', 'profileContext'], child => {
    let disposed = false
    child.effect(() => () => { disposed = true })
    void child.root.loader.await().then(async () => {
      const markerDir = join(child.profileContext.dir, '.plugin-settings-migrations')
      const marker = join(markerDir, `${encodeURIComponent(entryId)}.json`)
      if (await readOptional(marker) !== undefined) return
      const oldPath = join(child.profileContext.home, 'settings.yaml')
      const source = await readOptional(oldPath) ?? await readOptional(`${oldPath}.imported`)
      if (source === undefined || disposed) return
      const document: unknown = parse(source)
      if (!object(document) || !object(document[legacyNs])) return
      const descriptor = child.settings.describe().find(row => String(row.ns) === entryId)
      if (descriptor === undefined) throw new Error('Plugin settings form is unavailable')
      const patch = missingSettings(document[legacyNs], descriptor.user)
      if (Object.keys(patch).length) await child.settings.update(entryId, patch, descriptor.revision)
      if (disposed) return
      await mkdir(markerDir, { recursive: true, mode: 0o700 })
      await writeFile(marker, JSON.stringify({ version: 1, section: legacyNs }) + '\n', { mode: 0o600 })
    }).catch(() => {
      // Schema failures can contain credential values; keep those out of logs.
      child.logger.warn('Legacy settings import failed for %s; the source is preserved and import will retry on restart', entryId)
    })
  })
}
