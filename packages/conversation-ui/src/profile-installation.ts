/** Host-only profile source inspection and fixed npm update runner. */

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONVERSATION_PACKAGE_NAME, CONVERSATION_SUITE_PACKAGE_NAME } from './package-meta.ts'

/** A profile installation that can be updated through a fixed pnpm invocation. */
export interface NpmProfileInstallation {
  kind: 'npm'
  profileDir: string
  profileName: string
  /** Profile dependency to update; the suite owns the plugin when installed together. */
  packageName: string
}

/** A local source is deliberately not eligible for one-click npm updates. */
export interface DevelopmentProfileInstallation {
  kind: 'development'
}

/** The active context is not a recognized profile dependency. */
export interface UnmanagedProfileInstallation {
  kind: 'unmanaged'
}

/** Installation source visible to the plugin's Host RPC. */
export type ProfileInstallation = NpmProfileInstallation | DevelopmentProfileInstallation | UnmanagedProfileInstallation

interface ProfileManifest {
  dependencies?: unknown
  dsh?: unknown
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function profileDirectory(baseUrl: string | undefined): string | undefined {
  if (baseUrl === undefined) return undefined
  try {
    const url = new URL(baseUrl)
    return url.protocol === 'file:' ? fileURLToPath(url) : undefined
  } catch {
    return undefined
  }
}

function hasBundle(manifest: ProfileManifest, packageName: string): boolean {
  const dsh = record(manifest.dsh)
  const profile = record(dsh?.profile)
  const bundles = profile?.bundles
  return Array.isArray(bundles) && bundles.includes(packageName)
}

function isLocalSpecifier(specifier: string): boolean {
  return specifier.startsWith('link:')
    || specifier.startsWith('file:')
    || specifier.startsWith('.')
    || isAbsolute(specifier)
    || /^[A-Za-z]:[\\/]/.test(specifier)
}

function isRegistrySpecifier(specifier: string): boolean {
  // A registry range/tag contains neither a scheme nor a path. Treat every
  // package-manager extension (catalog:, patch:, portal:, workspace:, etc.)
  // as unconfirmed rather than guessing that an update may replace it.
  return specifier.length > 0 && !specifier.includes(':') && !/[\\/]/.test(specifier)
}

function isNpmSpecifier(specifier: string, packageName: string): boolean {
  if (!specifier.startsWith('npm:')) return isRegistrySpecifier(specifier)
  const aliased = specifier.slice('npm:'.length)
  if (aliased === packageName) return true
  const prefix = `${packageName}@`
  return aliased.startsWith(prefix) && isRegistrySpecifier(aliased.slice(prefix.length))
}

/**
 * Read only the profile manifest anchored by the current Cordis config tree.
 * A malformed or unrelated tree never receives an update affordance.
 */
export function inspectProfileInstallation(
  baseUrl: string | undefined,
  packageName: string,
): ProfileInstallation {
  const profileDir = profileDirectory(baseUrl)
  if (profileDir === undefined) return { kind: 'unmanaged' }
  let manifest: ProfileManifest
  try {
    manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as ProfileManifest
  } catch {
    return { kind: 'unmanaged' }
  }
  const dependencies = record(manifest.dependencies)
  const specifier = dependencies?.[packageName]
  if (typeof specifier !== 'string' || !hasBundle(manifest, packageName)) {
    return { kind: 'unmanaged' }
  }
  if (isLocalSpecifier(specifier)) return { kind: 'development' }
  if (!isNpmSpecifier(specifier, packageName)) return { kind: 'unmanaged' }
  return { kind: 'npm', profileDir, profileName: basename(profileDir), packageName }
}

/**
 * Resolve how this plugin is installed. A profile may depend on the plugin
 * directly or on the suite that installs it as a dependency; prefer the direct
 * entry, then fall back to the suite so the settings card can offer updates.
 */
export function inspectConversationInstallation(baseUrl: string | undefined): ProfileInstallation {
  const direct = inspectProfileInstallation(baseUrl, CONVERSATION_PACKAGE_NAME)
  if (direct.kind !== 'unmanaged') return direct
  return inspectProfileInstallation(baseUrl, CONVERSATION_SUITE_PACKAGE_NAME)
}

/**
 * Run the same fixed package update operation that a profile user would
 * invoke. `--latest` is required because profiles pin an exact version (the
 * README install command does), which a range-respecting `pnpm update` would
 * never move.
 */
export function updateNpmProfilePackage(profileDir: string, packageName: string): Promise<void> {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['update', '--latest', packageName], {
      cwd: profileDir,
      stdio: 'ignore',
      shell: false,
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`dsh-conversation-ui: pnpm update failed (${signal ?? String(code)})`))
    })
  })
}
