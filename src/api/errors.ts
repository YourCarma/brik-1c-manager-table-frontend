/**
 * Классификация ошибок сервиса (ТЗ 8).
 *
 * Правило раздела 8: текст сервера показывается пользователю, но **не вместо**
 * человеческого объяснения. Поэтому ошибка несёт и `kind` (по нему экран выбирает
 * человеческую формулировку и действие), и `serverMessage` (сырой текст сервера
 * для блока «подробности» и для копирования сопровождению).
 */
import type { ReconciliationCheck } from './types'

export type ErrorKind =
  /** 400 — период не разобран (неизвестное слово, двузначный год, месяц 13). */
  | 'period'
  /** 422 — ошибка запроса: не передан `date`, лишний параметр, счёт вне плана счетов. */
  | 'validation'
  /** 422 — расчёт выполнен, но не сошёлся с 1С. Штатный сценарий, не авария (С4). */
  | 'reconciliation'
  /** 500 — не настроено подключение к 1С либо не удалось сохранить файл. */
  | 'service'
  /** 502 — 1С ответила ошибкой или нечитаемым телом. */
  | 'accounting_error'
  /** 504 — 1С не ответила за отведённое время. */
  | 'accounting_timeout'
  /** Сеть недоступна, бэкенд не поднят. */
  | 'offline'
  /** Запрос прерван пользователем или уходом со страницы. */
  | 'aborted'
  /** Всё остальное. */
  | 'unknown'

export class ApiError extends Error {
  readonly kind: ErrorKind
  readonly status: number | null
  /** Сырой текст сервера — для блока «подробности», ТЗ 8 п.1. */
  readonly serverMessage: string
  /** Разобранные проверки сверки, если ошибка — отказ по сходимости. */
  readonly checks: ReconciliationCheck[]
  /** Полное тело ответа — для копирования сопровождению. */
  readonly raw: unknown

  constructor(init: {
    kind: ErrorKind
    status?: number | null
    serverMessage?: string
    checks?: ReconciliationCheck[]
    raw?: unknown
  }) {
    super(init.serverMessage || init.kind)
    this.name = 'ApiError'
    this.kind = init.kind
    this.status = init.status ?? null
    this.serverMessage = init.serverMessage ?? ''
    this.checks = init.checks ?? []
    this.raw = init.raw
  }

  /** Текст для кнопки «скопировать для сопровождения». */
  toSupportText(context: string): string {
    const parts = [
      `Сервис «Факт» — сообщение об ошибке`,
      `Что делали: ${context}`,
      `Код: ${this.status ?? 'нет ответа'} (${this.kind})`,
      `Текст сервера: ${this.serverMessage || '—'}`,
    ]
    if (this.raw !== undefined && typeof this.raw !== 'string') {
      try {
        parts.push(`Ответ: ${JSON.stringify(this.raw, null, 2)}`)
      } catch {
        /* тело не сериализуется — не беда, выше уже есть текст */
      }
    }
    return parts.join('\n')
  }
}

/** Признаки того, что 422 — это отказ по сходимости, а не ошибка запроса. */
const RECONCILIATION_MARKERS = [
  'сверк',
  'сошл',
  'сходим',
  'расхожден',
  'reconcil',
  'не совпад',
]

/**
 * Разделение 422 на «ошибка ввода» и «расчёт не сошёлся» — по ТЗ 8 это разные экраны.
 *
 * FastAPI отдаёт ошибки валидации массивом объектов с `loc`. Отказ по сходимости
 * приходит текстом (а после появления структурированного ответа — списком проверок).
 */
export function classify422(body: unknown): { kind: ErrorKind; checks: ReconciliationCheck[] } {
  const detail = extractDetail(body)

  const structured = extractChecks(body)
  if (structured.length > 0) return { kind: 'reconciliation', checks: structured }

  if (Array.isArray(detail) && detail.some((d) => d && typeof d === 'object' && 'loc' in d)) {
    return { kind: 'validation', checks: [] }
  }

  const text = messageFrom(body).toLowerCase()
  if (RECONCILIATION_MARKERS.some((marker) => text.includes(marker))) {
    return { kind: 'reconciliation', checks: parseChecksFromText(messageFrom(body)) }
  }

  return { kind: 'validation', checks: [] }
}

function extractDetail(body: unknown): unknown {
  if (body && typeof body === 'object' && 'detail' in body) {
    return (body as { detail: unknown }).detail
  }
  return undefined
}

/** Структурированный список проверок, когда бэкенд начнёт его отдавать (ТЗ 5.2, С4). */
function extractChecks(body: unknown): ReconciliationCheck[] {
  const candidates: unknown[] = []
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>
    candidates.push(obj.checks, obj.reconciliation, obj.failed_checks)
    const detail = obj.detail
    if (detail && typeof detail === 'object') {
      const d = detail as Record<string, unknown>
      candidates.push(d.checks, d.reconciliation, d.failed_checks)
    }
  }
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue
    const checks = candidate
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map<ReconciliationCheck>((c) => ({
        name: String(c.name ?? c.title ?? c.check ?? 'Проверка'),
        expected: String(c.expected ?? c.expect ?? ''),
        actual: String(c.actual ?? c.got ?? c.received ?? ''),
        difference: c.difference != null ? String(c.difference) : undefined,
        passed: c.passed === true,
      }))
    if (checks.length > 0) return checks
  }
  return []
}

/**
 * Разбор проверок из текста ошибки — до появления структурированного ответа
 * бэкенд отдаёт их построчно (ТЗ, С4). Разбор терпимый: не разобралось —
 * пользователь всё равно увидит исходный текст целиком.
 */
export function parseChecksFromText(text: string): ReconciliationCheck[] {
  const checks: ReconciliationCheck[] = []
  for (const line of text.split(/[\n;]+/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const expected = /ожидал\w*[:\s]+(-?[\d\s ]+[.,]?\d*)/i.exec(trimmed)
    const actual = /получен\w*[:\s]+(-?[\d\s ]+[.,]?\d*)/i.exec(trimmed)
    if (!expected || !actual) continue
    const difference = /расхожден\w*[:\s]+(-?[\d\s ]+[.,]?\d*)/i.exec(trimmed)
    const name = trimmed.split(/[:—-]/)[0]?.trim() || 'Проверка'
    checks.push({
      name,
      expected: normalizeNumeric(expected[1]),
      actual: normalizeNumeric(actual[1]),
      difference: difference ? normalizeNumeric(difference[1]) : undefined,
      passed: false,
    })
  }
  return checks
}

function normalizeNumeric(value: string): string {
  return value.replace(/[\s ]/g, '').replace(',', '.')
}

/** Человекочитаемый текст сервера из любого разумного формата тела ответа. */
export function messageFrom(body: unknown): string {
  if (body == null) return ''
  if (typeof body === 'string') return body
  if (typeof body !== 'object') return String(body)

  const obj = body as Record<string, unknown>
  const detail = obj.detail ?? obj.message ?? obj.error

  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const d = item as Record<string, unknown>
          const loc = Array.isArray(d.loc) ? d.loc.filter((p) => p !== 'query').join(' → ') : ''
          const msg = String(d.msg ?? d.message ?? '')
          return loc ? `${loc}: ${msg}` : msg
        }
        return String(item)
      })
      .filter(Boolean)
      .join('\n')
  }
  if (detail && typeof detail === 'object') {
    const d = detail as Record<string, unknown>
    if (typeof d.message === 'string') return d.message
  }
  try {
    return JSON.stringify(body)
  } catch {
    return ''
  }
}

/** Соответствие HTTP-кода виду ошибки по таблице ТЗ 8. */
export function kindForStatus(status: number, body: unknown): {
  kind: ErrorKind
  checks: ReconciliationCheck[]
} {
  switch (status) {
    case 400:
      return { kind: 'period', checks: [] }
    case 422:
      return classify422(body)
    case 500:
      return { kind: 'service', checks: [] }
    case 502:
      return { kind: 'accounting_error', checks: [] }
    case 504:
      return { kind: 'accounting_timeout', checks: [] }
    default:
      return { kind: status >= 500 ? 'service' : 'unknown', checks: [] }
  }
}
