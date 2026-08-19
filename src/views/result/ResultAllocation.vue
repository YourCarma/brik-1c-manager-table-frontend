<script setup lang="ts">
/**
 * С3, представление 2: распределение 26 счёта.
 *
 * Требования ТЗ 6/С3: прямая ЗП, остаток НЗП (справочно), участие в распределении,
 * доля в процентах, сумма CF. Отдельно и заметно — общая сумма 26 счёта за период
 * и база распределения. Сумма долей обязана показываться и равняться 100 %.
 *
 * Отдельный блок внизу — расшифровка 26 счёта по статьям (`articles_26`).
 *
 * ⚠️ Вёрстка соблюдает примечание ТЗ 3: «в работе» и «участвует в распределении
 * 26 сч» — **разные признаки**. Колонки не стоят рядом, оформлены по-разному,
 * и над таблицей висит постоянное пояснение, а не всплывающая подсказка.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useCalcStore } from '@/stores/calc'
import { useTableSort } from '@/composables/useTableSort'
import { formatMoney, formatPercent, sumMoney } from '@/lib/money'
import { SUMMARY_COLUMNS } from '@/lib/columns'
import { HAS_OVERRIDES } from '@/config/features'
import MoneyCell from '@/components/ui/MoneyCell.vue'
import TermHint from '@/components/ui/TermHint.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import type { ReportOrder } from '@/api/types'

const route = useRoute()
const calc = useCalcStore()
const { report } = storeToRefs(calc)

const orders = computed(() => report.value?.orders ?? [])

const { sorted, toggle, ariaSort } = useTableSort<ReportOrder>(
  () => orders.value,
  [
    { key: 'order_code', kind: 'text', value: (r) => r.order_code },
    { key: 'direct_wage', kind: 'money', value: (r) => r.direct_wage },
    { key: 'wip_balance', kind: 'money', value: (r) => r.wip_balance },
    { key: 'in_allocation', kind: 'flag', value: (r) => r.in_allocation !== false },
    { key: 'share', kind: 'money', value: (r) => r.allocation_share },
    { key: 'overhead_26', kind: 'money', value: (r) => r.overhead_26 },
  ],
  { key: 'overhead_26', direction: 'desc' },
)

/**
 * Сумма долей — контрольная величина, которую ТЗ требует показывать (6/С3).
 * Складываются здесь именно доли, уже посчитанные бэкендом: методология
 * на клиенте не пересчитывается (ТЗ 4.2.3).
 */
const sharesTotal = computed(() => sumMoney(orders.value.map((o) => o.allocation_share)))

const articles26 = computed(() => Object.entries(report.value?.articles_26 ?? {}))
const articles26Total = computed(() => sumMoney(articles26.value.map(([, amount]) => amount)))
</script>

<template>
  <template v-if="report">
    <!-- Заметный блок: сумма 26 счёта, база распределения, сумма долей -->
    <section class="ui-counters">
      <div class="ui-counter ui-counter-wide">
        <div class="ui-counter-label">Сумма 26 счёта за период</div>
        <div class="ui-counter-value ui-num ui-num-strong">
          {{ formatMoney(report.overhead_26_total) }}
        </div>
      </div>
      <div class="ui-counter ui-counter-wide">
        <div class="ui-counter-label">
          <TermHint :text="SUMMARY_COLUMNS.directWage.hint">База распределения</TermHint>
        </div>
        <div class="ui-counter-value ui-num">{{ formatMoney(report.allocation_base) }}</div>
      </div>
      <div class="ui-counter">
        <div class="ui-counter-label">Сумма долей</div>
        <div class="ui-counter-value ui-num">{{ formatPercent(sharesTotal) }}</div>
      </div>
    </section>

    <!-- Постоянное пояснение, а не подсказка по наведению (ТЗ 3, примечание) -->
    <p class="ui-notice ui-notice-neutral ui-notice-tight">
      «В работе» и «участвует в распределении 26 сч» — разные признаки. Заказ, закрывшийся
      в этом месяце, в работе не находится, но накладные расходы месяца делит наравне
      с остальными.
    </p>

    <section class="ui-card ui-card-flush">
      <div class="ui-toolbar">
        <span class="ui-micro">
          Доли и суммы CF приходят с бэкенда посчитанными — интерфейс их не пересчитывает.
        </span>
        <RouterLink
          v-if="HAS_OVERRIDES"
          :to="{ name: 'result-overrides', query: route.query }"
          class="ui-btn ui-btn-secondary ui-btn-sm"
        >
          Переопределить участие
        </RouterLink>
      </div>

      <EmptyState
        v-if="orders.length === 0"
        text="26 счёт за период не распределялся: сумма 26 счёта — 0,00. Колонка CF по всем заказам нулевая."
      />

      <!-- Прокручивается таблица, а не страница (ТЗ 9). Над таблицей стоят ещё
           счётчики и постоянное пояснение — запас больше, чем в своде. -->
      <div v-else class="ui-table-wrap" style="max-block-size: calc(100vh - 480px)">
        <table class="ui-table">
          <thead>
            <tr>
              <th class="ui-col-key" :aria-sort="ariaSort('order_code')" @click="toggle('order_code')">
                Заказ
              </th>
              <th class="ui-num" :aria-sort="ariaSort('direct_wage')" @click="toggle('direct_wage')">
                <TermHint :text="SUMMARY_COLUMNS.directWage.hint">Прямая ЗП</TermHint>
              </th>
              <!-- Между «в работе» и «участвует» всегда есть колонка: признаки
                   не должны читаться как один (ТЗ 3). -->
              <th class="ui-num" :aria-sort="ariaSort('wip_balance')" @click="toggle('wip_balance')">
                <TermHint :text="SUMMARY_COLUMNS.wip.hint">Остаток НЗП (справочно)</TermHint>
              </th>
              <th class="ui-col-split" :aria-sort="ariaSort('in_allocation')" @click="toggle('in_allocation')">
                <TermHint text="Заказ делит общехозяйственные расходы месяца пропорционально прямой ЗП производственных рабочих.">
                  Участвует в распределении 26 сч
                </TermHint>
              </th>
              <th class="ui-num" :aria-sort="ariaSort('share')" @click="toggle('share')">Доля, %</th>
              <th class="ui-num" :aria-sort="ariaSort('overhead_26')" @click="toggle('overhead_26')">
                Сумма CF
              </th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="row in sorted" :key="row.order_code">
              <th class="ui-col-key" scope="row">{{ row.order_code }}</th>
              <MoneyCell :value="row.direct_wage" />
              <MoneyCell :value="row.wip_balance" />
              <td class="ui-col-split">
                <span v-if="row.in_allocation !== false" class="ui-badge ui-badge-ok">Участвует</span>
                <span v-else class="ui-badge ui-badge-deny">Не участвует</span>
                <span v-if="row.allocation_overridden" class="ui-badge ui-badge-warn">
                  Снято вручную
                </span>
              </td>
              <td class="ui-pct">{{ formatPercent(row.allocation_share) }}</td>
              <MoneyCell :value="row.overhead_26" />
            </tr>
          </tbody>

          <tfoot>
            <tr>
              <th class="ui-col-key" scope="row">Итого</th>
              <MoneyCell :value="report.allocation_base" strong />
              <td></td>
              <td class="ui-col-split"></td>
              <td class="ui-pct ui-num-strong">{{ formatPercent(sharesTotal) }}</td>
              <MoneyCell :value="report.overhead_26_total" strong />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>

    <!-- Расшифровка 26 счёта по статьям -->
    <section class="ui-card ui-card-flush">
      <div class="ui-toolbar">
        <h2 class="ui-section">Расшифровка 26 счёта по статьям</h2>
      </div>

      <EmptyState v-if="articles26.length === 0" text="За период нет статей по 26 счёту." />

      <div v-else class="ui-table-wrap" style="max-block-size: 40vh">
        <table class="ui-table ui-table-dense">
          <thead>
            <tr>
              <th class="ui-col-key">Статья затрат</th>
              <th class="ui-num">Сумма</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="[article, amount] in articles26" :key="article">
              <th class="ui-col-key" scope="row">{{ article }}</th>
              <MoneyCell :value="amount" />
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th class="ui-col-key" scope="row">Итого</th>
              <MoneyCell :value="articles26Total" strong />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  </template>
</template>
