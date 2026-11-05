import { describe, expect, it } from 'vitest'
import { formatDeliverablesSummary, formatMoreDeliverables } from '../src/client/deliverables-format.ts'

describe('deliverables plural formatting', () => {
  it('distinguishes singular and plural in English', () => {
    expect(formatDeliverablesSummary(1, 0, 'en')).toBe('Edited 1 file')
    expect(formatDeliverablesSummary(3, 0, 'en')).toBe('Edited 3 files')
    expect(formatDeliverablesSummary(0, 1, 'en')).toBe('Delivered 1 website')
    expect(formatDeliverablesSummary(0, 2, 'en')).toBe('Delivered 2 websites')
    expect(formatDeliverablesSummary(2, 1, 'en')).toBe('Delivered 3 items')
    expect(formatMoreDeliverables(1, 'file', 'en')).toBe('Show 1 more file')
    expect(formatMoreDeliverables(2, 'website', 'en')).toBe('Show 2 more websites')
  })

  it('keeps the invariant Chinese and Japanese forms', () => {
    expect(formatDeliverablesSummary(2, 0, 'zh')).toBe('已编辑 2 个文件')
    expect(formatDeliverablesSummary(0, 1, 'zh')).toBe('交付 1 个网站')
    expect(formatDeliverablesSummary(3, 2, 'zh')).toBe('已交付 5 项产物')
    expect(formatMoreDeliverables(2, 'item', 'zh')).toBe('再显示 2 个产物')
    expect(formatDeliverablesSummary(2, 0, 'ja')).toBe('2 件のファイルを編集しました')
    expect(formatMoreDeliverables(2, 'website', 'ja')).toBe('ウェブサイトをさらに 2 件表示')
  })

  it('inflects Romance and German sentences with the count', () => {
    expect(formatDeliverablesSummary(1, 0, 'es')).toBe('Se editó 1 archivo')
    expect(formatDeliverablesSummary(2, 0, 'es')).toBe('Se editaron 2 archivos')
    expect(formatDeliverablesSummary(0, 1, 'es')).toBe('Se entregó 1 sitio web')
    expect(formatDeliverablesSummary(2, 1, 'es')).toBe('Se entregaron 3 elementos')
    expect(formatMoreDeliverables(1, 'file', 'es')).toBe('Mostrar 1 archivo más')
    expect(formatDeliverablesSummary(1, 0, 'fr')).toBe('1 fichier modifié')
    expect(formatDeliverablesSummary(2, 0, 'fr')).toBe('2 fichiers modifiés')
    expect(formatMoreDeliverables(1, 'website', 'fr')).toBe('Afficher 1 site Web de plus')
    expect(formatDeliverablesSummary(1, 0, 'de')).toBe('1 Datei bearbeitet')
    expect(formatDeliverablesSummary(2, 0, 'de')).toBe('2 Dateien bearbeitet')
    expect(formatMoreDeliverables(1, 'item', 'de')).toBe('1 weiteres Element anzeigen')
    expect(formatDeliverablesSummary(1, 0, 'pt')).toBe('Editou 1 arquivo')
    expect(formatDeliverablesSummary(0, 2, 'pt-BR')).toBe('Entregou 2 sites')
    expect(formatMoreDeliverables(1, 'item', 'pt')).toBe('Mostrar mais 1 item')
  })

  it('uses one / few / many in Russian', () => {
    expect(formatDeliverablesSummary(1, 0, 'ru')).toBe('Изменён 1 файл')
    expect(formatDeliverablesSummary(2, 0, 'ru')).toBe('Изменено 2 файла')
    expect(formatDeliverablesSummary(5, 0, 'ru')).toBe('Изменено 5 файлов')
    expect(formatDeliverablesSummary(0, 2, 'ru')).toBe('Доставлено 2 сайта')
    expect(formatDeliverablesSummary(1, 1, 'ru')).toBe('Доставлено 2 элемента')
    expect(formatMoreDeliverables(2, 'file', 'ru')).toBe('Показать ещё 2 файла')
    expect(formatMoreDeliverables(5, 'website', 'ru')).toBe('Показать ещё 5 сайтов')
  })

  it('falls back to English copy and English plural rules', () => {
    expect(formatDeliverablesSummary(1, 0, 'ko')).toBe('Edited 1 file')
    expect(formatDeliverablesSummary(2, 0, 'ko')).toBe('Edited 2 files')
    expect(formatMoreDeliverables(1, 'item', 'ko')).toBe('Show 1 more item')
  })
})