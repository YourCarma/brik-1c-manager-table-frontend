<script setup lang="ts">
/**
 * С3. Результат расчёта на экране — каркас трёх представлений одних и тех же данных.
 *
 * Здесь же живёт связка с экраном книги: пользователь обязан понимать, чем
 * «Результат расчёта» отличается от «Книги .xlsx», иначе он будет сверять
 * с 1С правленый файл (UX-карта 7.6).
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useCalcStore } from '@/stores/calc'
import { usePeriodStore } from '@/stores/period'
import { HAS_OVERRIDES } from '@/config/features'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'

const route = useRoute()
const calc = useCalcStore()
const period = usePeriodStore()

const { report, reportError, file } = storeToRefs(calc)

const tabs = computed(() => {
  const items = [
    { name: 'result-summary', label: 'Свод по заказам', count: report.value?.orders.length },
    { name: 'result-allocation', label: 'Распределение 26 сч', count: undefined },
    { name: 'result-details', label: 'Расшифровка', count: report.value?.breakdown?.length },
  ]
  if (HAS_OVERRIDES) {
    items.push({ name: 'result-overrides', label: 'Переопределение участия', count: undefined })
  }
  return items
})

function retryJson() {
  if (calc.period) void calc.loadReportJson(calc.period)
}
</script>

<template>
  <div class="ui-screen">
    <header class="ui-screen-head">
      <div>
        <div class="ui-kicker">Шаг 3</div>
        <h1 class="ui-title">Результат расчёта за {{ period.label }}</h1>
      </div>
      <div class="ui-screen-actions">
        <button
          v-if="file"
          type="button"
          class="ui-btn ui-btn-secondary ui-btn-sm"
          @click="calc.downloadAgain()"
        >
          Скачать файл ещё раз
        </button>
        <RouterLink
          v-if="file"
          :to="{ name: 'workbook', query: route.query }"
          class="ui-btn ui-btn-primary ui-btn-sm"
        >
          Открыть книгу в браузере
        </RouterLink>
      </div>
    </header>
    <div class="ui-rule-accent"></div>

    <p class="ui-hint ui-measure">
      Это то, что посчитал сервис. Здесь удобно проверять: искать заказ, раскрывать
      расшифровку, фильтровать по счёту. Чтобы посмотреть и поправить сам файл перед
      переносом в таблицу менеджеров — «Открыть книгу в браузере».
    </p>

    <!-- Частичный отказ: файл готов, но показать результат на экране не удалось -->
    <section v-if="reportError && file" class="ui-notice ui-notice-warn">
      <h2 class="ui-notice-title">Файл готов, но показать результат на экране не удалось</h2>
      <p class="ui-notice-text">
        Расчёт выполнен и файл скачан — цифры в нём полные. Не ответил только метод,
        который отдаёт результат для показа на экране.
      </p>
      <div class="ui-notice-actions">
        <button type="button" class="ui-btn ui-btn-secondary ui-btn-sm" @click="retryJson">
          Повторить
        </button>
        <button type="button" class="ui-btn ui-btn-secondary ui-btn-sm" @click="calc.downloadAgain()">
          Скачать файл ещё раз
        </button>
      </div>
    </section>

    <ErrorPanel
      v-else-if="reportError"
      :error="reportError"
      context="Результат расчёта (GET /report)"
      :period="calc.period"
      @retry="retryJson"
    />

    <template v-if="report">
      <nav class="ui-tabs" role="tablist">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.name"
          v-slot="{ isActive, navigate }"
          :to="{ name: tab.name, query: route.query }"
          custom
        >
          <button
            class="ui-tab"
            role="tab"
            :aria-selected="isActive"
            type="button"
            @click="navigate"
          >
            {{ tab.label }}
            <span v-if="tab.count !== undefined" class="ui-tab-count">{{ tab.count }}</span>
          </button>
        </RouterLink>
      </nav>

      <RouterView />
    </template>

    <section v-else-if="!reportError" class="ui-card">
      <h2 class="ui-section">Расчёт за {{ period.label || 'выбранный период' }} не выполнялся</h2>
      <p class="ui-notice-text">
        Результат живёт в памяти вкладки: после перезагрузки страницы его нужно
        получить заново.
      </p>
      <div class="ui-notice-actions">
        <RouterLink :to="{ name: 'preview', query: route.query }" class="ui-btn ui-btn-primary ui-btn-sm">
          Посмотреть состав заказов
        </RouterLink>
      </div>
    </section>
  </div>
</template>
