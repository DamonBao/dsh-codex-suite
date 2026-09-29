import { describe, expect, it } from 'vitest'
import {
  formatTurnElapsed,
  formatTurnProcessed,
  type TurnElapsedTranslator,
} from '../src/client/turnElapsed.ts'

const en: TurnElapsedTranslator = key => {
  switch (key) {
    case 'duration.hourUnit': return 'h '
    case 'duration.minuteUnit': return 'm '
    case 'duration.secondUnit': return 's'
    case 'message.turnProcess.took': return 'Completed in '
    default: return key
  }
}

describe('elapsed Turn labels', () => {
  it('uses DSH 0.2 duration units in English', () => {
    expect(formatTurnElapsed(61_000, en)).toBe('Completed in 1m 1s')
    expect(formatTurnProcessed(3_661_000, en)).toBe('Completed in 1h 1m 1s')
  })
})
