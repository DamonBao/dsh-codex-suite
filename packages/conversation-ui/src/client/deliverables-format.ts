/**
 * CLDR plural formatting for the turn-tail deliverables card.
 *
 * DSH's locale registry supplies selection, persistence and key fallback but
 * deliberately no plural rules, so the card's count-bearing sentences select
 * their own form here. Brand-free UI copy only: the card's remaining labels
 * stay in the locale dictionaries.
 */

/** Kinds the card counts when it summarizes hidden entries. */
export type DeliverableKind = 'file' | 'website' | 'item'

type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>>

const pluralRules = new Map<string, Intl.PluralRules>()
const numberFormatters = new Map<string, Intl.NumberFormat>()

function pluralRule(locale: string): Intl.PluralRules {
  let rules = pluralRules.get(locale)
  if (rules === undefined) {
    rules = new Intl.PluralRules(locale)
    pluralRules.set(locale, rules)
  }
  return rules
}

function grouped(count: number, locale: string): string {
  let formatter = numberFormatters.get(locale)
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
    numberFormatters.set(locale, formatter)
  }
  return formatter.format(count)
}

/** One language's deliverable copy: three summary sentences and the more line per kind. */
interface DeliverablesCopy {
  /** Sentence when the Turn delivered only files. */
  files: PluralForms
  /** Sentence when the Turn delivered only websites. */
  websites: PluralForms
  /** Sentence when the Turn delivered files and websites together. */
  items: PluralForms
  /** "Show N more ..." line for the hidden entries of each kind. */
  more: Readonly<Record<DeliverableKind, PluralForms>>
}

const COPY: Readonly<Record<string, DeliverablesCopy>> = {
  en: {
    files: { one: 'Edited {count} file', other: 'Edited {count} files' },
    websites: { one: 'Delivered {count} website', other: 'Delivered {count} websites' },
    items: { one: 'Delivered {count} item', other: 'Delivered {count} items' },
    more: {
      file: { one: 'Show {count} more file', other: 'Show {count} more files' },
      website: { one: 'Show {count} more website', other: 'Show {count} more websites' },
      item: { one: 'Show {count} more item', other: 'Show {count} more items' },
    },
  },
  zh: {
    files: { other: '已编辑 {count} 个文件' },
    websites: { other: '交付 {count} 个网站' },
    items: { other: '已交付 {count} 项产物' },
    more: {
      file: { other: '再显示 {count} 个文件' },
      website: { other: '再显示 {count} 个网站' },
      item: { other: '再显示 {count} 个产物' },
    },
  },
  ja: {
    files: { other: '{count} 件のファイルを編集しました' },
    websites: { other: '{count} 件のウェブサイトを配信しました' },
    items: { other: '{count} 件の成果物を配信しました' },
    more: {
      file: { other: 'ファイルをさらに {count} 件表示' },
      website: { other: 'ウェブサイトをさらに {count} 件表示' },
      item: { other: '成果物をさらに {count} 件表示' },
    },
  },
  es: {
    files: { one: 'Se editó {count} archivo', other: 'Se editaron {count} archivos' },
    websites: { one: 'Se entregó {count} sitio web', other: 'Se entregaron {count} sitios web' },
    items: { one: 'Se entregó {count} elemento', other: 'Se entregaron {count} elementos' },
    more: {
      file: { one: 'Mostrar {count} archivo más', other: 'Mostrar {count} archivos más' },
      website: { one: 'Mostrar {count} sitio web más', other: 'Mostrar {count} sitios web más' },
      item: { one: 'Mostrar {count} elemento más', other: 'Mostrar {count} elementos más' },
    },
  },
  fr: {
    files: { one: '{count} fichier modifié', other: '{count} fichiers modifiés' },
    websites: { one: '{count} site Web livré', other: '{count} sites Web livrés' },
    items: { one: '{count} élément livré', other: '{count} éléments livrés' },
    more: {
      file: { one: 'Afficher {count} fichier de plus', other: 'Afficher {count} fichiers de plus' },
      website: { one: 'Afficher {count} site Web de plus', other: 'Afficher {count} sites Web de plus' },
      item: { one: 'Afficher {count} élément de plus', other: 'Afficher {count} éléments de plus' },
    },
  },
  de: {
    files: { one: '{count} Datei bearbeitet', other: '{count} Dateien bearbeitet' },
    websites: { one: '{count} Website geliefert', other: '{count} Websites geliefert' },
    items: { one: '{count} Element geliefert', other: '{count} Elemente geliefert' },
    more: {
      file: { one: '{count} weitere Datei anzeigen', other: '{count} weitere Dateien anzeigen' },
      website: { one: '{count} weitere Website anzeigen', other: '{count} weitere Websites anzeigen' },
      item: { one: '{count} weiteres Element anzeigen', other: '{count} weitere Elemente anzeigen' },
    },
  },
  ru: {
    files: {
      one: 'Изменён {count} файл',
      few: 'Изменено {count} файла',
      many: 'Изменено {count} файлов',
      other: 'Изменено {count} файла',
    },
    websites: {
      one: 'Доставлен {count} сайт',
      few: 'Доставлено {count} сайта',
      many: 'Доставлено {count} сайтов',
      other: 'Доставлено {count} сайта',
    },
    items: {
      one: 'Доставлен {count} элемент',
      few: 'Доставлено {count} элемента',
      many: 'Доставлено {count} элементов',
      other: 'Доставлено {count} элемента',
    },
    more: {
      file: {
        one: 'Показать ещё {count} файл',
        few: 'Показать ещё {count} файла',
        many: 'Показать ещё {count} файлов',
        other: 'Показать ещё {count} файла',
      },
      website: {
        one: 'Показать ещё {count} сайт',
        few: 'Показать ещё {count} сайта',
        many: 'Показать ещё {count} сайтов',
        other: 'Показать ещё {count} сайта',
      },
      item: {
        one: 'Показать ещё {count} элемент',
        few: 'Показать ещё {count} элемента',
        many: 'Показать ещё {count} элементов',
        other: 'Показать ещё {count} элемента',
      },
    },
  },
  pt: {
    files: { one: 'Editou {count} arquivo', other: 'Editou {count} arquivos' },
    websites: { one: 'Entregou {count} site', other: 'Entregou {count} sites' },
    items: { one: 'Entregou {count} item', other: 'Entregou {count} itens' },
    more: {
      file: { one: 'Mostrar mais {count} arquivo', other: 'Mostrar mais {count} arquivos' },
      website: { one: 'Mostrar mais {count} site', other: 'Mostrar mais {count} sites' },
      item: { one: 'Mostrar mais {count} item', other: 'Mostrar mais {count} itens' },
    },
  },
}

/** Copy plus the locale whose plural rules and number grouping apply. */
function copyFor(locale: string): { copy: DeliverablesCopy; locale: string } {
  const language = locale.toLowerCase().split('-')[0] ?? 'en'
  const copy = COPY[language]
  // A language outside the table falls back to English copy AND English rules,
  // so one language's plural categories never select another language's form.
  return copy === undefined ? { copy: COPY.en!, locale: 'en' } : { copy, locale }
}

function render(forms: PluralForms, count: number, locale: string): string {
  const category = pluralRule(locale).select(count)
  const template = forms[category] ?? forms.other ?? forms.one
  if (template === undefined) {
    throw new Error(`no deliverable plural form for locale ${JSON.stringify(locale)}`)
  }
  return template.replace('{count}', grouped(count, locale))
}

/**
 * Format the card summary sentence for one Turn's delivered files and websites.
 * @param files - number of delivered files.
 * @param websites - number of delivered websites.
 * @param locale - DSH's active locale id.
 * @returns the localized summary sentence.
 */
export function formatDeliverablesSummary(files: number, websites: number, locale: string): string {
  const resolved = copyFor(locale)
  if (files > 0 && websites === 0) return render(resolved.copy.files, files, resolved.locale)
  if (files === 0) return render(resolved.copy.websites, websites, resolved.locale)
  return render(resolved.copy.items, files + websites, resolved.locale)
}

/**
 * Format the "show more" line for hidden entries of one kind.
 * @param count - number of hidden entries.
 * @param kind - kind of the hidden entries.
 * @param locale - DSH's active locale id.
 * @returns the localized "show more" label.
 */
export function formatMoreDeliverables(count: number, kind: DeliverableKind, locale: string): string {
  const resolved = copyFor(locale)
  return render(resolved.copy.more[kind], count, resolved.locale)
}