<script setup lang="ts">
/**
 * Поле периода — единая точка входа, доступная с любого экрана (ТЗ 9.1).
 *
 * Устройство по UX-карте 3:
 *  - **свободный текст**, не `<input type="month">`, без маски и автоформатирования;
 *  - разбор периода делает бэкенд (ТЗ 5.3.3) — здесь **нет ни одной регулярки**
 *    проверки ввода, поле отправляет введённое как есть;
 *  - вспомогательная панель выбора месяца **ничего не отправляет**: она вписывает
 *    текст в поле и возвращает туда курсор. Ручной ввод остаётся главным;
 *  - на время расчёта поле блокируется — второй тяжёлый запрос запрещён (ТЗ 7.1.4),
 *    и об этом сказано словами, а не молчаливой блокировкой.
 */
import { computed, ref } from 'vue'
import { usePeriodStore } from '@/stores/period'
import { MONTHS_NOMINATIVE, currentYear, previousMonth, splitCanonical } from '@/lib/period'
import { periodLabel } from '@/lib/period'
import { PERIOD_FORMATS_HINT, errorCopy } from '@/lib/errorCopy'

const props = withDefaults(defineProps<{ busy?: boolean }>(), { busy: false })
const emit = defineEmits<{ submit: [value: string] }>()

const period = usePeriodStore()
const input = ref<HTMLInputElement | null>(null)
const pickerOpen = ref(false)
const pickerYear = ref(splitCanonical(period.canonical)?.year ?? currentYear())

const errorText = computed(() => {
  if (!period.error) return null
  const copy = errorCopy('period', period.error.serverMessage)
  return {
    title: `${copy.title}: ${period.draft}`,
    lines: copy.body,
    server: period.error.serverMessage,
  }
})

function submit() {
  if (props.busy || period.locked) return
  const value = period.draft.trim()
  if (!value) return
  emit('submit', value)
}

/** Чип подставляет текст в поле и не отправляет запрос — отправка всегда явная. */
function fill(value: string) {
  period.draft = value
  period.clearError()
  input.value?.focus()
  input.value?.setSelectionRange(value.length, value.length)
}

function pickMonth(monthIndex: number) {
  fill(`${MONTHS_NOMINATIVE[monthIndex]} ${pickerYear.value}`)
  pickerOpen.value = false
}

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div class="ui-period">
    <label class="ui-label" for="period-input">Период</label>

    <div class="ui-period-row">
      <div class="ui-period-control">
        <input
          id="period-input"
          ref="input"
          v-model="period.draft"
          class="ui-input"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="июнь 2026"
          :disabled="period.locked"
          :aria-invalid="period.error ? 'true' : undefined"
          aria-describedby="period-hint"
          @keydown.enter.prevent="submit"
          @input="period.clearError()"
        />
        <button
          type="button"
          class="ui-period-toggle"
          :disabled="period.locked"
          :aria-expanded="pickerOpen"
          aria-label="Выбрать месяц"
          @click="pickerOpen = !pickerOpen"
        >
          ▾
        </button>
      </div>

      <button
        type="button"
        class="ui-btn ui-btn-primary"
        :disabled="busy || period.locked || !period.draft.trim()"
        :data-loading="busy ? '' : undefined"
        @click="submit"
      >
        Показать состав
      </button>
    </div>

    <div v-if="pickerOpen" class="ui-period-picker">
      <div class="ui-period-picker-head">
        <button type="button" class="ui-btn ui-btn-ghost ui-btn-sm" @click="pickerYear--">←</button>
        <span class="ui-num">{{ pickerYear }}</span>
        <button type="button" class="ui-btn ui-btn-ghost ui-btn-sm" @click="pickerYear++">→</button>
      </div>
      <div class="ui-period-picker-grid">
        <button
          v-for="(month, i) in MONTHS_NOMINATIVE"
          :key="month"
          type="button"
          class="ui-period-month"
          @click="pickMonth(i)"
        >
          {{ month }}
        </button>
      </div>
      <p class="ui-hint">Выбор месяца заполняет поле — запрос отправляется кнопкой или Enter.</p>
    </div>

    <div class="ui-period-chips">
      <button type="button" class="ui-chip" :disabled="period.locked" @click="fill(periodLabel(previousMonth()))">
        Прошлый месяц
      </button>
      <button
        type="button"
        class="ui-chip"
        :disabled="period.locked"
        @click="fill(periodLabel(`${currentYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`))"
      >
        Текущий месяц
      </button>
    </div>

    <p v-if="period.locked" class="ui-hint">Пока идёт расчёт, период не меняется.</p>
    <p v-else id="period-hint" class="ui-hint">{{ PERIOD_FORMATS_HINT }} Год — четырьмя цифрами.</p>

    <div v-if="errorText" class="ui-input-error" role="alert">
      <strong>{{ errorText.title }}</strong>
      <span v-for="(line, i) in errorText.lines" :key="i">{{ line }}</span>
      <span class="ui-micro">Ответ сервиса: {{ errorText.server }}</span>
      <button type="button" class="ui-btn ui-btn-ghost ui-btn-sm" @click="input?.focus()">
        Исправить период
      </button>
    </div>
  </div>
</template>
