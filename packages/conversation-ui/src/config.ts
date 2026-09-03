/**
 * Shared plugin configuration contract. The Host half defines the
 * Schemastery schema over this shape (defaults live here so both halves stay
 * symmetric); the client half falls back to the same defaults when the Host
 * boot-config bridge is absent (client-only composition).
 */

import type { ConversationSmoothingPreset } from './client/useConversationContent.ts'

/** Streaming render direction of the assistant node view. */
export type ConversationMode = 'typewriter' | 'teleprompter'

/** Plugin configuration validated by the Host schema and bridged to the browser half. */
export interface ConversationConfig {
  /** Render cadence: per-grapheme typewriter or immediate model snapshots. */
  readonly mode: ConversationMode
  /** Smoothing preset for the reveal cadence. */
  readonly preset: ConversationSmoothingPreset
  /** Fixed grapheme reveal rate used by `typewriter` mode. */
  readonly revealCharsPerSec: number
  /** @deprecated Retained for config compatibility; current DSH owns scrolling. */
  readonly scrollSpeedPxPerSec: number
  /** @deprecated Retained for config compatibility; current DSH owns scrolling. */
  readonly maxScrollSpeedPxPerSec: number
}

/** Defaults shared by the Host schema and the client-side fallback. */
export const DEFAULT_CONVERSATION_CONFIG: ConversationConfig = {
  mode: 'teleprompter',
  preset: 'balanced',
  revealCharsPerSec: 80,
  scrollSpeedPxPerSec: 48,
  maxScrollSpeedPxPerSec: 1000,
}

/**
 * Window global the Host writes into the served index HTML. The browser boot
 * graph carries no per-entry config, so this inline script is the only
 * Host-to-client configuration channel for a composed web plugin.
 */
export const CONVERSATION_BOOT_GLOBAL = '__DSH_CONVERSATION_UI_CONFIG__'
