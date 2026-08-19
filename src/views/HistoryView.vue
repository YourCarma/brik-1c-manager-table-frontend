<script setup lang="ts">
/**
 * С6. История расчётов.
 *
 * Пользователь должен видеть, что период за месяц уже считался и чем закончился
 * (ТЗ 6/С6). Если период отдан из кэша — это показывается явно, с датой исходного
 * расчёта и возможностью запросить принудительный пересчёт.
 *
 * Запись с результатом «Не сошлось» ведёт на экран С4 и **не имеет ссылки на файл**:
 * несошедшийся отчёт не скачивается ниоткуда (ТЗ 6/С4).
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getHistory } from '@/api/service'
import { ApiError } from '@/api/errors'
import { periodLabel } from '@/lib/period'
import { usePeriodStore } from '@/stores/period'
import { useCalcStore } from '@/stores/calc'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import type { HistoryEntry } from '@/api/types'

const route = useRoute()
const router = useRouter()
const period = usePeriodStore()
const calc = useCalcStore()

const entries = ref<HistoryEntry[]>([])
const loading = ref(false)
const error = ref<ApiError | null>(null)
const pending = ref<HistoryEntry | null>(null)

const OUTCOME_LABEL: Record<HistoryEntry['outcome'], string> = {
  success: 'Успех',
  reconciliation_failed: 'Не сошлось',
  error: 'Ошибка 1С',
}

const rows = computed(() => entries.value)

async function load() {
  loading.value = true
  error.value = null
  try {
    entries.value = await getHistory()
  } catch (cause) {
    error.value =
      cause instanceof ApiError ? cause : new ApiError({ kind: 'unknown', serverMessage: String(cause) })
  } finally {
    loading.value = false
  }
}

onMounted(load)

function durationText(seconds: number | undefined) {
  if (seconds === undefined || seconds === null) return '—'
  if (seconds < 60) return `${seconds} с`
  return `${Math.floor(seconds / 60)} мин ${String(seconds % 60).padStart(2, '0')} с`
}

function recalculate() {
  const entry = pending.value
  pending.value = null
  if (!entry) return
  period.accept(entry.period)
  calc.reset()
  void calc.run(entry.period)
  void router.push({ name: 'calc', query: { ...route.query, period: entry.period } })
}
</script>

<template>
  <div class="ui-screen">
    <header class="ui-screen-head">
      <div>
        <div class="ui-kicker">Журнал</div>
        <h1 class="ui-title">История расчётов</h1>
      </div>
    </header>
    <div class="ui-rule-accent"></div>

    <ErrorPanel
      v-if="error"
      :error="error"
      context="История расчётов"
      :period="period.canonical"
      @retry="load"
    />

    <section v-else-if="loading" class="ui-card">
      <h2 class="ui-section">Загружаем историю расчётов</h2>
      <div class="ui-progress"></div>
    </section>

    <section v-else class="ui-card ui-card-flush">
      <EmptyState
        v-if="rows.length === 0"
        text="Расчётов ещё не было. Первый расчёт появится здесь сразу после запуска."
      >
        <RouterLink :to="{ name: 'preview', query: route.query }" class="ui-btn ui-btn-secondary ui-btn-sm">
          Посмотреть состав заказов
        </RouterLink>
      </EmptyState>

      <!-- Прокручивается таблица, а не страница (ТЗ 9): расчётов за год
           набирается больше экрана, а ограничения высоты здесь не было вовсе.
           Запас меньше, чем на других экранах: над таблицей стоит только
           заголовок экрана — ни счётчиков, ни вкладок, ни панели фильтров. -->
      <div v-else class="ui-table-wrap" style="max-block-size: calc(100vh - 320px)">
        <table class="ui-table">
          <thead>
            <tr>
              <th class="ui-col-key">Период</th>
              <th>Когда посчитан</th>
              <th>Результат</th>
              <th class="ui-num">Длительность</th>
              <th class="ui-col-split">Файл</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in rows" :key="entry.id">
              <th class="ui-col-key" scope="row">{{ periodLabel(entry.period) }}</th>
              <td>
                {{ new Date(entry.calculated_at).toLocaleString('ru-RU') }}
                <span v-if="entry.from_cache" class="ui-badge ui-badge-neutral">Из кэша</span>
              </td>
              <td>
                <RouterLink
                  v-if="entry.outcome === 'reconciliation_failed'"
                  :to="{ name: 'mismatch', query: { period: entry.period } }"
                  class="ui-badge ui-badge-deny"
                >
                  {{ OUTCOME_LABEL[entry.outcome] }}
                </RouterLink>
                <span v-else-if="entry.outcome === 'success'" class="ui-badge ui-badge-ok">
                  {{ OUTCOME_LABEL[entry.outcome] }}
                </span>
                <span v-else class="ui-badge ui-badge-warn">{{ OUTCOME_LABEL[entry.outcome] }}</span>
                <span v-if="entry.note" class="ui-micro">{{ entry.note }}</span>
              </td>
              <td class="ui-num">{{ durationText(entry.duration_seconds) }}</td>
              <td class="ui-col-split">
                <!-- Скачивание есть только у успешных расчётов: несошедшийся отчёт
                     не выдаётся ни отсюда, ни откуда-либо ещё (ТЗ 6/С4). -->
                <span v-if="entry.outcome === 'success'" class="ui-micro">{{ entry.filename }}</span>
                <button
                  v-if="entry.from_cache"
                  type="button"
                  class="ui-btn ui-btn-ghost ui-btn-sm"
                  @click="pending = entry"
                >
                  Пересчитать заново
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <UiDialog
      :open="pending !== null"
      :title="`Пересчитать «Факт» за ${periodLabel(pending?.period)}`"
      @close="pending = null"
    >
      <p class="ui-notice-text">
        Результат этого периода отдавался из кэша. Принудительный пересчёт — полноценный
        тяжёлый запрос: он занимает от нескольких секунд до 15 минут и снова обращается к 1С.
      </p>
      <p class="ui-notice-text">
        Фонового режима пока нет: если закрыть вкладку или уйти на другой экран,
        расчёт прервётся.
      </p>
      <template #actions>
        <button type="button" class="ui-btn ui-btn-primary" @click="recalculate">
          Пересчитать заново
        </button>
        <button type="button" class="ui-btn ui-btn-secondary" @click="pending = null">Отмена</button>
      </template>
    </UiDialog>
  </div>
</template>
