/**
 * Доступность сервиса (ТЗ 9.7).
 *
 * Важное различие, которое проверяется на приёмке (критерий 11.7):
 *  - **бэкенд не поднят** → индикатор гаснет, «Сервис «Факт» не отвечает»;
 *  - **1С недоступна** (502/504) → индикатор остаётся в состоянии «доступен»:
 *    наш сервис жив и ответил, проблема в учётной системе.
 * Поэтому здоровье сервиса и ошибки 1С — разные состояния и разные источники.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { checkHealth } from '@/api/service'
import { isBusy } from '@/api/heavyGate'

export type ServiceState = 'unknown' | 'checking' | 'available' | 'unavailable'

export const useHealthStore = defineStore('health', () => {
  const state = ref<ServiceState>('unknown')
  const checkedAt = ref<Date | null>(null)

  async function check() {
    // Во время тяжёлого запроса не тревожим сервис лишний раз (ТЗ 7.1.4):
    // /health лёгкий, но 1С работает в один поток, а состояние и так известно.
    if (isBusy()) return
    state.value = 'checking'
    const ok = await checkHealth()
    state.value = ok ? 'available' : 'unavailable'
    checkedAt.value = new Date()
  }

  return { state, checkedAt, check }
})
