/**
 * Сборка книги `.xlsx` для мок-режима.
 *
 * Настоящий файл строит бэкенд (ТЗ 5.1). Здесь воспроизводится его структура —
 * четыре листа и **живые формулы**, — чтобы экран просмотра и правки книги
 * можно было проверить без поднятого сервиса.
 *
 * Формулы намеренно настоящие: заказчик правит сумму 26 счёта или снимает признак
 * участия и видит пересчёт (ТЗ 5.1). Интерфейс это свойство файла не ломает.
 */
import Decimal from 'decimal.js'
import type { Cell, Row, Workbook } from 'exceljs'
import type { ReportResponse } from '../types'
import { periodLabel } from '@/lib/period'
import { loadExcelJS } from '@/lib/exceljs'
import { columnLetter } from '@/lib/excelRefs'

const HEADER_FILL = 'FFF0E6D2'
const INK = 'FF141210'
const RED = 'FFC1121F'

const MONEY_FORMAT = '# ##0.00'
const PERCENT_FORMAT = '0.00%'

export async function buildMockWorkbook(report: ReportResponse): Promise<Blob> {
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Факт'
  wb.created = new Date(0)
  // Флаг полного пересчёта: Excel пересчитает все формулы сразу при открытии.
  // Кэшированные значения в файле при этом есть — как их кладёт и сам Excel.
  wb.calcProperties.fullCalcOnLoad = true

  buildSummarySheet(wb, report)
  buildAllocationSheet(wb, report)
  buildBreakdownSheet(wb, report)
  buildAccount26Sheet(wb, report)

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/**
 * Формульная ячейка с кэшированным значением.
 *
 * Кэш обязателен: без него книга открывается пустой везде, где стоит формула,
 * пока Excel её не пересчитает, — и сверить экран с файлом до копейки
 * (критерий приёмки 11.4) становится нечем. Excel и любой генератор `.xlsx`
 * кладут в файл и формулу, и последнее посчитанное значение; мок ведёт себя так же.
 *
 * Число здесь неизбежно: формат `.xlsx` хранит значения двоичными. Источник
 * при этом остаётся точной строкой бэкенда, и на экране показывается
 * именно она (ТЗ 5.3.1).
 *
 * Известное ограничение `exceljs`: кэш, равный **нулю**, при записи теряется
 * (проверка на falsy внутри библиотеки). В мок-книге такая ячейка открывается
 * пустой со значком формулы — то есть «значение пересчитает Excel». Файлы
 * настоящего бэкенда этим не страдают: они пишутся не этой библиотекой.
 */
function formula(expression: string, cached: string | undefined) {
  return {
    formula: expression,
    result: cached === undefined ? undefined : Number(cached),
    date1904: false,
  }
}

function styleHeader(row: Row) {
  row.font = { bold: true, size: 10 }
  row.alignment = { vertical: 'middle', wrapText: true }
  row.eachCell((cell: Cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.border = {
      top: { style: 'thin', color: { argb: INK } },
      bottom: { style: 'medium', color: { argb: INK } },
      left: { style: 'hair', color: { argb: INK } },
      right: { style: 'hair', color: { argb: INK } },
    }
  })
}

function styleTotals(row: Row) {
  row.font = { bold: true, size: 10 }
  row.eachCell((cell: Cell) => {
    cell.border = { top: { style: 'medium', color: { argb: RED } } }
  })
}

function buildSummarySheet(wb: Workbook, report: ReportResponse) {
  const sheet = wb.addWorksheet('Свод по заказам', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }],
  })

  const columnKeys = collectColumns(report)

  sheet.mergeCells(1, 1, 1, columnKeys.length + 3)
  const title = sheet.getCell(1, 1)
  title.value = `Управленческая таблица «Факт» · ${periodLabel(report.period)}`
  title.font = { bold: true, size: 13, color: { argb: INK } }

  sheet.getRow(2).values = []

  const header = ['Заказ', ...columnKeys, 'Себестоимость по 1С', 'Полная упр. себестоимость']
  const headerRow = sheet.getRow(3)
  headerRow.values = header
  styleHeader(headerRow)

  report.orders.forEach((order, i) => {
    const rowIndex = 4 + i
    const row = sheet.getRow(rowIndex)
    row.getCell(1).value = order.order_code
    columnKeys.forEach((key, c) => {
      const cell = row.getCell(2 + c)
      cell.value = Number(order.by_column[key] ?? '0')
      cell.numFmt = MONEY_FORMAT
    })

    // Живые формулы: себестоимость по 1С = CC + CD + CE,
    // полная = все колонки. Пользователь правит слагаемое и видит пересчёт.
    const cost1cCell = row.getCell(columnKeys.length + 2)
    const cost1cRefs = columnKeys
      .filter((k) => k === 'CC' || k === 'CD' || k === 'CE')
      .map((k) => `${columnLetter(2 + columnKeys.indexOf(k))}${rowIndex}`)
    cost1cCell.value = formula(cost1cRefs.join('+'), order.cost_1c)
    cost1cCell.numFmt = MONEY_FORMAT

    const fullCell = row.getCell(columnKeys.length + 3)
    fullCell.value = formula(
      `SUM(${columnLetter(2)}${rowIndex}:${columnLetter(columnKeys.length + 1)}${rowIndex})`,
      order.full_cost,
    )
    fullCell.numFmt = MONEY_FORMAT
  })

  const totalsIndex = 4 + report.orders.length
  const totalsRow = sheet.getRow(totalsIndex)
  totalsRow.getCell(1).value = 'Итого'

  const columnTotals = [
    ...columnKeys.map((key) => report.totals_by_column?.[key] ?? '0'),
    report.total_cost_1c,
    report.total_full_cost,
  ]
  for (let c = 2; c <= columnKeys.length + 3; c++) {
    const cell = totalsRow.getCell(c)
    cell.value = formula(
      `SUM(${columnLetter(c)}4:${columnLetter(c)}${totalsIndex - 1})`,
      columnTotals[c - 2],
    )
    cell.numFmt = MONEY_FORMAT
  }
  styleTotals(totalsRow)

  sheet.getColumn(1).width = 14
  for (let c = 2; c <= columnKeys.length + 3; c++) sheet.getColumn(c).width = 20
}

function buildAllocationSheet(wb: Workbook, report: ReportResponse) {
  const sheet = wb.addWorksheet('Распределение 26 сч', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 6 }],
  })

  sheet.getCell('A1').value = 'Оборот 26 счёта за период'
  sheet.getCell('B1').value = Number(report.overhead_26_total)
  sheet.getCell('B1').numFmt = MONEY_FORMAT
  sheet.getCell('B1').font = { bold: true }

  sheet.getCell('A2').value = 'База распределения (прямая ЗП без взносов)'
  sheet.getCell('A4').value =
    'Признак участия задан формулой от прямой ЗП. Правка суммы 26 счёта или признака пересчитывает доли.'
  sheet.getCell('A4').font = { italic: true, size: 9 }

  const header = sheet.getRow(6)
  header.values = ['Заказ', 'Прямая ЗП', 'НЗП (справочно)', 'Участвует', 'Доля', 'CF']
  styleHeader(header)

  const first = 7
  report.orders.forEach((order, i) => {
    const r = first + i
    const row = sheet.getRow(r)
    row.getCell(1).value = order.order_code
    row.getCell(2).value = Number(order.direct_wage)
    row.getCell(2).numFmt = MONEY_FORMAT
    row.getCell(3).value = Number(order.wip_balance)
    row.getCell(3).numFmt = MONEY_FORMAT
    // Признак участия — значение, а не формула: если пользователь переопределил
    // участие в интерфейсе, файл обязан отражать именно переопределённое
    // состояние, иначе Excel пересчитает по-своему (ТЗ, С5).
    row.getCell(4).value = order.in_allocation === false ? 0 : 1
    // Доля в файле хранится как доля единицы: формат ячейки процентный.
    // Деление — через Decimal, чтобы кэш в файле не разошёлся с экраном.
    const share = order.allocation_share
    row.getCell(5).value = formula(
      `IF($B$2=0,0,B${r}*D${r}/$B$2)`,
      share === undefined ? undefined : new Decimal(share).div(100).toString(),
    )
    row.getCell(5).numFmt = PERCENT_FORMAT
    row.getCell(6).value = formula(`$B$1*E${r}`, order.overhead_26)
    row.getCell(6).numFmt = MONEY_FORMAT
  })

  const last = first + report.orders.length - 1
  sheet.getCell('B2').value = formula(
    `SUMPRODUCT(B${first}:B${last},D${first}:D${last})`,
    report.allocation_base,
  )
  sheet.getCell('B2').numFmt = MONEY_FORMAT
  sheet.getCell('B2').font = { bold: true }

  const totals = sheet.getRow(last + 1)
  totals.getCell(1).value = 'Итого'
  totals.getCell(2).value = formula(`SUM(B${first}:B${last})`, report.allocation_base)
  totals.getCell(2).numFmt = MONEY_FORMAT
  totals.getCell(5).value = formula(`SUM(E${first}:E${last})`, '1')
  totals.getCell(5).numFmt = PERCENT_FORMAT
  totals.getCell(6).value = formula(`SUM(F${first}:F${last})`, report.overhead_26_total)
  totals.getCell(6).numFmt = MONEY_FORMAT
  styleTotals(totals)

  sheet.getColumn(1).width = 14
  sheet.getColumn(2).width = 20
  sheet.getColumn(3).width = 20
  sheet.getColumn(4).width = 12
  sheet.getColumn(5).width = 12
  sheet.getColumn(6).width = 20
}

function buildBreakdownSheet(wb: Workbook, report: ReportResponse) {
  const sheet = wb.addWorksheet('Расшифровка', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  const header = sheet.getRow(1)
  header.values = ['Заказ', 'Статья затрат', 'Счёт учёта', 'Сумма', 'Целевая колонка']
  styleHeader(header)

  ;(report.breakdown ?? []).forEach((row, i) => {
    const r = sheet.getRow(2 + i)
    r.getCell(1).value = row.order_code
    r.getCell(2).value = row.article
    r.getCell(3).value = row.account
    r.getCell(4).value = Number(row.amount)
    r.getCell(4).numFmt = MONEY_FORMAT
    r.getCell(5).value = row.column
  })

  sheet.getColumn(1).width = 14
  sheet.getColumn(2).width = 46
  sheet.getColumn(3).width = 14
  sheet.getColumn(4).width = 20
  sheet.getColumn(5).width = 18
}

function buildAccount26Sheet(wb: Workbook, report: ReportResponse) {
  const sheet = wb.addWorksheet('Счёт 26 (период)', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  const header = sheet.getRow(1)
  header.values = ['Статья затрат', 'Сумма']
  styleHeader(header)

  const entries = Object.entries(report.articles_26)
  entries.forEach(([article, amount], i) => {
    const r = sheet.getRow(2 + i)
    r.getCell(1).value = article
    r.getCell(2).value = Number(amount)
    r.getCell(2).numFmt = MONEY_FORMAT
  })

  const totals = sheet.getRow(entries.length + 2)
  totals.getCell(1).value = 'Итого'
  totals.getCell(2).value = formula(`SUM(B2:B${entries.length + 1})`, report.overhead_26_total)
  totals.getCell(2).numFmt = MONEY_FORMAT
  styleTotals(totals)

  sheet.getColumn(1).width = 52
  sheet.getColumn(2).width = 20
}

function collectColumns(report: ReportResponse): string[] {
  const keys = new Set<string>()
  for (const order of report.orders) for (const key of Object.keys(order.by_column)) keys.add(key)
  return [...keys]
}

