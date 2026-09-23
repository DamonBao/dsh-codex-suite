/** Browser half: native OpenAI Codex account management in Settings. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { createCodexAuthRpcClient } from '../rpc-contract.ts'
import { CodexSettingsSection } from './CodexSettingsSection.tsx'
import type { CodexSettingsInjected } from './CodexSettingsSection.tsx'
import { CodexAuthCardController } from './controller.ts'
import { en, zh, type CodexSettingsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Codex connection settings copy. */
    'settings.codexProvider': CodexSettingsKey
  }
}

const NS = 'settings.codexProvider'

/** Required browser services. */
export const inject = ['slots', 'locale', 'connection']

/** Register one removable, independently navigable Codex settings page. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), '@jcy2387/dsh-codex-provider: dictionaries')
  const connection = ctx.get('connection') as unknown as ConnectionHandle
  const controller = new CodexAuthCardController(createCodexAuthRpcClient(connection.rpc))
  const face: CodexSettingsInjected = {
    ...controller.face(connection.isLoopback),
    getLocale: () => ctx.locale.getLocale().active,
  }

  ctx.on('connection/reset', () => { void controller.load() })
  for (const bundle of ['@jcy2387/dsh-codex-provider', '@jcy2387/dsh-suite']) {
    ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
      name: 'plugins.row.config',
      key: `${bundle}#codex-provider`,
      locale: NS,
      inject: (): CodexSettingsInjected => face,
    }, CodexSettingsSection))
  }
}
