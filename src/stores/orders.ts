/**
 * Состав заказов периода — сценарий С1.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getOrders } from '@/api/service'
import { ApiError } from '@/api/errors'
import { HeavyBusyError } from '@/api/heavyGate'
import { isNonZero } from '@/lib/money'
import type { OrdersResponse } from '@/api/types'
import { usePeriodStore } from './period'

export const useOrdersStore = defineStore('orders', () => {
  const data = ref<OrdersResponse | null>(null)
  /** Период, которому принадлежат данные на экране: они всегда подписаны своим. */
  const dataPeriod = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<ApiError | null>(null)
  /** Прошло ли больше 10 секунд — тогда объясняем, что это нормально (ТЗ 7.1.2). */
  const slow = ref(false)

  let slowTimer: ReturnType<typeof setTimeout> | null = null

  const hasWarnings = computed(() => {
    if (!data.value) return false
    return (
      data.value.unmatched.length > 0 ||
      isNonZero(data.value.turnover_without_order) ||
      data.value.orders_filter !== null
    )
  })

  /**
   * Запрос состава. `input` уходит на сервер ровно в том виде, в каком его
   * напечатал человек (ТЗ 5.3.3).
   */
  async function load(input: string): Promise<boolean> {
    const period = usePeriodStore()
    loading.value = true
    slow.value = false
    error.value = null
    slowTimer = setTimeout(() => (slow.value = true), 10_000)

    try {
      const response = await getOrders(input.trim())
      data.value = response
      dataPeriod.value = response.period
      period.accept(response.period)
      return true
    } catch (cause) {
      const apiError =
        cause instanceof HeavyBusyError
          ? new ApiError({ kind: 'unknown', serverMessage: cause.message })
          : cause instanceof ApiError
            ? cause
            : new ApiError({ kind: 'unknown', serverMessage: String(cause) })

      // Экран не разрушается: предыдущий состав остаётся на месте под своим
      // периодом (ТЗ 8.4). Ошибка ввода периода живёт под полем.
      if (apiError.kind === 'period') period.fail(apiError)
      else error.value = apiError
      return false
    } finally {
      if (slowTimer) clearTimeout(slowTimer)
      slowTimer = null
      loading.value = false
      slow.value = false
    }
  }

  /** Смена периода: результат старого периода не смешивается с новым ни на секунду. */
  function reset() {
    data.value = null
    dataPeriod.value = null
    error.value = null
  }

  return { data, dataPeriod, loading, error, slow, hasWarnings, load, reset }
})
