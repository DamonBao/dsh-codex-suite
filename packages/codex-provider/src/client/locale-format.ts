/** Locale-aware usage formatting keyed by DSH's active language. */

const resetFormatters = new Map<string, Intl.DateTimeFormat>()
const numberFormatters = new Map<string, Intl.NumberFormat>()

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

/** User-facing Chinese names for OpenAI's internal plan_type identifiers. */
const PLAN_NAMES_ZH: Readonly<Record<string, string>> = {
  free: '免费版',
  go: 'Go',
  plus: 'Plus',
  prolite: 'Pro 5x',
  promax: 'Pro 20x',
  pro: 'Pro 20x',
  team: 'Team',
  self_serve_business_usage_based: 'Business',
  business: 'Business',
  enterprise_cbp_usage_based: 'Enterprise',
  enterprise: 'Enterprise',
  edu: '教育版',
  unknown: '未知',
}

/**
 * Map one raw OpenAI `plan_type` to its user-facing plan name (Plus, Pro 5x,
 * Pro 20x, Business…). Unrecognized identifiers pass through unchanged so new
 * backend tiers stay visible instead of being masked.
 */
export function formatCodexPlanName(planType: string, locale: string): string {
  const trimmed = planType.trim()
  const names = locale.toLowerCase().startsWith('zh') ? PLAN_NAMES_ZH : PLAN_NAMES_EN
  return names[trimmed.toLowerCase()] ?? trimmed
}
