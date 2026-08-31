/** Test import surface of the installed `@deepseek-ai/dsh-client-ui-conversation` client factory. */

import { clientModule } from './module-table.ts'
// Registers the factory with the test module table installed above.
// eslint-disable-next-line import/no-unresolved
import '../../node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js'

interface UiConversationClientModule {
  ConversationEventRegistry: new (...args: never[]) => unknown
}

const mod = clientModule<UiConversationClientModule>('@deepseek-ai/dsh-client-ui-conversation')

export const ConversationEventRegistry = mod.ConversationEventRegistry
