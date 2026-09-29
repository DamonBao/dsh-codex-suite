import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client'

export type TurnElapsedTranslator = ChatNodeViewProps<'assistant-step'>['t']

export function formatRunDuration(ms: number, t: TurnElapsedTranslator): string {
  const total = Math.max(0, Math.floor(ms / 1_000))
  const hours = Math.floor(total / 3_600)
  const minutes = Math.floor(total / 60) % 60
  const seconds = total % 60
  const parts: string[] = []
  if (hours > 0) parts.push(String(hours), t('duration.hourUnit'))
  if (total >= 60) parts.push(String(minutes), t('duration.minuteUnit'))
  parts.push(String(seconds), t('duration.secondUnit'))
  return parts.join('')
}

export function formatTurnElapsed(ms: number, t: TurnElapsedTranslator): string {
  const duration = formatRunDuration(ms, t)
  const label = t('message.turnProcess.took')
  // The requested Codex surface uses “耗时”; preserve every other locale's
  // native conversation translation unchanged.
  return `${label === '已完成，用时 ' ? '耗时 ' : label}${duration}`
}

export function formatTurnProcessed(ms: number, t: TurnElapsedTranslator): string {
  const duration = formatRunDuration(ms, t)
  const label = t('message.turnProcess.took')
  // Keep the native duration grammar and only replace the Chinese state word.
  return `${label === '已完成，用时 ' ? '已处理 ' : label}${duration}`
}
