/** Test import surface of the installed `@deepseek-ai/dsh-client-locale` client factory. */

import { clientModule } from './module-table.ts'
// Registers the factory with the test module table installed above.
// eslint-disable-next-line import/no-unresolved
import '../../node_modules/@deepseek-ai/dsh-client-locale/lib/client.js'

interface LocaleClientModule {
  LocaleRuntime: new (...args: never[]) => unknown
}

const mod = clientModule<LocaleClientModule>('@deepseek-ai/dsh-client-locale')

export const LocaleRuntime = mod.LocaleRuntime
