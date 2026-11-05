/** Locale-aware usage formatting keyed by DSH's active language. */

const resetFormatters = new Map<string, Intl.DateTimeFormat>()
const numberFormatters = new Map<string, Intl.NumberFormat>()
const pluralRules = new Map<string, Intl.PluralRules>()

function resetFormatter(locale: string): Intl.DateTimeFormat {
  let formatter = resetFormatters.get(locale)
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
    resetFormatters.set(locale, formatter)
  }
  return formatter
}

function numberFormatter(locale: string): Intl.NumberFormat {
  let formatter = numberFormatters.get(locale)
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
    numberFormatters.set(locale, formatter)
  }
  return formatter
}

/** Format a reset timestamp with DSH's active locale and the browser's time zone. */
export function formatResetTime(timestamp: number | null, locale: string): string | null {
  return timestamp === null ? null : resetFormatter(locale).format(timestamp)
}

/** Format a credit balance with DSH's active locale. */
export function formatUsageNumber(value: number, locale: string): string {
  return numberFormatter(locale).format(value)
}

function pluralRule(locale: string): Intl.PluralRules {
  let rules = pluralRules.get(locale)
  if (rules === undefined) {
    rules = new Intl.PluralRules(locale)
    pluralRules.set(locale, rules)
  }
  return rules
}

/**
 * CLDR plural forms for the restored-window line, keyed by language then
 * category. DSH's locale registry supplies selection, persistence and key
 * fallback but deliberately no plural rules, so count-bearing copy that reads
 * as a sentence selects its own form here. Brand and product names stay out of
 * this table; only the sentence varies.
 */
const RESTORED_WINDOW_FORMS: Readonly<Record<string, Partial<Record<Intl.LDMLPluralRule, string>>>> = {
  en: {
    one: '{count} limit window restored',
    other: '{count} limit windows restored',
  },
  zh: { other: '已恢复 {count} 个限额窗口' },
  ja: { other: '{count} 件の制限ウィンドウを復元しました' },
  es: {
    one: '{count} ventana de límite restaurada',
    other: '{count} ventanas de límite restauradas',
  },
  fr: {
    one: '{count} fenêtre de limite restaurée',
    other: '{count} fenêtres de limite restaurées',
  },
  de: {
    one: '{count} Limitfenster wiederhergestellt',
    other: '{count} Limitfenster wiederhergestellt',
  },
  ru: {
    one: '{count} лимитное окно восстановлено',
    few: '{count} лимитных окна восстановлено',
    many: '{count} лимитных окон восстановлено',
    other: '{count} лимитного окна восстановлено',
  },
  pt: {
    one: '{count} janela de limite restaurada',
    other: '{count} janelas de limite restauradas',
  },
}

/**
 * Format the "N limit windows restored" status line with the active DSH
 * language's CLDR plural category, so singular counts read naturally in the
 * languages that inflect nouns and numerals.
 * @param count - restored limit windows reported by the Host.
 * @param locale - DSH's active locale id.
 * @returns the localized sentence with the grouped count interpolated.
 */
export function formatRestoredWindows(count: number, locale: string): string {
  const language = locale.toLowerCase().split('-')[0] ?? 'en'
  const localized = RESTORED_WINDOW_FORMS[language]
  // A language outside the table falls back to English copy AND English plural
  // rules, so the sentence never mixes one language's categories with another's.
  const forms = localized ?? RESTORED_WINDOW_FORMS.en ?? {}
  const category = pluralRule(localized === undefined ? 'en' : locale).select(count)
  const template = forms[category] ?? forms.other ?? forms.one
  if (template === undefined) {
    throw new Error(`no restored-window plural form for locale ${JSON.stringify(locale)}`)
  }
  return template.replace('{count}', formatUsageNumber(count, locale))
}

/** User-facing English names for OpenAI's internal plan_type identifiers. */
const PLAN_NAMES_EN: Readonly<Record<string, string>> = {
  free: 'Free',
  go: 'Go',
  plus: 'Plus',
  prolite: 'Pro 5x',
  promax: 'Pro 20x',
  // The pre-split $200 Pro tier carries 20x-tier usage, like Pro Max.
  pro: 'Pro 20x',
  team: 'Team',
  self_serve_business_usage_based: 'Business',
  business: 'Business',
  enterprise_cbp_usage_based: 'Enterprise',
  enterprise: 'Enterprise',
  edu: 'Education',
  unknown: 'Unknown',
}

/**
 * Localized names for the generic plan tiers. OpenAI brand tiers (Plus, Pro 5x,
 * Pro 20x, Team, Business, Enterprise) keep their English product names in
 * every language, matching how OpenAI presents them.
 */
const PLAN_GENERIC_NAMES: Readonly<Record<string, Readonly<Record<'free' | 'edu' | 'unknown', string>>>> = {
  zh: { free: '免费版', edu: '教育版', unknown: '未知' },
  ja: { free: '無料', edu: '教育版', unknown: '不明' },
  es: { free: 'Gratis', edu: 'Educación', unknown: 'Desconocido' },
  fr: { free: 'Gratuit', edu: 'Éducation', unknown: 'Inconnu' },
  de: { free: 'Kostenlos', edu: 'Bildung', unknown: 'Unbekannt' },
  ru: { free: 'Бесплатный', edu: 'Образование', unknown: 'Неизвестно' },
  pt: { free: 'Grátis', edu: 'Educação', unknown: 'Desconhecido' },
}

/** Generic tiers whose display name is localized per language. */
const GENERIC_PLAN_TIERS: Readonly<Record<string, 'free' | 'edu' | 'unknown'>> = {
  free: 'free',
  edu: 'edu',
  unknown: 'unknown',
}

/**
 * Map one raw OpenAI `plan_type` to its user-facing plan name (Plus, Pro 5x,
 * Pro 20x, Business…). Generic tiers follow the active DSH language; brand
 * tiers stay in English. Unrecognized identifiers pass through unchanged so new
 * backend tiers stay visible instead of being masked.
 */
export function formatCodexPlanName(planType: string, locale: string): string {
  const trimmed = planType.trim()
  const id = trimmed.toLowerCase()
  const tier = GENERIC_PLAN_TIERS[id]
  const language = locale.toLowerCase().split('-')[0] ?? ''
  const localized = tier === undefined ? undefined : PLAN_GENERIC_NAMES[language]?.[tier]
  return localized ?? PLAN_NAMES_EN[id] ?? trimmed
}
