<script setup lang="ts">
/**
 * С1. Предпросмотр состава расчёта.
 *
 * Зачем человеку: заметить проблему в исходных данных **до** расчёта, а не по
 * расхождению в итогах, когда уже поздно.
 *
 * Закрывает требования ТЗ 6/С1: таблица состава, счётчики, заметный блок
 * предупреждений (`unmatched`, `turnover_without_order`, действующий фильтр),
 * сортировка по любой колонке, поиск по номеру и наименованию, отсутствие
 * постраничной навигации.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useOrdersStore } from '@/stores/orders'
import { usePeriodStore } from '@/stores/period'
import { useCalcStore } from '@/stores/calc'
import { useTableSort } from '@/composables/useTableSort'
import { formatMoney, isNonZero } from '@/lib/money'
import MoneyCell from '@/components/ui/MoneyCell.vue'
import TermHint from '@/components/ui/TermHint.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import DetailsBlock from '@/components/ui/DetailsBlock.vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import type { OrderRow } from '@/api/types'

const route = useRoute()
const router = useRouter()
const orders = useOrdersStore()
const period = usePeriodStore()
const calc = useCalcStore()

const { data, loading, slow, error } = storeToRefs(orders)

const search = ref('')
const launchOpen = ref(false)

const filtered = computed<OrderRow[]>(() => {
  const rows = data.value?.orders ?? []
  const query = search.value.trim().toLowerCase()
  if (!query) return rows
  return rows.filter(
    (row) =>
      row.order_code.toLowerCase().includes(query) || row.order_name.toLowerCase().includes(query),
  )
})

const { sorted, toggle, ariaSort } = useTableSort<OrderRow>(
  () => filtered.value,
  [
    { key: 'order_code', kind: 'text', value: (r) => r.order_code },
    { key: 'order_name', kind: 'text', value: (r) => r.order_name },
    { key: 'turnover', kind: 'money', value: (r) => r.turnover },
    { key: 'wip_balance', kind: 'money', value: (r) => r.wip_balance },
    { key: 'in_progress', kind: 'flag', value: (r) => r.in_progress },
    { key: 'in_report', kind: 'flag', value: (r) => r.in_report },
  ],
  { key: 'turnover', direction: 'desc' },
)

const withoutOrder = computed(() => isNonZero(data.value?.turnover_without_order))
const unmatched = computed(() => data.value?.unmatched ?? [])
const filterRule = computed(() => data.value?.orders_filter ?? null)

const unmatchedText = () =>
  unmatched.value
    .map((g) => `${g.order_key}\t${g.order_name ?? ''}\t${g.turnover ?? ''}`)
    .join('\n')

function refresh() {
  if (period.canonical) void orders.load(period.canonical)
}

function startCalculation() {
  launchOpen.value = false
  if (!period.canonical) return
  void calc.run(period.canonical)
  void router.push({ name: 'calc', query: route.query })
}
</script>

<template>
  <div class="ui-screen">
    <header class="ui-screen-head">
      <div>
        <div class="ui-kicker">Шаг 1</div>
        <h1 class="ui-title">Состав расчёта</h1>
        <p class="ui-hint">Что попадёт в расчёт за {{ period.label || 'выбранный период' }}</p>
      </div>
      <div class="ui-screen-actions">
        <button
          type="button"
          class="ui-btn ui-btn-secondary"
          :disabled="loading || !period.canonical || calc.running"
          @click="refresh"
        >
          Обновить состав
        </button>
      </div>
    </header>
    <div class="ui-rule-accent"></div>

    <!-- Ошибка запроса состава. Экран не разрушается: предыдущий состав остаётся
         на месте под своим периодом (ТЗ 8.4). -->
    <ErrorPanel
      v-if="error"
      :error="error"
      context="Состав заказов (GET /orders)"
      :period="period.canonical"
      @retry="refresh"
    />

    <!-- Первичная загрузка -->
    <section v-if="loading" class="ui-card">
      <h2 class="ui-section">Забираем состав заказов из 1С</h2>
      <div class="ui-progress"></div>
      <p v-if="slow" class="ui-hint">
        Запрос идёт дольше десяти секунд — это нормально. Первый запрос после простоя базы 1С
        стоит около полутора минут независимо от тяжести запроса.
      </p>
    </section>

    <template v-else-if="data">
      <!-- Счётчики -->
      <section class="ui-counters">
        <div class="ui-counter">
          <div class="ui-counter-label">Всего групп</div>
          <div class="ui-counter-value ui-num">{{ data.total }}</div>
        </div>
        <div class="ui-counter">
          <div class="ui-counter-label">Попадёт в расчёт</div>
          <div class="ui-counter-value ui-num">{{ data.in_report_count }}</div>
        </div>
        <div class="ui-counter">
          <div class="ui-counter-label">Из них в работе</div>
          <div class="ui-counter-value ui-num">{{ data.in_progress_count }}</div>
        </div>
        <div class="ui-counter ui-counter-wide">
          <div class="ui-counter-label">Суммарный оборот</div>
          <div class="ui-counter-value ui-num ui-num-strong">
            {{ formatMoney(data.total_turnover) }}
          </div>
        </div>
      </section>

      <!-- Блок предупреждений: над таблицей, чтобы его заметили до запуска расчёта -->
      <section v-if="unmatched.length" class="ui-notice ui-notice-warn">
        <h2 class="ui-notice-title">Не определён номер заказа: {{ unmatched.length }} гр.</h2>
        <p class="ui-notice-text">
          У этих номенклатурных групп в наименовании не нашёлся номер заказа. Их обороты
          не попадут ни в один заказ, и сверка с 1С не сойдётся — расчёт, скорее всего,
          завершится отказом.
        </p>
        <p class="ui-notice-text">
          Поправьте наименование группы в 1С: номер заказа должен стоять в начале, например
          <code>П3747 (изделие, 2 шт_Заказчик)</code>. После правки обновите состав.
        </p>
        <DetailsBlock summary="Идентификаторы групп">
          <!-- Единственное место интерфейса, где показывается GUID (ТЗ 5.3.4). -->
          <table class="ui-table ui-table-dense">
            <thead>
              <tr>
                <th>Идентификатор группы</th>
                <th>Наименование</th>
                <th class="ui-num">Оборот</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="group in unmatched" :key="group.order_key">
                <td class="ui-micro">{{ group.order_key }}</td>
                <td>{{ group.order_name ?? '—' }}</td>
                <MoneyCell :value="group.turnover" />
              </tr>
            </tbody>
          </table>
        </DetailsBlock>
        <div class="ui-notice-actions">
          <CopyButton :text="unmatchedText" label="Скопировать список для 1С" />
          <button type="button" class="ui-btn ui-btn-secondary ui-btn-sm" @click="refresh">
            Обновить состав
          </button>
        </div>
      </section>

      <section v-if="withoutOrder" class="ui-notice ui-notice-warn">
        <h2 class="ui-notice-title">
          Оборот без номенклатурной группы: {{ formatMoney(data.turnover_without_order) }}
        </h2>
        <p class="ui-notice-text">
          За период есть оборот по счетам расчёта, у которого не проставлена номенклатурная
          группа. В заказы он не попадёт, и себестоимость по 1С разойдётся с ОСВ ровно
          на эту сумму.
        </p>
        <p class="ui-notice-text">
          Проставьте номенклатурную группу в проводках 1С и обновите состав.
        </p>
        <div class="ui-notice-actions">
          <button type="button" class="ui-btn ui-btn-secondary ui-btn-sm" @click="refresh">
            Обновить состав
          </button>
        </div>
      </section>

      <section v-if="filterRule" class="ui-notice ui-notice-neutral">
        <h2 class="ui-notice-title">Действует фильтр состава заказов</h2>
        <p class="ui-notice-text">
          Вы видите не все заказы периода: сервис отобрал состав по правилу
          <code>{{ filterRule }}</code>. Расчёт пойдёт по тому же составу.
        </p>
        <p class="ui-notice-text">
          Фильтр задан настройкой сервиса и меняется сопровождением — из интерфейса
          он не правится.
        </p>
      </section>

      <!-- Таблица состава -->
      <section class="ui-card ui-card-flush">
        <div class="ui-toolbar">
          <input
            v-model="search"
            class="ui-input"
            type="search"
            placeholder="Поиск по номеру заказа или наименованию группы"
            aria-label="Поиск по номеру заказа или наименованию группы"
          />
          <span class="ui-micro">
            Показано {{ sorted.length }} из {{ data.orders.length }}. Состав виден целиком,
            постраничной навигации нет.
          </span>
        </div>

        <EmptyState
          v-if="data.orders.length === 0"
          :text="`За ${period.label} в 1С нет ни одной группы с оборотом. Это не ошибка: за месяц не было движений по счетам расчёта.`"
        >
          <button type="button" class="ui-btn ui-btn-secondary ui-btn-sm" @click="period.draft = ''">
            Выбрать другой период
          </button>
        </EmptyState>

        <EmptyState
          v-else-if="sorted.length === 0"
          :text="`По запросу «${search}» ничего не найдено. Всего в составе ${data.orders.length} групп.`"
        >
          <button type="button" class="ui-btn ui-btn-secondary ui-btn-sm" @click="search = ''">
            Очистить поиск
          </button>
        </EmptyState>

        <!-- Прокручивается таблица, а не страница (ТЗ 9). Запас — постоянная
             шапка, заголовок экрана, счётчики и панель поиска. Значение
             выверено на живом экране: правя его, проверяйте, что липкая
             строка итогов остаётся видимой. -->
        <div v-else class="ui-table-wrap" style="max-block-size: calc(100vh - 420px)">
          <table class="ui-table">
            <thead>
              <tr>
                <th class="ui-col-key" :aria-sort="ariaSort('order_code')" @click="toggle('order_code')">
                  <TermHint text="Номер заказа из наименования номенклатурной группы. По нему идёт перенос в рабочую таблицу менеджеров.">
                    Заказ
                  </TermHint>
                </th>
                <th :aria-sort="ariaSort('order_name')" @click="toggle('order_name')">
                  Номенклатурная группа
                </th>
                <th class="ui-num" :aria-sort="ariaSort('turnover')" @click="toggle('turnover')">
                  <TermHint text="Оборот Дт по счетам расчёта (20.01 и 28) за период.">Оборот</TermHint>
                </th>
                <th class="ui-num" :aria-sort="ariaSort('wip_balance')" @click="toggle('wip_balance')">
                  <TermHint text="Незавершённое производство: дебетовый остаток по 20.01 на конец месяца.">
                    Остаток НЗП
                  </TermHint>
                </th>
                <th :aria-sort="ariaSort('in_progress')" @click="toggle('in_progress')">
                  <TermHint text="Справочный признак: у заказа есть положительный остаток НЗП на конец месяца. К распределению 26 счёта отношения не имеет.">
                    В работе
                  </TermHint>
                </th>
                <th class="ui-col-split" :aria-sort="ariaSort('in_report')" @click="toggle('in_report')">
                  <TermHint text="Заказ войдёт в отчёт за период. Если действует фильтр состава, часть заказов с оборотом в расчёт не попадёт.">
                    Попадёт в расчёт
                  </TermHint>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in sorted"
                :key="row.order_key"
                :data-muted="row.in_report ? undefined : 'true'"
              >
                <th class="ui-col-key" scope="row">{{ row.order_code }}</th>
                <td>{{ row.order_name }}</td>
                <MoneyCell :value="row.turnover" />
                <MoneyCell :value="row.wip_balance" />
                <td>
                  <span v-if="row.in_progress" class="ui-badge ui-badge-neutral">В работе</span>
                </td>
                <td class="ui-col-split">
                  <span v-if="row.in_report" class="ui-badge ui-badge-ok">Попадёт</span>
                  <span v-else class="ui-badge ui-badge-warn">Не попадёт</span>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th class="ui-col-key" scope="row">Итого</th>
                <td>{{ data.total }} гр., в расчёт — {{ data.in_report_count }}</td>
                <MoneyCell :value="data.total_turnover" strong />
                <td></td>
                <td>{{ data.in_progress_count }} в работе</td>
                <td class="ui-col-split"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <!-- Запуск расчёта -->
      <section class="ui-card ui-launch">
        <div>
          <h2 class="ui-section">Шаг 2. Расчёт месяца</h2>
          <p class="ui-notice-text">
            Расчёт занимает от нескольких секунд до 15 минут. Столько отвечает 1С: первый
            запрос после простоя базы добавляет около полутора минут. Пока идёт расчёт,
            вкладку нельзя закрывать и нельзя уходить на другие экраны — фонового режима
            пока нет.
          </p>
        </div>
        <div class="ui-launch-action">
          <button
            type="button"
            class="ui-btn ui-btn-primary"
            :disabled="calc.running || !period.canonical || data.orders.length === 0"
            @click="launchOpen = true"
          >
            Рассчитать месяц
          </button>
          <p v-if="calc.running" class="ui-hint">Расчёт этого периода уже идёт.</p>
        </div>
      </section>
    </template>

    <!-- Период ещё не запрашивали -->
    <section v-else-if="!error" class="ui-card">
      <h2 class="ui-section">Период не выбран</h2>
      <p class="ui-notice-text">
        Укажите период в шапке и нажмите «Показать состав». Запрос лёгкий: он показывает,
        что попадёт в расчёт, но сам расчёт не запускает.
      </p>
    </section>

    <UiDialog
      :open="launchOpen"
      :title="`Запустить расчёт за ${period.label}`"
      @close="launchOpen = false"
    >
      <p class="ui-notice-text">
        Расчёт занимает от нескольких секунд до 15 минут — столько отвечает 1С. Предсказать
        заранее, «тёплая» база или нет, невозможно.
      </p>
      <p class="ui-notice-text">
        Фонового режима пока нет: если закрыть вкладку или перейти на другой экран, расчёт
        прервётся и начнётся заново.
      </p>
      <p class="ui-notice-text">
        В 1С при этом ничего не изменится: сервис работает только на чтение.
      </p>
      <template #actions>
        <button type="button" class="ui-btn ui-btn-primary" @click="startCalculation">
          Запустить расчёт
        </button>
        <button type="button" class="ui-btn ui-btn-secondary" @click="launchOpen = false">
          Отмена
        </button>
      </template>
    </UiDialog>
  </div>
</template>
