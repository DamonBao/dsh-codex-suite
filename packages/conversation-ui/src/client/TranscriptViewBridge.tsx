import { createContext, createElement, useContext, type ComponentType, type ReactNode } from 'react'
import type { ChatViewSlotProps } from '@deepseek-ai/dsh-client-ui-chat/client'

const CompactTranscriptContext = createContext(false)

/** Explicit provider exported for isolated renderer composition and tests. */
export function CompactTranscriptProvider({ compact, children }: { compact: boolean; children: ReactNode }) {
  return <CompactTranscriptContext.Provider value={compact}>{children}</CompactTranscriptContext.Provider>
}

/** Read the authoritative DSH transcript preference inside Chat node seats. */
export function useCompactTranscript(): boolean {
  return useContext(CompactTranscriptContext)
}

/** Preserve the native Chat view while exposing its injected preference to descendants. */
export function wrapTranscriptView(Inner: ComponentType<ChatViewSlotProps>) {
  return function TranscriptViewBridge(props: ChatViewSlotProps) {
    const compact = props.useTranscriptView(mode => mode === 'compact')
    return (
      <CompactTranscriptContext.Provider value={compact}>
        {createElement(Inner, props)}
      </CompactTranscriptContext.Provider>
    )
  }
}
