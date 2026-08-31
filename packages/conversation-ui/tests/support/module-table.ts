/**
 * Test stand-in for the DeepSeek Harness Web module table. Published DSH
 * client halves ship as browser loader factories
 * (`window.__ModuleLoader__.load({ id, factory })`); this module installs a
 * minimal loader global and materializes those factories with the installed
 * npm packages answering their external `require` calls — exactly the modules
 * the Web shell's table serves. Import this before any client bundle.
 */

import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'
import * as ReactDom from 'react-dom'
import * as ReactDomClient from 'react-dom/client'
import * as Cordis from '@deepseek-ai/cordis'
import * as UiSlots from '@deepseek-ai/dsh-client-ui-slots'
import * as UiPrimitives from '@deepseek-ai/dsh-client-ui-primitives'
import * as ClientStore from '@deepseek-ai/dsh-client-store'

type Factory = (require: (id: string) => unknown) => unknown

interface LoaderEntry {
  id: string
  factory: Factory
}

const factories = new Map<string, Factory>()
const materialized = new Map<string, unknown>()

const externals = new Map<string, unknown>([
  ['react', React],
  ['react/jsx-runtime', JsxRuntime],
  ['react-dom', ReactDom],
  ['react-dom/client', ReactDomClient],
  ['@deepseek-ai/cordis', Cordis],
  ['@deepseek-ai/dsh-client-ui-slots', UiSlots],
  ['@deepseek-ai/dsh-client-ui-primitives', UiPrimitives],
  ['@deepseek-ai/dsh-client-store', ClientStore],
])

function requireModule(id: string): unknown {
  if (materialized.has(id)) return materialized.get(id)
  const external = externals.get(id)
  if (external !== undefined) return external
  const factory = factories.get(id)
  if (factory !== undefined) return materialize(id)
  throw new Error(`dsh-conversation-ui tests: module table miss for ${JSON.stringify(id)}`)
}

function materialize(id: string): unknown {
  const factory = factories.get(id)
  if (factory === undefined) throw new Error(`dsh-conversation-ui tests: no factory registered for ${JSON.stringify(id)}`)
  const exports = factory(requireModule)
  materialized.set(id, exports)
  return exports
}

const loaderTarget = (globalThis as { window?: Window }).window ?? globalThis
Object.assign(loaderTarget, {
  __ModuleLoader__: {
    load(entry: LoaderEntry): void {
      factories.set(entry.id, entry.factory)
    },
  },
})

/** Instantiate one registered client factory and return its exports. */
export function clientModule<T>(id: string): T {
  return materialize(id) as T
}
