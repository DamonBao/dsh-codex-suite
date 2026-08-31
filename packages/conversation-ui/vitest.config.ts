import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

/** Published DSH UI libraries import CSS Modules; answer them with empty maps. */
function stubCssModules(): Plugin {
  return {
    name: 'stub-css-modules',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!source.endsWith('.css')) return null
      if (importer === undefined || !importer.includes('node_modules')) return null
      return `\0dsh-test-css:${source}`
    },
    load(id) {
      if (!id.startsWith('\0dsh-test-css:')) return null
      return id.endsWith('.module.css') ? 'export default {}' : 'export default undefined'
    },
  }
}

/**
 * Tests resolve every `@deepseek-ai/*` module from the installed published
 * packages — no local harness checkout. The published client halves ship as
 * browser loader factories (`window.__ModuleLoader__.load`), so the three
 * client factories the tests instantiate are routed through small wrappers
 * that emulate the Web module table (tests/support/module-table.ts).
 */
export default defineConfig({
  root,
  plugins: [stubCssModules()],
  ssr: {
    // Keep the DSH UI libraries in the Vite pipeline so their CSS Module
    // imports are stubbed instead of reaching the native Node loader.
    noExternal: [/@deepseek-ai\/dsh-client-ui-primitives/],
  },
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-ui-renderer/client': fileURLToPath(new URL('./tests/support/ui-renderer-client.ts', import.meta.url)),
      '@deepseek-ai/dsh-client-ui-conversation/client': fileURLToPath(new URL('./tests/support/ui-conversation-client.ts', import.meta.url)),
      '@deepseek-ai/dsh-client-locale/client': fileURLToPath(new URL('./tests/support/locale-client.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
  },
})
