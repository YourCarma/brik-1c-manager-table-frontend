/**
 * Прогон по критериям приёмки ТЗ, раздел 11. Контрольный период — июнь 2026.
 *
 * Запуск: `npm run check`
 *
 * Скрипт проверяет то, что можно проверить без браузера: контрольные суммы
 * эталонного набора, правила формата денежных величин (ТЗ 5.3), терпимость
 * таблиц к составу колонок (критерий 11.9) и сборку книги `.xlsx` с живыми
 * формулами. Экранные критерии (11.1, 11.6, 11.7) проверяются руками —
 * сценарии для них описаны в README.
 */
import { buildOrdersResponse, buildReportResponse } from '@/api/mocks/dataset'
import { buildMockWorkbook } from '@/api/mocks/workbook'
import { formatMoney, compareMoney, sumMoney, toDecimal } from '@/lib/money'
import { resolveColumns } from '@/lib/columns'
import { periodLabel } from '@/lib/period'
import { filenameFromDisposition } from '@/api/client'
import { loadExcelJS } from '@/lib/exceljs'

const NBSP = ' '
let failed = 0

function check(name: string, actual: unknown, expected: unknown) {
  const ok = String(actual) === String(expected)
  if (!ok) failed++
  console.log(
    `${ok ? '  OK  ' : ' FAIL '} ${name}: ${actual}${ok ? '' : `  (ожидалось ${expected})`}`,
  )
}

function money(value: string) {
  return value.replaceAll(' ', NBSP)
}

function group(title: string) {
  console.log(`\n${title}`)
}

/* --- Критерий 11.2: состав заказов за июнь 2026 ------------------------ */

group('11.2 · Состав заказов за июнь 2026')
const orders = buildOrdersResponse('2026-06')
check('всего номенклатурных групп', orders.total, 27)
check('суммарный оборот', formatMoney(orders.total_turnover), money('42 812 784,23'))
check(
  'заказы отсортированы по убыванию оборота',
  orders.orders.every((o, i) => i === 0 || compareMoney(orders.orders[i - 1].turnover, o.turnover) >= 0),
  true,
)

/* --- Критерий 11.4, 11.5: суммы отчёта -------------------------------- */

group('11.4 · Контрольные суммы отчёта')
const report = buildReportResponse('2026-06')
check('себестоимость по 1С', formatMoney(report.total_cost_1c), money('15 124 465,77'))
check('оборот 26 счёта', formatMoney(report.overhead_26_total), money('5 639 903,92'))
check('полная упр. себестоимость', formatMoney(report.total_full_cost), money('20 764 369,69'))
check('база распределения', formatMoney(report.allocation_base), money('1 103 680,69'))
check('сумма долей распределения', sumMoney(report.orders.map((o) => o.allocation_share)), '100.00')
check(
  'расшифровка 26 счёта сходится с оборотом',
  sumMoney(Object.values(report.articles_26)),
  report.overhead_26_total,
)
check(
  'полная себестоимость = себестоимость по 1С + брак + 26 сч',
  sumMoney([report.total_cost_1c, report.total_defects, report.overhead_26_total]),
  report.total_full_cost,
)
check('все сверки отчёта прошли', report.checks?.every((c) => c.passed), true)

/* --- Критерий 11.5 и ТЗ 5.3: формат сумм ------------------------------ */

group('11.5 · Формат и точность сумм (ТЗ 5.3.1, 5.3.2)')
check('ноль показывается как 0,00', formatMoney('0.00'), '0,00')
check('нет данных — пустая ячейка', `«${formatMoney(null)}»`, '««»'.replace('««', '«'))
check('копейки не теряются', formatMoney('15124465.77'), money('15 124 465,77'))
check('разделитель разрядов — неразрывный пробел', formatMoney('1000.00').includes(NBSP), true)
check('десятичный разделитель — запятая', formatMoney('1000.5').endsWith(',50'), true)
check(
  'точность за пределами double сохраняется',
  formatMoney('9007199254740993.01'),
  money('9 007 199 254 740 993,01'),
)
check(
  'сравнение сумм не через parseFloat',
  compareMoney('9007199254740993.01', '9007199254740993.02'),
  -1,
)
check('сумма копеек без двоичной погрешности', sumMoney(['0.10', '0.20']), '0.30')
check('отрицательная сумма читается', toDecimal('-1.5')?.toFixed(2), '-1.50')

/* --- Критерий 11.9: новая колонка не ломает таблицы ------------------- */

group('11.9 · Новая целевая колонка не ломает таблицы')
const withNewColumn = report.orders.map((o) => ({
  ...o,
  by_column: { ...o.by_column, '44сч': '12345.67', 'НОВАЯ': '1.00' },
}))
const columns = resolveColumns(withNewColumn)
check('колонка 44 сч подхвачена из данных', columns.some((c) => c.key === '44сч'), true)
check('неизвестная колонка показана под своим ключом', columns.find((c) => c.key === 'НОВАЯ')?.title, 'НОВАЯ')
check('известные колонки остались в своём порядке', columns.slice(0, 5).map((c) => c.key).join(','), 'CC,CD,CE,28сч,CF')
check('новые колонки ушли в конец', columns.at(-1)?.key, 'НОВАЯ')

/* --- Критерий 11.3: имя файла из Content-Disposition ------------------ */

group('11.3 · Имя файла из Content-Disposition')
check(
  'кириллица в filename*',
  filenameFromDisposition(
    "attachment; filename*=UTF-8''%D0%A4%D0%B0%D0%BA%D1%82_%D1%83%D0%BF%D1%80%D0%B0%D0%B2%D0%BB%D0%B5%D0%BD%D0%BA%D0%B0_2026-06.xlsx",
  ),
  'Факт_управленка_2026-06.xlsx',
)
check(
  'обычный filename в кавычках',
  filenameFromDisposition('attachment; filename="Факт_управленка_2026-06.xlsx"'),
  'Факт_управленка_2026-06.xlsx',
)

/* --- Прочие состояния -------------------------------------------------- */

group('Состояния экранов')
check('подпись периода', periodLabel('2026-06'), 'июнь 2026')
check('пустой период — ни одной группы', buildOrdersResponse('2026-05').total, 0)
check('11.8 несопоставленные группы видны', orders.unmatched.length > 0, true)
check('действующий фильтр состава показан', orders.orders_filter !== null, true)
check(
  'оборот без номенклатурной группы',
  formatMoney(buildOrdersResponse('2026-03').turnover_without_order),
  money('184 220,51'),
)

/* --- Книга .xlsx с живыми формулами ------------------------------------ */

group('Книга .xlsx (ТЗ 5.1: формулы живые)')
const blob = await buildMockWorkbook(report)
const ExcelJS = await loadExcelJS()
const parsed = new ExcelJS.Workbook()
await parsed.xlsx.load(await blob.arrayBuffer())

check('книга содержит четыре листа', parsed.worksheets.length, 4)
check(
  'названия листов',
  parsed.worksheets.map((s) => s.name).join(' · '),
  'Свод по заказам · Распределение 26 сч · Расшифровка · Счёт 26 (период)',
)
// Флаг полного пересчёта проверяется по самому файлу, а не по разобранной модели:
// exceljs пишет `fullCalcOnLoad`, но обратно его не читает. Это тот самый признак,
// благодаря которому Excel пересчитывает формулы при открытии, а браузер их
// не считает (ТЗ 4.2.3). jszip берётся из зависимостей exceljs — скрипт служебный.
const JSZip = (await import('jszip')).default
const zip = await JSZip.loadAsync(await blob.arrayBuffer())
const workbookXml = (await zip.file('xl/workbook.xml')?.async('string')) ?? ''
check('Excel пересчитает формулы при открытии', workbookXml.includes('fullCalcOnLoad="1"'), true)

const summary = parsed.getWorksheet('Свод по заказам')!
const totalsRow = summary.getRow(4 + report.orders.length)
const totalsCell = totalsRow.getCell(2).value as { formula?: string }
check('строка итогов — живая формула', typeof totalsCell?.formula === 'string', true)

// Критерий 11.4: суммы на экране совпадают с содержимым файла до копейки.
// Сравниваются посчитанные бэкендом итоги и то, что лежит в книге.
const cost1cTotal = totalsRow.getCell(2 + Object.keys(report.orders[0].by_column).length).value
check(
  '11.4 итог себестоимости в файле совпадает с экраном',
  formatMoney(String((cost1cTotal as { result?: number })?.result ?? '')),
  formatMoney(report.total_cost_1c),
)
const fullCostTotal = totalsRow.getCell(3 + Object.keys(report.orders[0].by_column).length).value
check(
  '11.4 итог полной себестоимости в файле совпадает с экраном',
  formatMoney(String((fullCostTotal as { result?: number })?.result ?? '')),
  formatMoney(report.total_full_cost),
)

const allocation = parsed.getWorksheet('Распределение 26 сч')!
const shareCell = allocation.getRow(7).getCell(5).value as { formula?: string }
check('доля распределения — живая формула', typeof shareCell?.formula === 'string', true)
check(
  'признак участия записан значением, а не формулой',
  typeof allocation.getRow(7).getCell(4).value,
  'number',
)

console.log(
  failed === 0
    ? '\nВсе автоматические проверки приёмки прошли.'
    : `\nНе прошло проверок: ${failed}`,
)
process.exit(failed === 0 ? 0 : 1)
