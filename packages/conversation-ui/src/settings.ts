/**
 * User-owned settings for the conversation-ui plugin, exposed to the Host
 * settings service and edited from the Web Settings "plugin configuration"
 * page. The profile overlay still supplies deployment defaults (including the
 * deprecated scroll fields), but these fields are the live, durable
 * user-facing preferences.
 */

import { DEFAULT_CONVERSATION_CONFIG, type ConversationConfig } from './config.ts'

/** Settings namespace registered by the Host and served through the plugin RPC. */
export const CONVERSATION_SETTINGS_NS = 'conversation-ui'

/** Preferences a user may set from the plugin card. */
export interface ConversationSettings {
  /** Whether native reasoning disclosures open when streaming begins. */
  thinkAutoExpand: boolean
  /** Assistant reveal style. */
  mode: ConversationConfig['mode']
  /** Smoothing preset for the reveal cadence. */
  preset: ConversationConfig['preset']
  /** Fixed grapheme reveal rate used by `typewriter` mode. */
  revealCharsPerSec: number
}

/** Defaults shared by the Host schema, the client fallback, and the boot bridge. */
export const DEFAULT_CONVERSATION_SETTINGS: ConversationSettings = {
  thinkAutoExpand: true,
  mode: DEFAULT_CONVERSATION_CONFIG.mode,
  preset: DEFAULT_CONVERSATION_CONFIG.preset,
  revealCharsPerSec: DEFAULT_CONVERSATION_CONFIG.revealCharsPerSec,
}
