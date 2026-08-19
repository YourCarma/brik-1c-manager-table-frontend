/**
 * Фасад сервиса — **единственная точка**, через которую экраны ходят за данными.
 *
 * ТЗ 5.2: часть методов ещё не реализована на бэкенде (JSON-отчёт, фоновый режим,
 * история, переопределение участия). Разработка ведётся на моках; при появлении
 * реальных ручек подмена мока не должна требовать переписывания экранов —
 * именно поэтому весь выбор «мок или реальный вызов» сосредоточен здесь.
 *
 * Тяжёлые запросы проходят через `heavyGate`: одновременно к сервису идёт
 * не более одного (ТЗ 7.1.4).
 */
import * as http from './client'
import { ApiError } from './errors'
import { runHeavy } from './heavyGate'
import { periodLabel } from '@/lib/period'
import type {
  DownloadedFile,
  HistoryEntry,
  OrdersResponse,
  ReconciliationCheck,
  ReportResponse,
  ReportOverrides,
} from './types'

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

/**
 * Ручки, которых на бэкенде ещё нет (ТЗ 5.2). По мере готовности флаг снимается —
 * это единственная правка, которая нужна для перехода с мока на реальный вызов.
 */
export const PENDING_ENDPOINTS: Record<'reportJson' | 'background' | 'history' | 'overrides', boolean> = {
  reportJson: true,
  background: true,
  history: true,
  overrides: true,
}

/** Задержка мока, чтобы состояния ожидания были видны при разработке. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new ApiError({ kind: 'aborted', serverMessage: 'Запрос прерван' }))
      },
      { once: true },
    )
  })
}

/* ------------------------------------------------------------------ */
/* Состав заказов (С1) — ручка реализована                             */
/* ------------------------------------------------------------------ */

export async function getOrders(date: string, signal?: AbortSignal): Promise<OrdersResponse> {
  return runHeavy('orders', `Состав заказов за ${periodLabel(date) || date}`, async () => {
    if (!USE_MOCKS) return http.fetchOrders(date, signal)

    const { buildOrdersResponse } = await import('./mocks/dataset')
    const period = await resolvePeriodInMock(date)
    await delay(700, signal)
    return buildOrdersResponse(period)
  })
}

/* ------------------------------------------------------------------ */
/* Расчёт (С2) — ручка реализована, отдаёт файл                        */
/* ------------------------------------------------------------------ */

export async function runReportFile(
  date: string,
  options: { signal?: AbortSignal; overrides?: Record<string, boolean> } = {},
): Promise<DownloadedFile> {
  return runHeavy('report', `Расчёт за ${periodLabel(date) || date}`, async () => {
    if (!USE_MOCKS) {
      const body = options.overrides
        ? ({ allocation_overrides: options.overrides } satisfies ReportOverrides)
        : undefined
      return http.runReport(date, { signal: options.signal, body })
    }

    const { buildReportResponse, buildFailedChecks, scenarioFor } = await import('./mocks/dataset')
    const period = await resolvePeriodInMock(date)
    await delay(2200, options.signal)

    const scenario = scenarioFor(period)
    if (scenario === 'reconciliation_failed') throw reconciliationError(buildFailedChecks())
    if (scenario === 'empty') throw emptyPeriodError(period)

    const report = buildReportResponse(period, { overrides: options.overrides })
    const { buildMockWorkbook } = await import('./mocks/workbook')
    return {
      blob: await buildMockWorkbook(report),
      filename: `Факт_управленка_${period}.xlsx`,
    }
  })
}

/* ------------------------------------------------------------------ */
/* JSON-отчёт (С3) — ручки ещё нет, работаем на моке (ТЗ 5.2)          */
/* ------------------------------------------------------------------ */

export async function getReport(
  date: string,
  options: { signal?: AbortSignal; overrides?: Record<string, boolean> } = {},
): Promise<ReportResponse> {
  if (!PENDING_ENDPOINTS.reportJson) {
    // Место для реального вызова, когда ручка появится. Экраны при этом
    // не меняются — меняется только эта ветка (ТЗ 5.2).
    throw new ApiError({
      kind: 'service',
      serverMessage: 'Метод получения отчёта в JSON ещё не подключён',
    })
  }

  const { buildReportResponse, buildFailedChecks, scenarioFor } = await import('./mocks/dataset')
  const period = await resolvePeriodInMock(date)
  await delay(400, options.signal)

  const scenario = scenarioFor(period)
  if (scenario === 'reconciliation_failed') throw reconciliationError(buildFailedChecks())
  if (scenario === 'empty') throw emptyPeriodError(period)

  return buildReportResponse(period, { overrides: options.overrides })
}

/* ------------------------------------------------------------------ */
/* История расчётов (С6) — ручки ещё нет                               */
/* ------------------------------------------------------------------ */

export async function getHistory(signal?: AbortSignal): Promise<HistoryEntry[]> {
  const { buildHistory } = await import('./mocks/dataset')
  await delay(300, signal)
  return buildHistory()
}

/* ------------------------------------------------------------------ */
/* Служебное                                                           */
/* ------------------------------------------------------------------ */

export async function checkHealth(signal?: AbortSignal): Promise<boolean> {
  if (USE_MOCKS) {
    await delay(120, signal)
    return true
  }
  try {
    const result = await http.fetchHealth(signal)
    return String(result.status).toLowerCase() === 'ok'
  } catch {
    return false
  }
}

export { saveFile } from './client'

/* ------------------------------------------------------------------ */
/* Разбор периода в моке                                               */
/* ------------------------------------------------------------------ */

/**
 * В боевом режиме период разбирает бэкенд (ТЗ 5.3.3), и фронт правил разбора
 * не знает. Но мок обязан вести себя как бэкенд: принять человеческую запись
 * и отвергнуть двузначный год и тринадцатый месяц с тем же сообщением.
 * Эта функция живёт **только внутри мок-слоя** и никогда не вызывается,
 * когда работают настоящие ручки.
 */
async function resolvePeriodInMock(input: string): Promise<string> {
  const raw = input.trim()
  const accepted = 'Принимаются: 2026-06, 06.2026, 6/2026, июнь 2026, июня 2026, June 2026'

  const months: Record<string, number> = {
    январь: 1, января: 1, january: 1, jan: 1,
    февраль: 2, февраля: 2, february: 2, feb: 2,
    март: 3, марта: 3, march: 3, mar: 3,
    апрель: 4, апреля: 4, april: 4, apr: 4,
    май: 5, мая: 5, may: 5,
    июнь: 6, июня: 6, june: 6, jun: 6,
    июль: 7, июля: 7, july: 7, jul: 7,
    август: 8, августа: 8, august: 8, aug: 8,
    сентябрь: 9, сентября: 9, september: 9, sep: 9,
    октябрь: 10, октября: 10, october: 10, oct: 10,
    ноябрь: 11, ноября: 11, november: 11, nov: 11,
    декабрь: 12, декабря: 12, december: 12, dec: 12,
  }

  const fail = (message: string) =>
    new ApiError({ kind: 'period', status: 400, serverMessage: `${message} ${accepted}` })

  if (!raw) throw fail('Период не указан.')

  let year: number | null = null
  let month: number | null = null

  const iso = /^(\d{4})-(\d{1,2})$/.exec(raw)
  const dotted = /^(\d{1,2})[./](\d{2,4})$/.exec(raw)
  const worded = /^([\p{L}]+)\s+(\d{2,4})$/u.exec(raw)

  if (iso) {
    year = Number(iso[1])
    month = Number(iso[2])
  } else if (dotted) {
    month = Number(dotted[1])
    if (dotted[2].length !== 4) throw fail('Двузначный год не принимается.')
    year = Number(dotted[2])
  } else if (worded) {
    month = months[worded[1].toLowerCase()] ?? null
    if (month === null) throw fail(`Не удалось разобрать месяц «${worded[1]}».`)
    if (worded[2].length !== 4) throw fail('Двузначный год не принимается.')
    year = Number(worded[2])
  } else {
    throw fail(`Не удалось разобрать период «${raw}».`)
  }

  if (month === null || month < 1 || month > 12) throw fail(`Месяца ${month} не существует.`)
  if (year === null || year < 2000 || year > 2100) throw fail(`Год ${year} вне допустимого диапазона.`)

  return `${year}-${String(month).padStart(2, '0')}`
}

/**
 * Отказ по сходимости (С4).
 *
 * Текст ошибки собирается построчно из тех же проверок, что уходят в поле
 * `checks`: сегодня бэкенд отдаёт их именно текстом, и экран обязан работать
 * в обоих режимах — и с текстом, и со структурой (ТЗ 5.2, С4).
 */
function reconciliationError(checks: ReconciliationCheck[]): ApiError {
  const lines = checks
    .filter((c) => !c.passed)
    .map(
      (c) =>
        `${c.name}: ожидалось ${c.expected}, получено ${c.actual}, расхождение ${c.difference ?? ''}`,
    )

  return new ApiError({
    kind: 'reconciliation',
    status: 422,
    serverMessage: ['Расчёт выполнен, но не сошёлся с данными 1С. Отчёт не выдан.', ...lines].join('\n'),
    checks,
  })
}

function emptyPeriodError(period: string): ApiError {
  return new ApiError({
    kind: 'validation',
    status: 422,
    serverMessage: `За ${periodLabel(period)} в 1С нет ни одной номенклатурной группы с оборотом — рассчитывать нечего.`,
  })
}
