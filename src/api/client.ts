/**
 * HTTP-клиент сервиса «Факт».
 *
 * ТЗ 10.2: адрес API берётся из переменной окружения, хардкод — дефект.
 * ТЗ 7.1: клиентский таймаут расчёта не меньше 15 минут; автоповторов тяжёлых
 * запросов силами фронта нет; одновременно к сервису идёт не более одного
 * тяжёлого запроса (см. `heavyGate`).
 */
import { ApiError, kindForStatus, messageFrom } from './errors'
import type { DownloadedFile, HealthResponse, OrdersResponse } from './types'

const API_PREFIX = '/api/v1/table-creator'

/** Базовый адрес сервиса. Пусто — тот же origin. */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

/** Таймаут расчёта. По ТЗ 7.1.1 — не меньше 15 минут; ниже опускаться не даём. */
export const REPORT_TIMEOUT_MS = Math.max(
  15 * 60 * 1000,
  Number(import.meta.env.VITE_REPORT_TIMEOUT_MINUTES ?? 20) * 60 * 1000 || 0,
)

/** Состав заказов на «холодной» базе — до полутора минут (ТЗ 7.1). Берём с запасом. */
export const ORDERS_TIMEOUT_MS = 5 * 60 * 1000

/** Проверка доступности — короткая, чтобы индикатор не залипал. */
export const HEALTH_TIMEOUT_MS = 10 * 1000

function url(path: string, params?: Record<string, string>): string {
  const query = params ? `?${new URLSearchParams(params).toString()}` : ''
  return `${API_BASE_URL}${path}${query}`
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  timeoutMs: number
  /** Внешний сигнал отмены — уход со страницы, явная отмена пользователем. */
  signal?: AbortSignal
}

async function request(target: string, options: RequestOptions): Promise<Response> {
  const controller = new AbortController()
  const onExternalAbort = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', onExternalAbort, { once: true })

  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, options.timeoutMs)

  try {
    return await fetch(target, {
      method: options.method ?? 'GET',
      signal: controller.signal,
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  } catch (cause) {
    if (timedOut) {
      // Клиент сдался раньше сервера — по ТЗ 7.1.1 этого быть не должно, но если
      // случилось, говорим об этом честно и как о таймауте, а не как о сбое сети.
      throw new ApiError({
        kind: 'accounting_timeout',
        serverMessage: `Ответ не получен за ${Math.round(options.timeoutMs / 60000)} мин.`,
        raw: cause,
      })
    }
    if (controller.signal.aborted) {
      throw new ApiError({ kind: 'aborted', serverMessage: 'Запрос прерван', raw: cause })
    }
    throw new ApiError({
      kind: 'offline',
      serverMessage: cause instanceof Error ? cause.message : String(cause),
      raw: cause,
    })
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onExternalAbort)
  }
}

async function readErrorBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function ensureOk(response: Response): Promise<Response> {
  if (response.ok) return response
  const body = await readErrorBody(response)
  const { kind, checks } = kindForStatus(response.status, body)
  throw new ApiError({
    kind,
    status: response.status,
    serverMessage: messageFrom(body) || response.statusText,
    checks,
    raw: body,
  })
}

async function json<T>(response: Response): Promise<T> {
  return (await ensureOk(response)).json() as Promise<T>
}

/* ------------------------------------------------------------------ */
/* Реализованные методы (ТЗ 5.1)                                       */
/* ------------------------------------------------------------------ */

/**
 * Состав заказов периода без запуска расчёта.
 * `date` уходит ровно в том виде, в каком его ввёл пользователь: разбор периода —
 * обязанность бэкенда (ТЗ 5.3.3).
 */
export async function fetchOrders(date: string, signal?: AbortSignal): Promise<OrdersResponse> {
  const response = await request(url(`${API_PREFIX}/orders`, { date }), {
    timeoutMs: ORDERS_TIMEOUT_MS,
    signal,
  })
  const data = await json<OrdersResponse>(response)
  return normalizeOrders(data)
}

/** Терпимость к форме `unmatched`: бэкенд может отдать строки, а может объекты. */
function normalizeOrders(data: OrdersResponse): OrdersResponse {
  const unmatched = (data.unmatched ?? []).map((item) =>
    typeof item === 'string' ? { order_key: item } : item,
  )
  return { ...data, orders: data.orders ?? [], unmatched }
}

/**
 * Полный расчёт месяца. Возвращает `.xlsx`.
 * Метод долгий: минуты, а не секунды (ТЗ 5.1, 7.1).
 */
export async function runReport(
  date: string,
  options: { signal?: AbortSignal; body?: unknown } = {},
): Promise<DownloadedFile> {
  const response = await request(url(`${API_PREFIX}/report`, { date }), {
    method: 'POST',
    body: options.body,
    timeoutMs: REPORT_TIMEOUT_MS,
    signal: options.signal,
  })
  await ensureOk(response)
  const blob = await response.blob()
  return {
    blob,
    filename: filenameFromDisposition(response.headers.get('Content-Disposition')) ?? 'Факт.xlsx',
  }
}

/** Доступность сервиса — для индикатора состояния (ТЗ 8, 9.7). */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await request(url('/health'), { timeoutMs: HEALTH_TIMEOUT_MS, signal })
  return json<HealthResponse>(response)
}

/**
 * Имя файла из `Content-Disposition` (ТЗ 5.1, С2.3).
 * Поддерживается и `filename*=UTF-8''…` (кириллица приходит именно так), и обычный
 * `filename="…"`.
 */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null

  const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header)
  if (extended?.[2]) {
    try {
      return decodeURIComponent(extended[2].trim())
    } catch {
      return extended[2].trim()
    }
  }

  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header)
  return plain?.[1]?.trim() ?? null
}

/** Сохранение полученного файла пользователю. */
export function saveFile(file: DownloadedFile): void {
  const href = URL.createObjectURL(file.blob)
  const link = document.createElement('a')
  link.href = href
  link.download = file.filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Отзываем ссылку не сразу: Chrome должен успеть начать скачивание.
  setTimeout(() => URL.revokeObjectURL(href), 60_000)
}
