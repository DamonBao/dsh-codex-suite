/** Load the published Chat factory, so compatibility tests exercise its renderer. */
import type { Context } from '@deepseek-ai/cordis'
import { clientModule } from './module-table.ts'
import '../../node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js'

const mod = clientModule<{ apply: (ctx: Context) => void }>('@deepseek-ai/dsh-client-ui-chat')
export const applyNativeChat = mod.apply
