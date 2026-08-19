<script setup lang="ts">
/**
 * Панель ошибки.
 *
 * ТЗ 8: человеческое объяснение сверху, текст сервера — в «Подробностях»,
 * и обязательно действие. Ошибка одной операции не ломает экран целиком:
 * панель встраивается в контекст, а не заменяет его (ТЗ 8, п.4).
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ACTION_LABELS, errorCopy } from '@/lib/errorCopy'
import type { ErrorAction } from '@/lib/errorCopy'
import { ApiError } from '@/api/errors'
import { useHealthStore } from '@/stores/health'
import CopyButton from './CopyButton.vue'
import DetailsBlock from './DetailsBlock.vue'

const props = defineProps<{
  error: ApiError
  /** Что делали — попадает в текст для сопровождения. */
  context: string
  /** Период, к которому относится ошибка. */
  period?: string | null
}>()

const emit = defineEmits<{ retry: []; retryReport: []; fixPeriod: [] }>()

const router = useRouter()
const health = useHealthStore()

const copy = computed(() => errorCopy(props.error.kind, props.error.serverMessage))

const supportText = () =>
  [
    'Факт — обращение в сопровождение',
    `Период:        ${props.period ?? '—'}`,
    `Операция:      ${props.context}`,
    `Время запроса: ${new Date().toLocaleString('ru-RU')}`,
    `Код ответа:    ${props.error.status ?? 'нет ответа'}`,
    `Ответ сервиса: ${props.error.serverMessage || '—'}`,
  ].join('\n')

function handle(action: ErrorAction) {
  switch (action) {
    case 'retry':
      emit('retry')
      break
    case 'retry-report':
      emit('retryReport')
      break
    case 'fix-period':
      emit('fixPeriod')
      break
    case 'view-orders':
      router.push({ name: 'preview', query: { period: props.period ?? undefined } })
      break
    case 'check-health':
      void health.check()
      break
    default:
      break
  }
}
</script>

<template>
  <section class="ui-notice ui-notice-deny" role="alert">
    <h2 class="ui-notice-title">{{ copy.title }}</h2>
    <p v-for="(line, i) in copy.body" :key="i" class="ui-notice-text">{{ line }}</p>

    <div class="ui-notice-actions">
      <template v-for="action in copy.actions" :key="action">
        <CopyButton v-if="action === 'copy-support'" :text="supportText" />
        <button
          v-else-if="action !== 'details'"
          type="button"
          class="ui-btn ui-btn-secondary ui-btn-sm"
          @click="handle(action)"
        >
          {{ ACTION_LABELS[action] }}
        </button>
      </template>
    </div>

    <DetailsBlock v-if="copy.actions.includes('details')">
      <dl class="ui-kv">
        <dt>Период</dt>
        <dd>{{ period ?? '—' }}</dd>
        <dt>Операция</dt>
        <dd>{{ context }}</dd>
        <dt>Код ответа</dt>
        <dd>{{ error.status ?? 'нет ответа' }}</dd>
      </dl>
      <pre class="ui-pre">{{ error.serverMessage || 'Сервис не прислал текста' }}</pre>
    </DetailsBlock>
  </section>
</template>
