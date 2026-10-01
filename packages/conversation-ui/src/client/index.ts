import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only declarations for Connection and bundle configuration slots.
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
// Type-only: the SlotRegistry service merge (ctx.slots), the Chat SlotMap
// entries ('conversation.chat.node' / 'conversation.chat.turnTail'), and the
// uiConversation service merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { registerAssistantEnhancement } from './NativeAssistantEnhancement.tsx'
import { ConversationCard } from './ConversationCard.tsx'
import { ConversationCardController } from './conversation-ui-card-controller.ts'
import { DeliverablesTail } from './DeliverablesCard.tsx'
import { deliverablesDefinition } from './deliverables.ts'
import { createConversationSettingsApi } from './conversation-ui-settings-api.ts'
import { NS as SETTINGS_NS, en, zh } from './locales.ts'
import { DEFAULT_CONVERSATION_CONFIG, CONVERSATION_BOOT_GLOBAL, type ConversationConfig } from '../config.ts'
import { DEFAULT_CONVERSATION_SETTINGS } from '../settings.ts'

/**
 * Cordis services required by the browser half. Only `slots` is load-bearing
 * for the stream itself; locale and Connection power the configuration card
 * and are wired through `ctx.inject` below so a deployment without them still
 * streams with defaults.
 */
export const inject = ['slots']

const CONVERSATION_MODES: readonly string[] = ['typewriter', 'teleprompter']
const CONVERSATION_PRESETS: readonly string[] = ['realtime', 'balanced', 'silky']

/**
 * Read the Host-bridged boot config. The inline script is produced by this
 * plugin's Host half from a schema-validated value, so only the structural
 * guarantees that could break between the two halves are re-checked: the
 * global is absent when the client runs without its Host entry (defaults
 * apply), and any present-but-malformed value fails loudly instead of
 * rendering a half-configured view.
 * @returns The resolved configuration for the assistant node view.
 */
function readBootConfig(): ConversationConfig {
  const raw = (globalThis as Record<string, unknown>)[CONVERSATION_BOOT_GLOBAL]
  if (raw === undefined) {
    console.info('[dsh-conversation-ui] no host config bridge; using defaults')
    return DEFAULT_CONVERSATION_CONFIG
  }
  if (
    typeof raw !== 'object' || raw === null
    || !CONVERSATION_MODES.includes((raw as ConversationConfig).mode)
    || !CONVERSATION_PRESETS.includes((raw as ConversationConfig).preset)
    || typeof (raw as ConversationConfig).revealCharsPerSec !== 'number'
    || typeof (raw as ConversationConfig).scrollSpeedPxPerSec !== 'number'
    || typeof (raw as ConversationConfig).maxScrollSpeedPxPerSec !== 'number'
  ) {
    throw new Error(`[dsh-conversation-ui] malformed ${CONVERSATION_BOOT_GLOBAL} boot global: ${JSON.stringify(raw)}`)
  }
  return raw as ConversationConfig
}

/**
 * A live preference cell read by `useSyncExternalStore`. It starts on the
 * shared default and, once the plugin-owned settings controller is attached,
 * tracks the resolved `thinkAutoExpand` value. A composition (or test) that
 * ships no settings surface keeps the cell on the default.
 */
class PreferenceCell {
  private readonly listeners = new Set<() => void>()
  private card: ConversationCardController | undefined
  private value = DEFAULT_CONVERSATION_SETTINGS.thinkAutoExpand

  /** Re-point the cell at the plugin-owned settings controller. */
  attach(card: ConversationCardController): () => void {
    this.card = card
    this.refresh()
    const unsubscribe = card.subscribe(() => { this.refresh() })
    return () => {
      unsubscribe()
      if (this.card !== card) return
      this.card = undefined
      this.refresh()
    }
  }

  private read(): boolean {
    return this.card?.getSnapshot().thinkAutoExpand ?? DEFAULT_CONVERSATION_SETTINGS.thinkAutoExpand
  }

  private refresh(): void {
    const next = this.read()
    if (next === this.value) return
    this.value = next
    for (const listener of this.listeners) listener()
  }

  readonly getSnapshot = (): boolean => this.value

  readonly subscribe = (listener: () => void): () => void => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}

/**
 * Add assistant reveal/preferences and independent delivery/settings cards.
 * Native ChatView, tools, Turn controls, grouping, and scroll remain untouched.
 * @param ctx - browser context carrying the shared slot registry.
 */
export function apply(ctx: ClientContext): void {
  const config = readBootConfig()
  const preference = new PreferenceCell()

  // Keep native file previews and change review alongside the plugin's deliveries.
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    id: '@jcy2387/dsh-conversation-ui',
    priority: -100,
    registrant: 'dsh-conversation-ui',
    locale: SETTINGS_NS,
  }, DeliverablesTail))
  ctx.inject(['uiConversation'], (deliverablesCtx) => {
    const events = deliverablesCtx.uiConversation.events
    return events.register(deliverablesDefinition)
  })

  ctx.inject(['locale'], (localeCtx) => localeCtx.effect(() => localeCtx.locale.register(SETTINGS_NS, { zh, en }), 'dsh-conversation-ui: dictionaries'))

  // The card talks to the plugin-owned loopback RPC, so the core settings
  // namespace allowlist cannot make it disappear. The stream still applies
  // with defaults when the optional Settings UI or Connection is absent.
  ctx.inject(['slots', 'locale', 'connection'], (settingsCtx) => {
    const card = new ConversationCardController(
      // The shared Context augmentation also carries the Host-side Connection
      // shape. This browser entry runs after the client provider installs its
      // handle, so narrow through unknown to its client contract here.
      createConversationSettingsApi(settingsCtx.get('connection') as unknown as ConnectionHandle),
    )
    const detachPreference = preference.attach(card)
    card.start()
    for (const bundle of ['@jcy2387/dsh-conversation-ui', '@jcy2387/dsh-suite']) {
      settingsCtx.slots.inject('plugins.bundle.config', () => settingsCtx.slots.register({
        name: 'plugins.bundle.config',
        key: bundle,
        locale: SETTINGS_NS,
        inject: () => card.inject(),
      }, ConversationCard))
    }
    return () => {
      card.stop()
      detachPreference()
    }
  })

  ctx.slots.inject('conversation.chat.node', () => registerAssistantEnhancement(ctx, config, preference))
}
