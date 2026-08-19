/**
 * Книга `.xlsx` в браузере — просмотр и правка (UX-карта 7).
 *
 * Этого нет в ТЗ, это дополнительное пожелание заказчика. Реализация не нарушает
 * ни одного запрета ТЗ:
 *  - **формулы не пересчитываются в браузере** (ТЗ 4.2.3): книга читается и
 *    сохраняется вместе с формулами и оформлением, при записи выставляется флаг
 *    полного пересчёта, и пересчёт делает Excel при открытии файла;
 *  - **в 1С ничего не пишется** (ТЗ 4.2.1): правки живут только в скачанном файле;
 *  - живые формулы файла интерфейс не ломает и не дублирует (ТЗ 5.1).
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import Decimal from 'decimal.js'
import { formatDecimal } from '@/lib/money'
import { loadExcelJS } from '@/lib/exceljs'
import type { Workbook, Worksheet } from 'exceljs'

export type CellKind = 'empty' | 'text' | 'number' | 'formula'

export interface SheetCell {
  /** Адрес в книге: `B7`. */
  ref: string
  row: number
  col: number
  kind: CellKind
  /** Текст для показа. Денежные ячейки форматируются по правилам ТЗ 5.3.2. */
  display: string
  /** Текст для правки — то, что попадает в поле ввода. */
  editable: string
  /** Формула без ведущего `=`, если ячейка формульная. */
  formula?: string
  /** Значение формулы, взятое из файла (браузер его не пересчитывает). */
  cachedResult?: string
  /** Правая колонка чисел — как в Excel. */
  numeric: boolean
  /** Правил ли пользователь эту ячейку. */
  edited: boolean
}

export interface SheetModel {
  name: string
  rows: SheetCell[][]
  columnCount: number
  /** Ширины колонок из книги — оформление сохраняется как есть. */
  widths: number[]
  /** Лист не удалось прочитать — остальные при этом работают. */
  broken: boolean
}

interface PendingEdit {
  sheet: string
  ref: string
  /** Что записать: число, строка или удаление формулы. */
  value: number | string
  /** Была ли на этом месте формула — тогда правка её удаляет. */
  replacedFormula: boolean
}

const MONEY_FORMAT = /0\.00|#,##0\.00|# ##0\.00/

export const useWorkbookStore = defineStore('workbook', () => {
  /** Экземпляр книги ExcelJS. Через shallowRef: реактивность внутрь не нужна. */
  const workbook = shallowRef<Workbook | null>(null)
  /**
   * Исходный файл, из которого разобрана книга. Сравнивается по ссылке:
   * повторный расчёт того же периода даёт файл с тем же именем, и сравнение
   * по имени показало бы старую книгу вместо новой.
   */
  const source = shallowRef<Blob | null>(null)
  const sheets = ref<SheetModel[]>([])
  const filename = ref('')
  const loading = ref(false)
  const parseError = ref<string | null>(null)
  const edits = ref<PendingEdit[]>([])

  const dirty = computed(() => edits.value.length > 0)
  /** Есть ли в книге формулы, которые Excel пересчитает при открытии. */
  const hasFormulas = computed(() =>
    sheets.value.some((s) => s.rows.some((row) => row.some((c) => c.kind === 'formula'))),
  )

  /** Разбор книги. Ни одного обращения к сети: файл уже в памяти вкладки. */
  async function open(blob: Blob, name: string) {
    loading.value = true
    parseError.value = null
    edits.value = []
    filename.value = name
    source.value = blob

    try {
      const ExcelJS = await loadExcelJS()
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await blob.arrayBuffer())
      workbook.value = wb
      sheets.value = wb.worksheets.map(readSheet)
    } catch (cause) {
      parseError.value = cause instanceof Error ? cause.message : String(cause)
      workbook.value = null
      sheets.value = []
    } finally {
      loading.value = false
    }
  }

  function readSheet(sheet: Worksheet): SheetModel {
    try {
      const columnCount = Math.max(sheet.columnCount, 1)
      const rowCount = Math.max(sheet.rowCount, 1)
      const rows: SheetCell[][] = []

      for (let r = 1; r <= rowCount; r++) {
        const row: SheetCell[] = []
        for (let c = 1; c <= columnCount; c++) {
          row.push(readCell(sheet, r, c))
        }
        rows.push(row)
      }

      const widths: number[] = []
      for (let c = 1; c <= columnCount; c++) {
        widths.push(sheet.getColumn(c).width ?? 14)
      }

      return { name: sheet.name, rows, columnCount, widths, broken: false }
    } catch {
      return { name: sheet.name, rows: [], columnCount: 0, widths: [], broken: true }
    }
  }

  function readCell(sheet: Worksheet, r: number, c: number): SheetCell {
    const cell = sheet.getRow(r).getCell(c)
    const ref = cell.address
    const numFmt = cell.numFmt ?? ''
    const money = MONEY_FORMAT.test(numFmt)
    const value = cell.value

    // Объединённая ячейка: значение принадлежит ведущей, остальные — её
    // продолжение. Иначе заголовок на всю ширину повторялся бы в каждой колонке.
    if (cell.isMerged && cell.master?.address !== ref) {
      return { ref, row: r, col: c, kind: 'empty', display: '', editable: '', numeric: false, edited: false }
    }

    if (value === null || value === undefined || value === '') {
      return { ref, row: r, col: c, kind: 'empty', display: '', editable: '', numeric: false, edited: false }
    }

    if (typeof value === 'object' && 'formula' in value) {
      const result = (value as { result?: unknown }).result
      const shown = formatValue(result, money)
      return {
        ref,
        row: r,
        col: c,
        kind: 'formula',
        display: shown,
        editable: shown,
        formula: String((value as { formula: string }).formula),
        cachedResult: shown,
        numeric: typeof result === 'number',
        edited: false,
      }
    }

    if (typeof value === 'number') {
      const shown = formatValue(value, money)
      return { ref, row: r, col: c, kind: 'number', display: shown, editable: shown, numeric: true, edited: false }
    }

    const text = typeof value === 'object' ? extractRichText(value) : String(value)
    return { ref, row: r, col: c, kind: 'text', display: text, editable: text, numeric: false, edited: false }
  }

  function extractRichText(value: object): string {
    if ('richText' in value) {
      const parts = (value as { richText: Array<{ text: string }> }).richText
      return parts.map((p) => p.text).join('')
    }
    if ('text' in value) return String((value as { text: unknown }).text)
    if (value instanceof Date) return value.toLocaleDateString('ru-RU')
    return ''
  }

  /**
   * Форматирование числа книги.
   *
   * Числа в `.xlsx` физически хранятся как двоичные числа с плавающей точкой —
   * это свойство формата, а не решение интерфейса. Чтобы показ не добавлял
   * собственной погрешности, значение переводится в Decimal через десятичную
   * запись и форматируется правилами ТЗ 5.3.2.
   */
  function formatValue(value: unknown, money: boolean): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'number') {
      const decimal = new Decimal(String(value))
      if (money) return formatDecimal(decimal, 2)
      return decimal.isInteger() ? decimal.toFixed(0) : formatDecimal(decimal, 2)
    }
    if (value instanceof Date) return value.toLocaleDateString('ru-RU')
    if (typeof value === 'object') return extractRichText(value)
    return String(value)
  }

  /** Правка ячейки. `replacedFormula` — осознанная замена формулы значением. */
  function editCell(sheetName: string, cell: SheetCell, input: string) {
    const sheet = sheets.value.find((s) => s.name === sheetName)
    if (!sheet) return

    const target = sheet.rows[cell.row - 1]?.[cell.col - 1]
    if (!target) return

    const wasFormula = target.kind === 'formula'
    const parsed = parseNumeric(input)

    target.display = parsed === null ? input : formatDecimal(parsed, 2)
    target.editable = input
    target.edited = true
    if (wasFormula) {
      target.kind = parsed === null ? 'text' : 'number'
      target.formula = undefined
    }
    target.numeric = parsed !== null

    edits.value = [
      ...edits.value.filter((e) => !(e.sheet === sheetName && e.ref === target.ref)),
      {
        sheet: sheetName,
        ref: target.ref,
        // ExcelJS пишет в книгу число — формат `.xlsx` другого способа не даёт.
        value: parsed === null ? input : Number(parsed.toFixed(2)),
        replacedFormula: wasFormula,
      },
    ]
  }

  /** Ввод человека может быть в русской записи: `15 124 465,77`. */
  function parseNumeric(input: string): Decimal | null {
    const normalized = input.trim().replace(/[\s ]/g, '').replace(',', '.')
    if (normalized === '' || !/^-?\d+(\.\d+)?$/.test(normalized)) return null
    try {
      return new Decimal(normalized)
    } catch {
      return null
    }
  }

  /** Откат к исходному файлу. Обращения к сервису нет — он лежит в памяти вкладки. */
  function discard() {
    if (!source.value) return Promise.resolve()
    return open(source.value, filename.value)
  }

  /**
   * Сохранение правленой книги.
   *
   * Оформление, ширины колонок, объединения и **все остальные формулы**
   * сохраняются как есть. Выставляется флаг полного пересчёта: Excel пересчитает
   * формулы сразу при открытии — считать их в браузере запрещено (ТЗ 4.2.3).
   */
  async function save(): Promise<{ blob: Blob; filename: string } | null> {
    const wb = workbook.value
    if (!wb) return null

    for (const edit of edits.value) {
      const sheet = wb.getWorksheet(edit.sheet)
      if (!sheet) continue
      sheet.getCell(edit.ref).value = edit.value
    }

    wb.calcProperties.fullCalcOnLoad = true

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    // Суффикс обязателен: правленый файл не должен затирать исходный
    // в папке «Загрузки» и обязан быть отличим при переносе в таблицу менеджеров.
    const dot = filename.value.lastIndexOf('.')
    const base = dot > 0 ? filename.value.slice(0, dot) : filename.value
    const ext = dot > 0 ? filename.value.slice(dot) : '.xlsx'

    return { blob, filename: `${base} (правка)${ext}` }
  }

  function reset() {
    workbook.value = null
    source.value = null
    sheets.value = []
    filename.value = ''
    edits.value = []
    parseError.value = null
  }

  return {
    source,
    sheets,
    filename,
    loading,
    parseError,
    edits,
    dirty,
    hasFormulas,
    open,
    editCell,
    discard,
    save,
    reset,
  }
})
