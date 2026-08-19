/**
 * Период расчёта — единая точка входа, доступная с любого экрана (ТЗ 9.1).
 *
 * Ключевое правило (ТЗ 5.3.3): **разбор периода — обязанность бэкенда.**
 * Здесь хранится ровно две вещи: что человек напечатал (`draft`) и что вернул
 * сервер (`canonical`). Ни одной регулярки проверки ввода в этом файле нет.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { periodLabel, previousMonth } from '@/lib/period'
import type { ApiError } from '@/api/errors'

export const usePeriodStore = defineStore('period', () => {
  /** Текст в поле — ровно то, что напечатал человек. Уходит на сервер как есть. */
  const draft = ref('')

  /** Канонический период из ответа сервера (`2026-06`). Клиент его не вычисляет. */
  const canonical = ref<string | null>(null)

  /** Ошибка разбора периода (400) — показывается под полем. */
  const error = ref<ApiError | null>(null)

  /** Человеческая подпись текущего периода: «июнь 2026». */
  const label = computed(() => periodLabel(canonical.value))

  /** Поле блокируется на время расчёта: второй тяжёлый запрос запрещён (ТЗ 7.1.4). */
  const locked = ref(false)

  /** Подсказка при первом входе — прошлый месяц. Запрос при этом не отправляется. */
  function suggestDefault() {
    if (!draft.value) draft.value = periodLabel(previousMonth())
  }

  /** Принять канонический период из ответа сервера. */
  function accept(period: string) {
    canonical.value = period
    draft.value = periodLabel(period)
    error.value = null
  }

  function fail(apiError: ApiError) {
    error.value = apiError
  }

  function clearError() {
    error.value = null
  }

  return { draft, canonical, error, label, locked, suggestDefault, accept, fail, clearError }
})
