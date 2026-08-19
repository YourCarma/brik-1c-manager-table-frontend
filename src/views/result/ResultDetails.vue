<script setup lang="ts">
/**
 * С3, представление 3: расшифровка.
 *
 * Инструмент проверки: пользователь приходит сюда с вопросом «почему в CE такая
 * сумма» (ТЗ 6/С3). Построчно — заказ, статья затрат, счёт учёта, сумма, целевая
 * колонка; фильтры по заказу, колонке и счёту; поиск по наименованию статьи.
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useCalcStore } from '@/stores/calc'
import { useTableSort } from '@/composables/useTableSort'
import { columnMeta } from '@/lib/columns'
import { sumMoney } from '@/lib/money'
import MoneyCell from '@/components/ui/MoneyCell.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import type { BreakdownRow } from '@/api/types'

const route = useRoute()
const router = useRouter()
const calc = useCalcStore()
const { report } = storeToRefs(calc)

const orderFilter = ref(typeof route.query.order === 'string' ? route.query.order : '')
const columnFilter = ref('')
const accountFilter = ref('')
const search = ref('')

// Переход со свода подставляет фильтр по заказу — контекст вопроса не теряется.
watch(
  () => route.query.order,
  (value) => (orderFilter.value = typeof value === 'string' ? value : ''),
)

const all = computed<BreakdownRow[]>(() => report.value?.breakdown ?? [])

const orderOptions = computed(() => [...new Set(all.value.map((r) => r.order_code))].sort())
const columnOptions = computed(() => [...new Set(all.value.map((r) => r.column))])
const accountOptions = computed(() => [...new Set(all.value.map((r) => r.account))].sort())

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  return all.value.filter((row) => {
    if (orderFilter.value && row.order_code !== orderFilter.value) return false
    if (columnFilter.value && row.column !== columnFilter.value) return false
    if (accountFilter.value && row.account !== accountFilter.value) return false
    if (query && !row.article.toLowerCase().includes(query)) return false
    return true
  })
})

const { sorted, toggle, ariaSort } = useTableSort<BreakdownRow>(
  () => filtered.value,
  [
    { key: 'order_code', kind: 'text', value: (r) => r.order_code },
    { key: 'article', kind: 'text', value: (r) => r.article },
    { key: 'account', kind: 'text', value: (r) => r.account },
    { key: 'amount', kind: 'money', value: (r) => r.amount },
    { key: 'column', kind: 'text', value: (r) => r.column },
  ],
  { key: 'amount', direction: 'desc' },
)

/**
 * Подытог отфильтрованных строк. Серверного итога для произвольного среза
 * не существует, поэтому он считается здесь — и подписан как подытог фильтра,
 * чтобы его не приняли за методологический итог отчёта (ТЗ 4.2.3).
 */
const filteredTotal = computed(() => sumMoney(sorted.value.map((r) => r.amount)))

const hasFilters = computed(
  () => !!(orderFilter.value || columnFilter.value || accountFilter.value || search.value),
)

function resetFilters() {
  orderFilter.value = ''
  columnFilter.value = ''
  accountFilter.value = ''
  search.value = ''
  const query = { ...route.query }
  delete query.order
  void router.replace({ query })
}
</script>

<template>
  <section v-if="report" class="ui-card ui-card-flush">
    <div class="ui-toolbar ui-toolbar-wrap">
      <label class="ui-field">
        <span class="ui-label">Заказ</span>
        <select v-model="orderFilter" class="ui-input">
          <option value="">Все заказы</option>
          <option v-for="code in orderOptions" :key="code" :value="code">{{ code }}</option>
        </select>
      </label>

      <label class="ui-field">
        <span class="ui-label">Целевая колонка</span>
        <select v-model="columnFilter" class="ui-input">
          <option value="">Все колонки</option>
          <option v-for="key in columnOptions" :key="key" :value="key">
            {{ columnMeta(key).title }}
          </option>
        </select>
      </label>

      <label class="ui-field">
        <span class="ui-label">Счёт учёта</span>
        <select v-model="accountFilter" class="ui-input">
          <option value="">Все счета</option>
          <option v-for="account in accountOptions" :key="account" :value="account">
            {{ account }}
          </option>
        </select>
      </label>

      <label class="ui-field ui-field-grow">
        <span class="ui-label">Поиск по статье затрат</span>
        <input v-model="search" class="ui-input" type="search" placeholder="ЗП, аренда, материалы" />
      </label>

      <button
        v-if="hasFilters"
        type="button"
        class="ui-btn ui-btn-ghost ui-btn-sm"
        @click="resetFilters"
      >
        Сбросить фильтры
      </button>
    </div>

    <EmptyState v-if="all.length === 0" text="Расшифровка за период пуста." />

    <EmptyState
      v-else-if="sorted.length === 0"
      text="Под выбранные условия не попала ни одна строка."
    >
      <button type="button" class="ui-btn ui-btn-secondary ui-btn-sm" @click="resetFilters">
        Сбросить фильтры
      </button>
    </EmptyState>

    <!-- Прокручивается таблица, а не страница (ТЗ 9). Запас больше, чем в своде:
         панель фильтров выше панели поиска на высоту ярлыков полей. -->
    <div v-else class="ui-table-wrap" style="max-block-size: calc(100vh - 440px)">
      <table class="ui-table ui-table-dense">
        <thead>
          <tr>
            <th class="ui-col-key" :aria-sort="ariaSort('order_code')" @click="toggle('order_code')">
              Заказ
            </th>
            <th :aria-sort="ariaSort('article')" @click="toggle('article')">Статья затрат</th>
            <th :aria-sort="ariaSort('account')" @click="toggle('account')">Счёт учёта</th>
            <th class="ui-num" :aria-sort="ariaSort('amount')" @click="toggle('amount')">Сумма</th>
            <th class="ui-col-split" :aria-sort="ariaSort('column')" @click="toggle('column')">
              Целевая колонка
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in sorted" :key="`${row.order_code}-${row.article}-${i}`">
            <th class="ui-col-key" scope="row">{{ row.order_code }}</th>
            <td>{{ row.article }}</td>
            <td class="ui-num">{{ row.account }}</td>
            <MoneyCell :value="row.amount" />
            <td class="ui-col-split">{{ columnMeta(row.column).title }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th class="ui-col-key" scope="row">Подытог</th>
            <td>{{ sorted.length }} стр. по выбранным условиям</td>
            <td></td>
            <MoneyCell :value="filteredTotal" strong />
            <td class="ui-col-split"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </section>
</template>
