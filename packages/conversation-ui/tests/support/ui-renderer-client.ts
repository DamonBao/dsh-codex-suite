/** Test import surface of the installed `@deepseek-ai/dsh-client-ui-renderer` client factory. */

import { clientModule } from './module-table.ts'
// Registers the factory with the test module table installed above.
// eslint-disable-next-line import/no-unresolved
import '../../node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js'

interface UiRendererClientModule {
  SlotRegistry: new (...args: never[]) => unknown
}

const mod = clientModule<UiRendererClientModule>('@deepseek-ai/dsh-client-ui-renderer')

export const SlotRegistry = mod.SlotRegistry
