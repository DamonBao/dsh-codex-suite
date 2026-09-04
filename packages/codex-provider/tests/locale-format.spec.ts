import { describe, expect, it } from 'vitest'
import { formatCodexPlanName, formatResetTime, formatUsageNumber } from '../src/client/locale-format.ts'

describe('Codex usage locale formatting', () => {
  it('uses DSH locale instead of the browser default for reset times', () => {
    const timestamp = Date.UTC(2026, 7, 20, 12, 34)
    const english = formatResetTime(timestamp, 'en')
    const chinese = formatResetTime(timestamp, 'zh')

    expect(english).toContain('Aug')
    expect(english).not.toContain('年')
    expect(chinese).toContain('年')
    expect(chinese).toContain('月')
  })

  it('uses DSH locale for numeric usage metadata', () => {
    expect(formatUsageNumber(1234.5, 'en')).toBe(new Intl.NumberFormat('en', {
      maximumFractionDigits: 2,
    }).format(1234.5))
    expect(formatUsageNumber(1234.5, 'zh')).toBe(new Intl.NumberFormat('zh', {
      maximumFractionDigits: 2,
    }).format(1234.5))
  })

  it('maps internal plan identifiers to user-facing plan names', () => {
    expect(formatCodexPlanName('plus', 'en')).toBe('Plus')
    expect(formatCodexPlanName('prolite', 'en')).toBe('Pro 5x')
    expect(formatCodexPlanName('promax', 'en')).toBe('Pro 20x')
    expect(formatCodexPlanName('pro', 'en')).toBe('Pro 20x')
    expect(formatCodexPlanName('free', 'en')).toBe('Free')
    expect(formatCodexPlanName('go', 'en')).toBe('Go')
    expect(formatCodexPlanName('team', 'en')).toBe('Team')
    expect(formatCodexPlanName('self_serve_business_usage_based', 'en')).toBe('Business')
    expect(formatCodexPlanName('business', 'en')).toBe('Business')
    expect(formatCodexPlanName('enterprise_cbp_usage_based', 'en')).toBe('Enterprise')
    expect(formatCodexPlanName('enterprise', 'en')).toBe('Enterprise')
    expect(formatCodexPlanName('edu', 'en')).toBe('Education')
    expect(formatCodexPlanName('unknown', 'en')).toBe('Unknown')
  })

  it('localizes plan names for Chinese and normalizes identifier casing', () => {
    expect(formatCodexPlanName('prolite', 'zh')).toBe('Pro 5x')
    expect(formatCodexPlanName('promax', 'zh')).toBe('Pro 20x')
    expect(formatCodexPlanName('plus', 'zh-CN')).toBe('Plus')
    expect(formatCodexPlanName('free', 'zh')).toBe('免费版')
    expect(formatCodexPlanName('edu', 'zh')).toBe('教育版')
    expect(formatCodexPlanName('unknown', 'zh')).toBe('未知')
    expect(formatCodexPlanName('ProLite', 'en')).toBe('Pro 5x')
    expect(formatCodexPlanName('  PLUS  ', 'en')).toBe('Plus')
  })

  it('passes unrecognized plan identifiers through instead of masking them', () => {
    expect(formatCodexPlanName('future_tier', 'en')).toBe('future_tier')
    expect(formatCodexPlanName('Future Tier', 'zh')).toBe('Future Tier')
  })
})
