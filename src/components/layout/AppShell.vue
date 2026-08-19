<script setup lang="ts">
/**
 * Каркас приложения (UX-карта 1.3).
 *
 * Одинаков на всех маршрутах: шапка с логотипом, полем периода и индикатором
 * доступности сервиса, строка контекста с текущим периодом и плашками
 * (фильтр состава, «из кэша»), и рабочая область.
 *
 * Шапка — единая точка выбора периода, доступная с любого экрана (ТЗ 9.1).
 * Текущий период виден всегда, включая экраны ошибок.
 */
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import PeriodField from './PeriodField.vue'
import ServiceIndicator from './ServiceIndicator.vue'
import ThemeToggle from './ThemeToggle.vue'
import { usePeriodStore } from '@/stores/period'
import { useOrdersStore } from '@/stores/orders'
import { useCalcStore } from '@/stores/calc'
import { useHealthStore } from '@/stores/health'
import { HAS_HISTORY } from '@/config/features'
import { periodLabel } from '@/lib/period'

const route = useRoute()
const router = useRouter()
const period = usePeriodStore()
const orders = useOrdersStore()
const calc = useCalcStore()
const health = useHealthStore()

const { data: ordersData } = storeToRefs(orders)

const filter = computed(() => ordersData.value?.orders_filter ?? null)

onMounted(async () => {
  void health.check()

  // Период из адреса: ссылку на любой экран можно переслать коллеге.
  // «Сырой» период (`?period=июнь 2026`) отправляется как есть — нормализует его
  // сервер, клиент лишь записывает канонический ответ обратно в адрес (ТЗ 5.3.3).
  const fromUrl = typeof route.query.period === 'string' ? route.query.period : ''
  if (fromUrl) {
    period.draft = periodLabel(fromUrl) || fromUrl
    await load(fromUrl)
  } else {
    period.suggestDefault()
  }
})

/** Поле периода блокируется на время расчёта (ТЗ 7.1.4). */
watch(
  () => calc.running,
  (running) => {
    period.locked = running
  },
)

async function load(value: string) {
  const previous = period.canonical
  const ok = await orders.load(value)
  if (!ok) return

  // Смена периода: результат старого не смешивается с новым ни на секунду
  // (UX-карта 4.4). Переопределения участия тоже не переносятся (ТЗ 6/С5).
  if (previous && previous !== period.canonical) calc.reset()

  // Канонический период пишется в адрес: ссылку на любой экран можно переслать
  // коллеге. Нормализует период сервер, клиент лишь записывает его ответ.
  //
  // Маршрут при этом **сохраняется** (UX-карта 1.2): были на «Расшифровке» —
  // остались на ней, просто её содержимое сбросилось в состояние «расчёт
  // за новый период не выполнялся». Принудительный увод на предпросмотр ломал бы
  // и прямые ссылки на экраны.
  if (route.query.period !== period.canonical) {
    await router.replace({ query: { ...route.query, period: period.canonical ?? undefined } })
  }
}
</script>

<template>
  <div class="ui-shell">
    <div class="ui-header-bar">
      <header class="ui-header">
        <RouterLink :to="{ name: 'preview', query: route.query }" class="ui-brand">
          <span>
            <span class="ui-brand-name">Факт</span>
            <span class="ui-brand-sub">Управленческая таблица</span>
          </span>
        </RouterLink>

        <PeriodField :busy="orders.loading" @submit="load" />

        <div class="ui-header-side">
          <ServiceIndicator />
          <RouterLink
            v-if="HAS_HISTORY"
            :to="{ name: 'history', query: route.query }"
            class="ui-btn ui-btn-ghost ui-btn-sm"
          >
            История расчётов
          </RouterLink>
          <ThemeToggle />
        </div>
      </header>
    </div>

    <div class="ui-context">
      <span class="ui-kicker">Период: {{ period.label || 'не выбран' }}</span>

      <span v-if="filter" class="ui-badge ui-badge-warn" :title="`Правило фильтра: ${filter}`">
        Действует фильтр состава заказов
      </span>

      <span v-if="calc.fromCache" class="ui-badge ui-badge-neutral">
        Из кэша · посчитан
        {{ calc.report?.calculated_at ? new Date(calc.report.calculated_at).toLocaleString('ru-RU') : '' }}
      </span>

      <span v-if="calc.overrideCount > 0" class="ui-badge ui-badge-warn">
        Участие снято вручную у {{ calc.overrideCount }} заказов
      </span>

      <span v-if="calc.running" class="ui-badge ui-badge-deny">
        Идёт расчёт за {{ periodLabel(calc.period) }} · {{ calc.elapsedText }}
      </span>
    </div>

    <main class="ui-main">
      <RouterView />
    </main>
  </div>
</template>
