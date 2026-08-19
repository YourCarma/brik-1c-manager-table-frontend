<script setup lang="ts">
/**
 * Состояние сервиса (ТЗ 9.7).
 *
 * Индикатор говорит **только о нашем сервисе**. Если 1С вернула ошибку или
 * не ответила (502/504), индикатор остаётся в состоянии «сервис доступен»:
 * сервис жив и ответил, проблема в учётной системе. Это различие проверяется
 * на приёмке (критерий 11.7).
 *
 * Состояния различаются и цветом, и формой заливки: доступен — точка залита,
 * недоступен — залита и перечёркнута, проверяем — штриховка, неизвестно —
 * пустая точка в пунктирной рамке. Избыточность намеренная: различие переживает
 * и монохромную печать, и дальтонизм.
 */
import { computed } from 'vue'
import { useHealthStore } from '@/stores/health'

const health = useHealthStore()

const text = computed(() => {
  switch (health.state) {
    case 'available':
      return 'Сервис доступен'
    case 'unavailable':
      return 'Сервис недоступен'
    case 'checking':
      return 'Проверяем доступность'
    default:
      return 'Доступность сервиса неизвестна'
  }
})
</script>

<template>
  <div class="ui-service">
    <span class="ui-status-dot" :data-state="health.state"></span>
    <span class="ui-micro">{{ text }}</span>
    <button
      v-if="health.state === 'unavailable' || health.state === 'unknown'"
      type="button"
      class="ui-btn ui-btn-ghost ui-btn-sm"
      @click="health.check()"
    >
      Проверить доступность
    </button>
  </div>
</template>
