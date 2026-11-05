import { describe, expect, it } from 'vitest'
import { formatCodexPlanName, formatResetTime, formatRestoredWindows, formatUsageNumber } from '../src/client/locale-format.ts'

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

  it('localizes generic plan tiers for every DSH 0.2.2 built-in language', () => {
    expect(formatCodexPlanName('free', 'ja')).toBe('無料')
    expect(formatCodexPlanName('free', 'es')).toBe('Gratis')
    expect(formatCodexPlanName('free', 'fr')).toBe('Gratuit')
    expect(formatCodexPlanName('free', 'de')).toBe('Kostenlos')
    expect(formatCodexPlanName('free', 'ru')).toBe('Бесплатный')
    expect(formatCodexPlanName('free', 'pt-BR')).toBe('Grátis')
    expect(formatCodexPlanName('edu', 'de')).toBe('Bildung')
    expect(formatCodexPlanName('unknown', 'ru')).toBe('Неизвестно')
    // Brand tiers keep OpenAI's English product names in every language.
    expect(formatCodexPlanName('prolite', 'ja')).toBe('Pro 5x')
    expect(formatCodexPlanName('team', 'fr')).toBe('Team')
    expect(formatCodexPlanName('enterprise', 'pt')).toBe('Enterprise')
    // A language without a generic map still falls back to English.
    expect(formatCodexPlanName('free', 'ko')).toBe('Free')
  })

  it('selects the restored-window plural form for every DSH built-in language', () => {
    expect(formatRestoredWindows(1, 'en')).toBe('1 limit window restored')
    expect(formatRestoredWindows(2, 'en')).toBe('2 limit windows restored')
    expect(formatRestoredWindows(2, 'zh')).toBe('已恢复 2 个限额窗口')
    expect(formatRestoredWindows(2, 'ja')).toBe('2 件の制限ウィンドウを復元しました')
    expect(formatRestoredWindows(1, 'es')).toBe('1 ventana de límite restaurada')
    expect(formatRestoredWindows(2, 'es')).toBe('2 ventanas de límite restauradas')
    expect(formatRestoredWindows(1, 'fr')).toBe('1 fenêtre de limite restaurée')
    expect(formatRestoredWindows(2, 'fr')).toBe('2 fenêtres de limite restaurées')
    expect(formatRestoredWindows(1, 'de')).toBe('1 Limitfenster wiederhergestellt')
    expect(formatRestoredWindows(2, 'de')).toBe('2 Limitfenster wiederhergestellt')
    // Russian distinguishes one / few / many.
    expect(formatRestoredWindows(1, 'ru')).toBe('1 лимитное окно восстановлено')
    expect(formatRestoredWindows(2, 'ru')).toBe('2 лимитных окна восстановлено')
    expect(formatRestoredWindows(5, 'ru')).toBe('5 лимитных окон восстановлено')
    expect(formatRestoredWindows(1, 'pt-BR')).toBe('1 janela de limite restaurada')
    expect(formatRestoredWindows(2, 'pt-BR')).toBe('2 janelas de limite restauradas')
    // A language outside the table falls back to English plural forms.
    expect(formatRestoredWindows(1, 'ko')).toBe('1 limit window restored')
  })

  it('passes unrecognized plan identifiers through instead of masking them', () => {
    expect(formatCodexPlanName('future_tier', 'en')).toBe('future_tier')
    expect(formatCodexPlanName('Future Tier', 'zh')).toBe('Future Tier')
  })
})
