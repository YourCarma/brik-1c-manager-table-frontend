/**
 * Демонстрационный набор данных для мок-слоя (ТЗ 5.2).
 *
 * Числа подобраны так, чтобы совпадать с контрольными значениями раздела 11 ТЗ
 * (контрольный период — **июнь 2026**):
 *  - 27 номенклатурных групп, суммарный оборот `42 812 784,23` (критерий 11.2);
 *  - себестоимость по 1С `15 124 465,77` по четырём эталонным заказам (критерий 11.4);
 *  - оборот 26 счёта `5 639 903,92` (критерий 11.4);
 *  - полная упр. себестоимость `20 764 369,69`.
 *
 * Вся арифметика здесь ведётся `Decimal`, а наружу отдаются строки — ровно как
 * это делает бэкенд (ТЗ 5.3.1).
 */
import Decimal from 'decimal.js'
import type {
  BreakdownRow,
  HistoryEntry,
  OrdersResponse,
  ReconciliationCheck,
  ReportOrder,
  ReportResponse,
} from '../types'

const d = (v: string | number) => new Decimal(v)
const money = (v: Decimal) => v.toFixed(2)

/** Контрольный период, на котором проверяется приёмка (ТЗ 11). */
export const CANONICAL_PERIOD = '2026-06'

/** Итоговые контрольные величины периода. */
const TOTAL_TURNOVER = d('42812784.23')
const OVERHEAD_26_TOTAL = d('5639903.92')
const ALLOCATION_BASE = d('1103680.69')

/* ------------------------------------------------------------------ */
/* Четыре эталонных заказа — состав отчёта                             */
/* ------------------------------------------------------------------ */

interface SeedOrder {
  code: string
  name: string
  cc: string
  cd: string
  ce: string
  directWage: string
  overhead26: string
  share: string
  wip: string
  inProgress: boolean
  articles: Array<[article: string, amount: string]>
}

const REFERENCE_ORDERS: SeedOrder[] = [
  {
    code: 'П3747',
    name: 'П3747 (изделие, 2 шт_Заказчик)',
    cc: '7015883.49',
    cd: '1151502.95',
    ce: '2956961.42',
    directWage: '910277.17',
    overhead26: '4651595.18',
    share: '82.48',
    wip: '3402881.15',
    inProgress: true,
    articles: [
      ['10. Материалы и комплектующие', '6240118.22'],
      ['10. Услуги сторонних организаций', '712445.27'],
      ['10. Командировочные расходы', '63320.00'],
      ['20. ЗП производственных рабочих', '910277.17'],
      ['20. Страховые взносы', '241225.78'],
      ['25. Общепроизводственные расходы', '2956961.42'],
    ],
  },
  {
    code: 'П3810',
    name: 'П3810 (изделие, 1 шт_Заказчик)',
    cc: '1480220.15',
    cd: '124460.00',
    ce: '305118.40',
    directWage: '98000.00',
    overhead26: '500783.92',
    share: '8.88',
    wip: '612440.08',
    inProgress: true,
    articles: [
      ['10. Материалы и комплектующие', '1320000.00'],
      ['10. Услуги сторонних организаций', '160220.15'],
      ['20. ЗП производственных рабочих', '98000.00'],
      ['20. Страховые взносы', '26460.00'],
      ['25. Общепроизводственные расходы', '305118.40'],
    ],
  },
  {
    code: 'П3822',
    name: 'П3822 (комплект, 4 шт_Заказчик)',
    cc: '1002340.77',
    cd: '77982.47',
    ce: '190445.12',
    directWage: '61403.52',
    overhead26: '313780.05',
    share: '5.56',
    wip: '0.00',
    inProgress: false,
    articles: [
      ['10. Материалы и комплектующие', '940000.00'],
      ['10. Командировочные расходы', '62340.77'],
      ['20. ЗП производственных рабочих', '61403.52'],
      ['20. Страховые взносы', '16578.95'],
      ['25. Общепроизводственные расходы', '190445.12'],
    ],
  },
  {
    code: 'П3915',
    name: 'П3915 (изделие, 1 шт_Заказчик)',
    cc: '640118.00',
    cd: '43180.00',
    ce: '136253.00',
    directWage: '34000.00',
    overhead26: '173744.77',
    share: '3.08',
    wip: '295118.44',
    inProgress: true,
    articles: [
      ['10. Материалы и комплектующие', '600000.00'],
      ['10. Услуги сторонних организаций', '40118.00'],
      ['20. ЗП производственных рабочих', '34000.00'],
      ['20. Страховые взносы', '9180.00'],
      ['25. Общепроизводственные расходы', '136253.00'],
    ],
  },
]

/** Статья затрат → счёт учёта и целевая колонка. Для построчной расшифровки. */
const ARTICLE_ROUTING: Record<string, { account: string; column: string }> = {
  '10. Материалы и комплектующие': { account: '20.01', column: 'CC' },
  '10. Услуги сторонних организаций': { account: '20.01', column: 'CC' },
  '10. Командировочные расходы': { account: '20.01', column: 'CC' },
  '20. ЗП производственных рабочих': { account: '20.01', column: 'CD' },
  '20. Страховые взносы': { account: '20.01', column: 'CD' },
  '25. Общепроизводственные расходы': { account: '25', column: 'CE' },
}

/** Расшифровка 26 счёта по статьям. Сумма равна `overhead_26_total`. */
const ARTICLES_26: Array<[string, string]> = [
  ['26. ЗП административно-управленческого персонала', '2145300.00'],
  ['26. Аренда', '1850000.00'],
  ['26. Страховые взносы АУП', '647880.60'],
  ['26. Амортизация', '402118.20'],
  ['26. Услуги связи и ИТ', '318445.12'],
  ['26. Прочие общехозяйственные', '276160.00'],
]

/* ------------------------------------------------------------------ */
/* Остальные 23 группы периода — есть в 1С, но в отчёт не попадают     */
/* ------------------------------------------------------------------ */

const OTHER_TURNOVERS = [
  '5120445.18',
  '3880210.07',
  '2945118.44',
  '2210880.00',
  '1980445.72',
  '1760118.30',
  '1512004.88',
  '1344780.15',
  '1105220.44',
  '980118.72',
  '874500.00',
  '760245.33',
  '648990.18',
  '540118.04',
  '455780.60',
  '380445.12',
  '310118.88',
  '254700.45',
  '198445.20',
  '144118.60',
  '98780.15',
  '54220.08',
]

const OTHER_NAMES = [
  'корпус в сборе',
  'рама сварная',
  'блок управления',
  'комплект ЗИП',
  'модуль питания',
  'опора несущая',
  'кожух защитный',
  'панель приборная',
  'узел приводной',
  'кронштейн',
  'платформа',
  'редуктор',
  'вал ведущий',
  'муфта',
  'крышка литая',
  'стойка',
  'траверса',
  'фланец',
  'ролик',
  'втулка',
  'шпиндель',
  'плита базовая',
  'патрубок',
]

function pseudoGuid(seed: number): string {
  const hex = (seed * 2654435761).toString(16).padStart(8, '0').slice(-8)
  return `${hex}-1c00-4a2b-9f3d-${hex}0e5c7a91`
}

interface PreviewSeed {
  code: string
  name: string
  turnover: string
  wip: string
  inProgress: boolean
  inReport: boolean
}

function buildPreviewSeeds(): PreviewSeed[] {
  const reference: PreviewSeed[] = REFERENCE_ORDERS.map((o) => ({
    code: o.code,
    name: o.name,
    // Оборот Дт по счетам расчёта = CC + CD + CE, брака в периоде нет.
    turnover: money(d(o.cc).plus(o.cd).plus(o.ce)),
    wip: o.wip,
    inProgress: o.inProgress,
    inReport: true,
  }))

  const referenceSum = reference.reduce((acc, o) => acc.plus(o.turnover), d(0))
  const explicitSum = OTHER_TURNOVERS.reduce((acc, v) => acc.plus(v), d(0))
  // Последняя группа добирает остаток, чтобы суммарный оборот совпал
  // с контрольным значением критерия 11.2 до копейки.
  const remainder = TOTAL_TURNOVER.minus(referenceSum).minus(explicitSum)
  const turnovers = [...OTHER_TURNOVERS, money(remainder)]

  const others: PreviewSeed[] = turnovers.map((turnover, i) => {
    const code = `П${3300 + i * 17}`
    const inProgress = i % 3 !== 2
    return {
      code,
      name: `${code} (${OTHER_NAMES[i % OTHER_NAMES.length]}, ${1 + (i % 5)} шт_Заказчик)`,
      turnover,
      wip: inProgress ? money(d(turnover).times('0.34').toDecimalPlaces(2)) : '0.00',
      inProgress,
      inReport: false,
    }
  })

  return [...reference, ...others]
}

/* ------------------------------------------------------------------ */
/* Сценарии периодов — чтобы состояния экранов можно было увидеть      */
/* ------------------------------------------------------------------ */

/**
 * Мок отвечает по-разному в зависимости от периода — это позволяет пройти
 * все состояния из ТЗ 8 и раздела 6, не поднимая тестовый стенд:
 *  - `2026-06` — контрольный период приёмки, всё сходится;
 *  - `2026-05` — в 1С нет ни одной группы с оборотом (пустое состояние);
 *  - `2026-04` — расчёт не сошёлся (С4);
 *  - `2026-03` — есть несопоставленные группы и оборот без номенклатурной группы;
 *  - остальные — как контрольный период.
 */
export type MockScenario = 'canonical' | 'empty' | 'reconciliation_failed' | 'warnings'

export function scenarioFor(period: string): MockScenario {
  switch (period) {
    case '2026-05':
      return 'empty'
    case '2026-04':
      return 'reconciliation_failed'
    case '2026-03':
      return 'warnings'
    default:
      return 'canonical'
  }
}

/* ------------------------------------------------------------------ */
/* Сборка ответов                                                      */
/* ------------------------------------------------------------------ */

export function buildOrdersResponse(period: string): OrdersResponse {
  const scenario = scenarioFor(period)

  if (scenario === 'empty') {
    return {
      period,
      orders: [],
      orders_filter: null,
      turnover_without_order: '0.00',
      total: 0,
      in_report_count: 0,
      in_progress_count: 0,
      total_turnover: '0.00',
      unmatched: [],
    }
  }

  const seeds = buildPreviewSeeds()
  const orders = seeds
    .map((seed, i) => ({
      order_key: pseudoGuid(i + 1),
      order_name: seed.name,
      order_code: seed.code,
      turnover: seed.turnover,
      wip_balance: seed.wip,
      in_progress: seed.inProgress,
      in_report: seed.inReport,
    }))
    // Бэкенд отдаёт заказы отсортированными по убыванию оборота (ТЗ 5.1).
    .sort((a, b) => d(b.turnover).comparedTo(d(a.turnover)))

  const warnings = scenario === 'warnings'

  return {
    period,
    orders,
    // Действующий фильтр состава: эталонный файл построен по четырём заказам,
    // в базе за июнь их 27 (ТЗ 12.2). Фильтр задан настройкой сервиса,
    // интерфейс показывает его только на чтение (ТЗ 9.7).
    orders_filter: 'П3747, П3810, П3822, П3915',
    turnover_without_order: warnings ? '184220.51' : '0.00',
    total: orders.length,
    in_report_count: orders.filter((o) => o.in_report).length,
    in_progress_count: orders.filter((o) => o.in_progress).length,
    total_turnover: money(orders.reduce((acc, o) => acc.plus(o.turnover), d(0))),
    unmatched: warnings
      ? [
          {
            order_key: pseudoGuid(901),
            order_name: 'Изделие без номера (доработка по письму)',
            turnover: '412880.44',
          },
          {
            order_key: pseudoGuid(902),
            order_name: 'Прочее производство',
            turnover: '77145.10',
          },
        ]
      : [
          {
            order_key: pseudoGuid(901),
            order_name: 'Изделие без номера (доработка по письму)',
            turnover: '412880.44',
          },
        ],
  }
}

function buildReportOrder(seed: SeedOrder, overrides: Record<string, boolean>): ReportOrder {
  const cost1c = d(seed.cc).plus(seed.cd).plus(seed.ce)
  const defects = d('0.00')
  const overridden = Object.prototype.hasOwnProperty.call(overrides, seed.code)
  const inAllocation = overridden ? overrides[seed.code] : true

  return {
    order_code: seed.code,
    order_name: seed.name,
    by_column: {
      CC: seed.cc,
      CD: seed.cd,
      CE: seed.ce,
      '28сч': money(defects),
      CF: inAllocation ? seed.overhead26 : '0.00',
    },
    by_article: Object.fromEntries(seed.articles),
    direct_wage: seed.directWage,
    overhead_26: inAllocation ? seed.overhead26 : '0.00',
    wip_balance: seed.wip,
    in_progress: seed.inProgress,
    cost_1c: money(cost1c),
    defects: money(defects),
    full_cost: money(cost1c.plus(defects).plus(inAllocation ? seed.overhead26 : '0.00')),
    in_allocation: inAllocation,
    allocation_share: inAllocation ? seed.share : '0.00',
    allocation_overridden: overridden,
  }
}

function buildBreakdown(orders: ReportOrder[]): BreakdownRow[] {
  const rows: BreakdownRow[] = []
  for (const order of orders) {
    for (const [article, amount] of Object.entries(order.by_article)) {
      const routing = ARTICLE_ROUTING[article] ?? { account: '20.01', column: 'CC' }
      rows.push({
        order_code: order.order_code,
        article,
        account: routing.account,
        amount,
        column: routing.column,
      })
    }
    if (order.in_allocation) {
      rows.push({
        order_code: order.order_code,
        article: '26. Общехозяйственные расходы (распределено)',
        account: '26',
        amount: order.overhead_26,
        column: 'CF',
      })
    }
  }
  return rows
}

/**
 * Пересчёт долей при ручном переопределении участия (С5).
 * В реальной работе это делает бэкенд — здесь только чтобы мок вёл себя правдоподобно.
 */
function reallocate(orders: ReportOrder[]): ReportOrder[] {
  const participating = orders.filter((o) => o.in_allocation)
  const base = participating.reduce((acc, o) => acc.plus(o.direct_wage), d(0))
  if (base.isZero()) return orders

  let distributed = d(0)
  return orders.map((order, index) => {
    if (!order.in_allocation) return order

    const isLastParticipating =
      participating[participating.length - 1]?.order_code === orders[index]?.order_code

    const share = d(order.direct_wage).div(base)
    const amount = isLastParticipating
      ? OVERHEAD_26_TOTAL.minus(distributed)
      : OVERHEAD_26_TOTAL.times(share).toDecimalPlaces(2)
    distributed = distributed.plus(amount)

    const cost1c = d(order.cost_1c)
    return {
      ...order,
      by_column: { ...order.by_column, CF: money(amount) },
      overhead_26: money(amount),
      allocation_share: share.times(100).toDecimalPlaces(2).toFixed(2),
      full_cost: money(cost1c.plus(order.defects).plus(amount)),
    }
  })
}

export function buildReportResponse(
  period: string,
  options: { overrides?: Record<string, boolean>; fromCache?: boolean } = {},
): ReportResponse {
  const overrides = options.overrides ?? {}
  const hasOverrides = Object.keys(overrides).length > 0

  let orders = REFERENCE_ORDERS.map((seed) => buildReportOrder(seed, overrides))
  if (hasOverrides) orders = reallocate(orders)

  const totalCost1c = orders.reduce((acc, o) => acc.plus(o.cost_1c), d(0))
  const totalDefects = orders.reduce((acc, o) => acc.plus(o.defects), d(0))
  const totalFullCost = orders.reduce((acc, o) => acc.plus(o.full_cost), d(0))

  const totalsByColumn: Record<string, string> = {}
  for (const order of orders) {
    for (const [key, value] of Object.entries(order.by_column)) {
      totalsByColumn[key] = money(d(totalsByColumn[key] ?? '0').plus(value))
    }
  }

  return {
    period,
    orders,
    overhead_26_total: money(OVERHEAD_26_TOTAL),
    articles_26: Object.fromEntries(ARTICLES_26),
    allocation_base: money(
      hasOverrides
        ? orders.filter((o) => o.in_allocation).reduce((acc, o) => acc.plus(o.direct_wage), d(0))
        : ALLOCATION_BASE,
    ),
    unmapped_orders: [],
    total_cost_1c: money(totalCost1c),
    total_defects: money(totalDefects),
    total_full_cost: money(totalFullCost),
    totals_by_column: totalsByColumn,
    breakdown: buildBreakdown(orders),
    checks: [
      {
        name: 'Себестоимость по 1С равна обороту Дт 20.01',
        expected: money(totalCost1c),
        actual: money(totalCost1c),
        difference: '0.00',
        passed: true,
      },
      {
        name: 'Распределённый 26 счёт равен обороту 26 счёта за период',
        expected: money(OVERHEAD_26_TOTAL),
        actual: money(orders.reduce((acc, o) => acc.plus(o.overhead_26), d(0))),
        difference: money(
          OVERHEAD_26_TOTAL.minus(orders.reduce((acc, o) => acc.plus(o.overhead_26), d(0))),
        ),
        passed: true,
      },
      {
        name: 'Полная упр. себестоимость равна сумме составляющих',
        expected: money(totalFullCost),
        actual: money(totalCost1c.plus(totalDefects).plus(OVERHEAD_26_TOTAL)),
        difference: money(totalFullCost.minus(totalCost1c.plus(totalDefects).plus(OVERHEAD_26_TOTAL))),
        passed: true,
      },
    ],
    from_cache: options.fromCache ?? false,
    overrides_applied: hasOverrides,
  }
}

/** Не сошедшиеся проверки для сценария С4. */
export function buildFailedChecks(): ReconciliationCheck[] {
  return [
    {
      name: 'Себестоимость по 1С равна обороту Дт 20.01',
      expected: '15124465.77',
      actual: '15122180.44',
      difference: '2285.33',
      passed: false,
    },
    {
      name: 'Распределённый 26 счёт равен обороту 26 счёта за период',
      expected: '5639903.92',
      actual: '5639903.92',
      difference: '0.00',
      passed: true,
    },
    {
      name: 'Сумма долей распределения равна 100 %',
      expected: '100.00',
      actual: '99.97',
      difference: '0.03',
      passed: false,
    },
  ]
}

/** Журнал расчётов для экрана истории (С6). */
export function buildHistory(): HistoryEntry[] {
  return [
    {
      id: 'run-2026-06-02',
      period: '2026-06',
      calculated_at: '2026-07-03T09:14:22',
      outcome: 'success',
      duration_seconds: 6,
      from_cache: true,
      filename: 'Факт_управленка_2026-06.xlsx',
    },
    {
      id: 'run-2026-06-01',
      period: '2026-06',
      calculated_at: '2026-07-02T17:41:08',
      outcome: 'reconciliation_failed',
      duration_seconds: 94,
      from_cache: false,
      note: 'Себестоимость по 1С разошлась с оборотом Дт 20.01 на 2 285,33',
    },
    {
      id: 'run-2026-05-01',
      period: '2026-05',
      calculated_at: '2026-06-02T10:22:55',
      outcome: 'success',
      duration_seconds: 81,
      from_cache: true,
      filename: 'Факт_управленка_2026-05.xlsx',
    },
    {
      id: 'run-2026-04-01',
      period: '2026-04',
      calculated_at: '2026-05-04T12:05:31',
      outcome: 'error',
      duration_seconds: 120,
      from_cache: false,
      note: 'Учётная система не ответила за отведённое время',
    },
  ]
}

export { REFERENCE_ORDERS, ARTICLES_26, OVERHEAD_26_TOTAL, ALLOCATION_BASE }
