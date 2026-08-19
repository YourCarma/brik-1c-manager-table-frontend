/**
 * Расчёт месяца и его результат — сценарии С2, С3, С4, С5.
 *
 * Поведение подчинено ТЗ 7.1:
 *  - клиентский таймаут не короче 15 минут (задан в клиенте), обрывать раньше
 *    сервера нельзя — это потеря уже выполненной работы;
 *  - индикация с первой секунды, объяснение длительности по стадиям;
 *  - **никаких автоповторов**: повтор только по явному действию человека;
 *  - второй тяжёлый запрос физически невозможен (шлюз `heavyGate`).
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getReport, runReportFile, saveFile } from '@/api/service'
import { ApiError } from '@/api/errors'
import { HeavyBusyError } from '@/api/heavyGate'
import { HAS_REPORT_JSON } from '@/config/features'
import { periodLabel } from '@/lib/period'
import type { DownloadedFile, ReconciliationCheck, ReportResponse } from '@/api/types'

export type CalcStatus = 'idle' | 'running' | 'done' | 'failed' | 'mismatch' | 'aborted'

/** Стадии ожидания (UX-карта 5.5). Процента выполнения нет: сервис его не отдаёт. */
export interface CalcStage {
  title: string
  text: string
  /** Показывать ли кнопку прерывания на этой стадии. */
  offerAbort: boolean
  /** Показывать ли кнопку копирования для сопровождения. */
  offerSupport: boolean
}

const STAGES: Array<{ from: number; stage: (label: string) => CalcStage }> = [
  {
    from: 900,
    stage: () => ({
      title: 'Расчёт идёт дольше обычного',
      text:
        'Прошло больше 15 минут — это дольше, чем ожидается даже на «холодной» базе. ' +
        'Сервис всё ещё держит запрос, обрывать его самостоятельно интерфейс не будет. ' +
        'Если ждать дальше не имеет смысла — прервите расчёт и передайте сопровождению ' +
        'время начала расчёта и период.',
      offerAbort: true,
      offerSupport: true,
    }),
  },
  {
    from: 300,
    stage: () => ({
      title: 'Расчёт продолжается',
      text:
        'Расчёт идёт больше пяти минут. Это в пределах нормы — предельное время 15 минут. ' +
        'Если ждать некогда, расчёт можно прервать и запустить позже: в 1С ничего ' +
        'не изменится, файл просто не будет сформирован.',
      offerAbort: true,
      offerSupport: false,
    }),
  },
  {
    from: 60,
    stage: () => ({
      title: 'Расчёт продолжается',
      text:
        'Идёт больше минуты. Похоже, база 1С была в простое и сейчас прогревается. ' +
        'Прерывать не нужно: работа, которую сервис уже сделал, при прерывании потеряется.',
      offerAbort: true,
      offerSupport: false,
    }),
  },
  {
    from: 10,
    stage: (label) => ({
      title: `Считаем «Факт» за ${label}`,
      text:
        'Расчёт идёт дольше десяти секунд — это нормально. Сервис забирает проводки ' +
        'из 1С; первый запрос после простоя базы стоит около полутора минут.',
      offerAbort: false,
      offerSupport: false,
    }),
  },
  {
    from: 0,
    stage: (label) => ({
      title: `Считаем «Факт» за ${label}`,
      text: 'Запрос отправлен в сервис.',
      offerAbort: false,
      offerSupport: false,
    }),
  },
]

export const useCalcStore = defineStore('calc', () => {
  const status = ref<CalcStatus>('idle')
  /** Период, за который шёл или идёт расчёт. */
  const period = ref<string | null>(null)
  const elapsed = ref(0)
  const startedAt = ref<Date | null>(null)
  const finishedAt = ref<Date | null>(null)

  const error = ref<ApiError | null>(null)
  const checks = ref<ReconciliationCheck[] | null>(null)
  /** Сырой текст отказа — запасной режим, пока бэкенд не отдаёт структуру (С4). */
  const mismatchText = ref('')

  /** Скачанный файл живёт в памяти вкладки: повторное скачивание не трогает 1С. */
  const file = ref<DownloadedFile | null>(null)
  const report = ref<ReportResponse | null>(null)
  /** Отчёт скачан, но JSON-представление получить не удалось — частичный отказ. */
  const reportError = ref<ApiError | null>(null)

  /** Ручные переопределения участия в распределении 26 сч (С5). */
  const overrides = ref<Record<string, boolean>>({})

  let controller: AbortController | null = null
  let ticker: ReturnType<typeof setInterval> | null = null

  const running = computed(() => status.value === 'running')
  const overrideCount = computed(() => Object.keys(overrides.value).length)
  const fromCache = computed(() => report.value?.from_cache === true)

  const stage = computed<CalcStage>(() => {
    const label = periodLabel(period.value) || 'период'
    const found = STAGES.find((s) => elapsed.value >= s.from)
    return (found ?? STAGES[STAGES.length - 1]).stage(label)
  })

  /** «Идёт 4 мин 12 с» — честное прошедшее время, без выдуманного процента. */
  const elapsedText = computed(() => {
    const total = elapsed.value
    if (total < 60) return `${total} с`
    const minutes = Math.floor(total / 60)
    const seconds = total % 60
    return `${minutes} мин ${String(seconds).padStart(2, '0')} с`
  })

  function startTicker() {
    elapsed.value = 0
    startedAt.value = new Date()
    ticker = setInterval(() => {
      elapsed.value = Math.floor((Date.now() - (startedAt.value?.getTime() ?? Date.now())) / 1000)
    }, 1000)
  }

  function stopTicker() {
    if (ticker) clearInterval(ticker)
    ticker = null
  }

  /**
   * Запуск расчёта. Период не вводится повторно (ТЗ 6/С2.1) — он приходит
   * с экрана предпросмотра уже каноническим.
   */
  async function run(canonicalPeriod: string) {
    if (status.value === 'running') return

    period.value = canonicalPeriod
    status.value = 'running'
    error.value = null
    checks.value = null
    mismatchText.value = ''
    reportError.value = null
    finishedAt.value = null
    // Результат предыдущего расчёта убирается сразу, а не по приходе нового:
    // иначе на экране остаются суммы, которые уже не соответствуют тому,
    // что считается прямо сейчас (UX-карта 4.4).
    file.value = null
    report.value = null
    controller = new AbortController()
    startTicker()

    try {
      const downloaded = await runReportFile(canonicalPeriod, {
        signal: controller.signal,
        overrides: overrideCount.value > 0 ? overrides.value : undefined,
      })
      file.value = downloaded
      // Файл сохраняется пользователю сразу (ТЗ 6/С2.3), имя — из Content-Disposition.
      saveFile(downloaded)
      status.value = 'done'
      finishedAt.value = new Date()
      await loadReportJson(canonicalPeriod)
    } catch (cause) {
      handleFailure(cause)
    } finally {
      stopTicker()
      controller = null
    }
  }

  /**
   * Результат на экране (С3). Отдельный запрос: файл уже у пользователя,
   * и отказ этого метода не отменяет успешный расчёт — это частичный отказ.
   */
  async function loadReportJson(canonicalPeriod: string) {
    if (!HAS_REPORT_JSON) return
    try {
      report.value = await getReport(canonicalPeriod, {
        overrides: overrideCount.value > 0 ? overrides.value : undefined,
      })
    } catch (cause) {
      reportError.value =
        cause instanceof ApiError
          ? cause
          : new ApiError({ kind: 'unknown', serverMessage: String(cause) })
    }
  }

  function handleFailure(cause: unknown) {
    finishedAt.value = new Date()

    if (cause instanceof HeavyBusyError) {
      error.value = new ApiError({ kind: 'unknown', serverMessage: cause.message })
      status.value = 'failed'
      return
    }

    const apiError =
      cause instanceof ApiError
        ? cause
        : new ApiError({ kind: 'unknown', serverMessage: String(cause) })

    if (apiError.kind === 'aborted') {
      status.value = 'aborted'
      error.value = apiError
      return
    }

    // Отказ по сходимости — штатный сценарий и отдельный экран (ТЗ 8, С4).
    if (apiError.kind === 'reconciliation') {
      checks.value = apiError.checks.length > 0 ? apiError.checks : null
      mismatchText.value = apiError.serverMessage
      error.value = apiError
      status.value = 'mismatch'
      return
    }

    error.value = apiError
    status.value = 'failed'
  }

  /** Явное прерывание пользователем. Автоповторов нет ни при каких условиях. */
  function abort() {
    controller?.abort()
  }

  /** Повторное скачивание — тот же blob из памяти, обращения к 1С нет. */
  function downloadAgain() {
    if (file.value) saveFile(file.value)
  }

  function setOverride(orderCode: string, participates: boolean) {
    overrides.value = { ...overrides.value, [orderCode]: participates }
  }

  function clearOverrides() {
    overrides.value = {}
  }

  /**
   * Смена периода: результат старого периода не смешивается с новым (UX-карта 4.4).
   * Переопределения тоже не переносятся молча между периодами (ТЗ 6/С5).
   */
  function reset() {
    stopTicker()
    controller = null
    status.value = 'idle'
    period.value = null
    elapsed.value = 0
    startedAt.value = null
    finishedAt.value = null
    error.value = null
    checks.value = null
    mismatchText.value = ''
    file.value = null
    report.value = null
    reportError.value = null
    overrides.value = {}
  }

  return {
    status,
    period,
    elapsed,
    elapsedText,
    startedAt,
    finishedAt,
    error,
    checks,
    mismatchText,
    file,
    report,
    reportError,
    overrides,
    overrideCount,
    running,
    fromCache,
    stage,
    run,
    loadReportJson,
    abort,
    downloadAgain,
    setOverride,
    clearOverrides,
    reset,
  }
})
