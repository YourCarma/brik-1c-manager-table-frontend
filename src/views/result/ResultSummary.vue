<script setup lang="ts">
/**
 * С3, представление 1: свод по заказам.
 *
 * Строка на заказ, строка итогов обязательна и всегда видна, клик по заказу
 * раскрывает расшифровку по статьям (ТЗ 6/С3).
 *
 * Колонки строятся **по фактическому составу ключей `by_column`**, а не по
 * захардкоженному `CC/CD/CE` — появление 44 счёта или «БГ» добавит колонку
 * без правки кода таблицы (ТЗ 5.2, критерий приёмки 11.9).
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useCalcStore } from '@/stores/calc'
import { useTableSort } from '@/composables/useTableSort'
import { resolveColumns, SUMMARY_COLUMNS } from '@/lib/columns'
import MoneyCell from '@/components/ui/MoneyCell.vue'
import TermHint from '@/components/ui/TermHint.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import type { ReportOrder } from '@/api/types'

const route = useRoute()
const router = useRouter()
const calc = useCalcStore()
const { report } = storeToRefs(calc)

const expanded = ref<string | null>(null)
const search = ref('')

/** Состав колонок — из данных, а не из кода. */
const columns = computed(() => resolveColumns(report.value?.orders ?? []))

const rows = computed<ReportOrder[]>(() => {
  const all = report.value?.orders ?? []
  const query = search.value.trim().toLowerCase()
  if (!query) return all
  return all.filter(
    (o) =>
      o.order_code.toLowerCase().includes(query) || o.order_name.toLowerCase().includes(query),
  )
})

const { sorted, toggle, ariaSort } = useTableSort<ReportOrder>(
  () => rows.value,
  [
    { key: 'order_code', kind: 'text', value: (r) => r.order_code },
    { key: 'cost_1c', kind: 'money', value: (r) => r.cost_1c },
    { key: 'full_cost', kind: 'money', value: (r) => r.full_cost },
    ...columns.value.map((c) => ({
      key: `col:${c.key}`,
      kind: 'money' as const,
      value: (r: ReportOrder) => r.by_column[c.key],
    })),
  ],
  { key: 'full_cost', direction: 'desc' },
)

/** Итоги берутся с бэкенда: клиент ничего не складывает (ТЗ 4.2.3). */
function columnTotal(key: string) {
  return report.value?.totals_by_column?.[key]
}

function expand(code: string) {
  expanded.value = expanded.value === code ? null : code
}

function openDetails(code: string) {
  void router.push({ name: 'result-details', query: { ...route.query, order: code } })
}
</script>

<template>
  <section v-if="report" class="ui-card ui-card-flush">
    <div class="ui-toolbar">
      <input
        v-model="search"
        class="ui-input"
        type="search"
        placeholder="Поиск по номеру заказа"
        aria-label="Поиск по номеру заказа"
      />
      <span class="ui-micro">Клик по строке раскрывает расшифровку заказа по статьям.</span>
    </div>

    <EmptyState
      v-if="report.orders.length === 0"
      text="В расчёт не попал ни один заказ. Проверьте состав расчёта за период."
    >
      <RouterLink :to="{ name: 'preview', query: route.query }" class="ui-btn ui-btn-secondary ui-btn-sm">
        Посмотреть состав заказов
      </RouterLink>
    </EmptyState>

    <EmptyState
      v-else-if="sorted.length === 0"
      :text="`По запросу «${search}» ничего не найдено. Всего в расчёте ${report.orders.length} заказов.`"
    >
      <button type="button" class="ui-btn ui-btn-secondary ui-btn-sm" @click="search = ''">
        Очистить поиск
      </button>
    </EmptyState>

    <!-- Прокручивается таблица, а не страница (ТЗ 9). Запас = постоянная шапка,
         заголовок экрана, вкладки и панель поиска. Значение выверено на живом
         экране: правя его, проверяйте, что липкая строка итогов видна. -->
    <div v-else class="ui-table-wrap" style="max-block-size: calc(100vh - 400px)">
      <table class="ui-table">
        <thead>
          <tr>
            <th class="ui-col-key" :aria-sort="ariaSort('order_code')" @click="toggle('order_code')">
              Заказ
            </th>
            <th
              v-for="column in columns"
              :key="column.key"
              class="ui-num"
              :aria-sort="ariaSort(`col:${column.key}`)"
              @click="toggle(`col:${column.key}`)"
            >
              <TermHint :text="column.hint">{{ column.title }}</TermHint>
            </th>
            <th
              class="ui-num ui-col-split"
              :aria-sort="ariaSort('cost_1c')"
              @click="toggle('cost_1c')"
            >
              <TermHint :text="SUMMARY_COLUMNS.cost1c.hint">
                {{ SUMMARY_COLUMNS.cost1c.title }}
              </TermHint>
            </th>
            <th class="ui-num" :aria-sort="ariaSort('full_cost')" @click="toggle('full_cost')">
              <TermHint :text="SUMMARY_COLUMNS.fullCost.hint">
                {{ SUMMARY_COLUMNS.fullCost.title }}
              </TermHint>
            </th>
          </tr>
        </thead>

        <tbody>
          <template v-for="row in sorted" :key="row.order_code">
            <tr
              :data-expanded="expanded === row.order_code ? 'true' : undefined"
              @click="expand(row.order_code)"
            >
              <th class="ui-col-key" scope="row">{{ row.order_code }}</th>
              <MoneyCell
                v-for="column in columns"
                :key="column.key"
                :value="row.by_column[column.key]"
              />
              <MoneyCell :value="row.cost_1c" split />
              <MoneyCell :value="row.full_cost" strong />
            </tr>

            <tr v-if="expanded === row.order_code" class="ui-row-detail">
              <td :colspan="columns.length + 3">
                <div class="ui-detail-head">
                  <span class="ui-kicker">Расшифровка заказа {{ row.order_code }}</span>
                  <button
                    type="button"
                    class="ui-btn ui-btn-ghost ui-btn-sm"
                    @click.stop="openDetails(row.order_code)"
                  >
                    Открыть в расшифровке
                  </button>
                </div>
                <p class="ui-micro">{{ row.order_name }}</p>

                <table
                  v-if="Object.keys(row.by_article ?? {}).length"
                  class="ui-table ui-table-dense"
                >
                  <thead>
                    <tr>
                      <th>Статья затрат</th>
                      <th class="ui-num">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(amount, article) in row.by_article" :key="article">
                      <td>{{ article }}</td>
                      <MoneyCell :value="amount" />
                    </tr>
                  </tbody>
                </table>
                <p v-else class="ui-notice-text">Расшифровка по этому заказу не пришла от сервиса.</p>
              </td>
            </tr>
          </template>
        </tbody>

        <tfoot>
          <tr>
            <th class="ui-col-key" scope="row">Итого</th>
            <MoneyCell v-for="column in columns" :key="column.key" :value="columnTotal(column.key)" />
            <MoneyCell :value="report.total_cost_1c" strong split />
            <MoneyCell :value="report.total_full_cost" strong />
          </tr>
        </tfoot>
      </table>
    </div>
  </section>
</template>
