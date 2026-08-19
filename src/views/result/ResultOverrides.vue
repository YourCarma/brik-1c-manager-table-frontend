<script setup lang="ts">
/**
 * С5. Ручное переопределение участия в распределении 26 счёта.
 *
 * Требования ТЗ 6/С5:
 *  - видно, какие заказы переопределены вручную и чем это отличается от расчётного
 *    признака;
 *  - видно, как изменились доли и суммы CF (было / стало);
 *  - переопределение сбрасывается одним действием;
 *  - между периодами не переносится (сброс делает store при смене периода).
 *
 * Пересчёт на клиенте **не выполняется** (ТЗ 4.2.3): до пересчёта колонки «стало»
 * пусты и подписаны — значения появятся только после запроса к сервису.
 *
 * Продуктовое ограничение: файл обязан отражать переопределённое состояние,
 * поэтому на экране всегда видно, какое состояние уйдёт в книгу.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useCalcStore } from '@/stores/calc'
import { usePeriodStore } from '@/stores/period'
import { formatPercent } from '@/lib/money'
import MoneyCell from '@/components/ui/MoneyCell.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import UiDialog from '@/components/ui/UiDialog.vue'

const route = useRoute()
const router = useRouter()
const calc = useCalcStore()
const period = usePeriodStore()
const { report, overrides } = storeToRefs(calc)

const confirmOpen = ref(false)

/** Снимок долей до пересчёта — источник колонок «было». */
const before = ref(
  new Map(
    (report.value?.orders ?? []).map((o) => [
      o.order_code,
      { share: o.allocation_share, cf: o.overhead_26 },
    ]),
  ),
)

const orders = computed(() => report.value?.orders ?? [])
const dirty = computed(() => calc.overrideCount > 0)

/** Пересчёт ещё не выполнялся — «стало» показывать нечем. */
const recalculated = computed(() => report.value?.overrides_applied === true)

function participates(code: string, fallback: boolean) {
  const value = overrides.value[code]
  return value === undefined ? fallback : value
}

function togglePart(code: string, current: boolean) {
  calc.setOverride(code, !current)
}

function recalculate() {
  confirmOpen.value = false
  if (!period.canonical) return
  void calc.run(period.canonical)
  void router.push({ name: 'calc', query: route.query })
}

function reset() {
  calc.clearOverrides()
}
</script>

<template>
  <template v-if="report">
    <section v-if="dirty" class="ui-notice ui-notice-warn">
      <h2 class="ui-notice-title">Участие снято вручную у {{ calc.overrideCount }} заказов</h2>
      <p v-if="!recalculated" class="ui-notice-text">
        Доли и суммы CF пока не изменились: пересчёт делает сервис, интерфейс методологию
        не считает. Колонки «стало» заполнятся после пересчёта.
      </p>
      <p v-else class="ui-notice-text">
        В файл ушло переопределённое состояние: признак участия записан значением,
        а не формулой — иначе Excel пересчитал бы по-своему и разошёлся с экраном.
      </p>
      <div class="ui-notice-actions">
        <button type="button" class="ui-btn ui-btn-primary ui-btn-sm" @click="confirmOpen = true">
          Пересчитать с переопределением
        </button>
        <button type="button" class="ui-btn ui-btn-danger ui-btn-sm" @click="reset">
          Сбросить переопределение
        </button>
      </div>
    </section>

    <section class="ui-card ui-card-flush">
      <EmptyState
        v-if="orders.length === 0"
        text="Переопределений нет: участие всех заказов определено расчётом."
      />

      <!-- Прокручивается таблица, а не страница (ТЗ 9). Запас считается по
           состоянию без переопределений: панели своей у таблицы нет, а блок
           «участие снято вручную» появляется только после действия. -->
      <div v-else class="ui-table-wrap" style="max-block-size: calc(100vh - 460px)">
        <table class="ui-table">
          <thead>
            <tr>
              <th class="ui-col-key">Заказ</th>
              <th>Участие</th>
              <th class="ui-num ui-col-split">Доля, % (было)</th>
              <th class="ui-num">Доля, % (стало)</th>
              <th class="ui-num ui-col-split">Сумма CF (было)</th>
              <th class="ui-num">Сумма CF (стало)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in orders" :key="row.order_code">
              <th class="ui-col-key" scope="row">{{ row.order_code }}</th>
              <td>
                <label class="ui-switch">
                  <input
                    type="checkbox"
                    :checked="participates(row.order_code, row.in_allocation !== false)"
                    @change="togglePart(row.order_code, participates(row.order_code, row.in_allocation !== false))"
                  />
                  <span v-if="overrides[row.order_code] !== undefined" class="ui-badge ui-badge-warn">
                    Снято вручную
                  </span>
                  <span v-else class="ui-badge ui-badge-neutral">Определено расчётом</span>
                </label>
              </td>
              <td class="ui-pct ui-col-split">
                {{ formatPercent(before.get(row.order_code)?.share) }}
              </td>
              <td class="ui-pct" :title="recalculated ? undefined : 'Будет известно после пересчёта'">
                {{ recalculated ? formatPercent(row.allocation_share) : '' }}
              </td>
              <MoneyCell :value="before.get(row.order_code)?.cf" split />
              <MoneyCell :value="recalculated ? row.overhead_26 : null" />
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <UiDialog
      :open="confirmOpen"
      :title="`Пересчитать «Факт» за ${period.label}`"
      @close="confirmOpen = false"
    >
      <p class="ui-notice-text">
        Пересчёт с переопределением — такой же полный расчёт: он занимает от нескольких
        секунд до 15 минут и снова обращается к 1С.
      </p>
      <p class="ui-notice-text">
        Фонового режима пока нет: если закрыть вкладку или перейти на другой экран,
        расчёт прервётся.
      </p>
      <template #actions>
        <button type="button" class="ui-btn ui-btn-primary" @click="recalculate">
          Пересчитать с переопределением
        </button>
        <button type="button" class="ui-btn ui-btn-secondary" @click="confirmOpen = false">
          Отмена
        </button>
      </template>
    </UiDialog>
  </template>
</template>
