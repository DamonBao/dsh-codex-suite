/**
 * Mirror of DSH's shared developer-tools preference. The native turn-tail
 * changed-files card only draws while developer tools are enabled; the plugin
 * reads the same switch so it can avoid rendering a second file card.
 */

/** Minimal shape of the settings-owned observable snapshot. */
interface DeveloperToolsSource {
  getSnapshot: () => boolean
  subscribe: (listener: () => void) => () => void
}

class DeveloperToolsPreferenceCell {
  private readonly listeners = new Set<() => void>()
  private source: DeveloperToolsSource | undefined
  private value = false

  /** Point the cell at the settings service, or detach when it unloads. */
  attach(source: DeveloperToolsSource): () => void {
    this.source = source
    this.refresh()
    const unsubscribe = source.subscribe(() => { this.refresh() })
    return () => {
      unsubscribe()
      if (this.source !== source) return
      this.source = undefined
      this.refresh()
    }
  }

  private read(): boolean {
    return this.source?.getSnapshot() ?? false
  }

  private refresh(): void {
    const next = this.read()
    if (next === this.value) return
    this.value = next
    for (const listener of this.listeners) listener()
  }

  readonly getSnapshot = (): boolean => this.value

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}

/** Shared cell consumed by the deliverables tail. */
export const developerTools = new DeveloperToolsPreferenceCell()
