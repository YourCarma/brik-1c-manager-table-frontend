<script setup lang="ts">
/**
 * С2. Запуск расчёта и его состояние.
 *
 * Ключевая развилка проекта: расчёт живёт в одном HTTP-запросе до 15 минут,
 * фонового режима пока нет (ТЗ 12.1). Всё поведение экрана подчинено этому:
 *  - индикация с первой секунды, объяснение по стадиям (ТЗ 7.1.2);
 *  - честное прошедшее время вместо выдуманного процента — сервис прогресс
 *    не отдаёт, а рисовать полосу значит обманывать человека, который потом
 *    отвечает за цифру;
 *  - уход со страницы перехватывается на двух уровнях;
 *  - автоповторов нет ни при каких условиях (ТЗ 7.1.3).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useCalcStore } from '@/stores/calc'
import { usePeriodStore } from '@/stores/period'
import { HAS_BACKGROUND_MODE, HAS_REPORT_JSON } from '@/config/features'
import { periodLabel } from '@/lib/period'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import UiDialog from '@/components/ui/UiDialog.vue'

const route = useRoute()
const router = useRouter()
const calc = useCalcStore()
const period = usePeriodStore()

const { status, stage, elapsedText, error, file } = storeToRefs(calc)

const leaveOpen = ref(false)
let pendingLeave: (() => void) | null = null

const label = computed(() => periodLabel(calc.period) || period.label)

const supportText = () =>
  [
    'Факт — обращение в сопровождение',
    `Период:        ${calc.period ?? '—'}`,
    'Операция:      Полный расчёт (POST /report)',
    `Время запроса: ${calc.startedAt?.toLocaleString('ru-RU') ?? '—'}`,
    `Длительность:  ${calc.elapsedText}`,
    `Код ответа:    ${calc.error?.status ?? 'ответа ещё нет'}`,
    `Ответ сервиса: ${calc.error?.serverMessage || '—'}`,
  ].join('\n')

/** Страховка на уровне браузера: текст окна мы не контролируем (UX-карта 2/С2). */
function guardUnload(event: BeforeUnloadEvent) {
  if (!calc.running || HAS_BACKGROUND_MODE) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => window.addEventListener('beforeunload', guardUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', guardUnload))

onBeforeRouteLeave((_to, _from, next) => {
  if (!calc.running || HAS_BACKGROUND_MODE) {
    next()
    return
  }
  pendingLeave = () => next()
  leaveOpen.value = true
  next(false)
})

function stayAndWait() {
  leaveOpen.value = false
  pendingLeave = null
}

function leaveAndAbort() {
  leaveOpen.value = false
  calc.abort()
  const go = pendingLeave
  pendingLeave = null
  go?.()
}

/**
 * Успех и отказ по сходимости уводят на свои экраны.
 *
 * Пока JSON-метода отчёта нет (ТЗ 5.2), уводить некуда: экран результата
 * без данных — тупик. В этом случае остаёмся здесь и показываем, что расчёт
 * выполнен, файл сохранён и книгу можно открыть в браузере. Требование ТЗ 6/С2.4
 * («результат остаётся доступен, а не исчезает вместе со скачанным файлом»)
 * закрыто и без JSON-ручки.
 */
watch(status, async (value) => {
  if (value === 'done' && HAS_REPORT_JSON) {
    await router.replace({ name: 'result-summary', query: route.query })
  }
  if (value === 'mismatch') await router.replace({ name: 'mismatch', query: route.query })
})

function retry() {
  if (calc.period) void calc.run(calc.period)
}
</script>

<template>
  <div class="ui-screen">
    <header class="ui-screen-head">
      <div>
        <div class="ui-kicker">Шаг 2</div>
        <h1 class="ui-title">Расчёт за {{ label }}</h1>
      </div>
    </header>
    <div class="ui-rule-accent"></div>

    <!-- Идёт расчёт -->
    <section v-if="status === 'running'" class="ui-card">
      <p class="ui-notice ui-notice-warn ui-notice-tight">
        Не закрывайте вкладку: фонового режима пока нет, уход прервёт расчёт.
      </p>

      <h2 class="ui-section">{{ stage.title }}</h2>
      <div class="ui-calc-time ui-num">Идёт {{ elapsedText }}</div>
      <div class="ui-progress"></div>
      <p class="ui-notice-text">{{ stage.text }}</p>

      <div class="ui-notice-actions">
        <button
          v-if="stage.offerAbort"
          type="button"
          class="ui-btn ui-btn-danger ui-btn-sm"
          @click="calc.abort()"
        >
          Прервать расчёт
        </button>
        <CopyButton v-if="stage.offerSupport" :text="supportText" />
      </div>
    </section>

    <!-- Прервано пользователем -->
    <section v-else-if="status === 'aborted'" class="ui-card">
      <h2 class="ui-section">Расчёт прерван</h2>
      <p class="ui-notice-text">
        Расчёт за {{ label }} остановлен по вашему указанию. Файл не сформирован,
        результата нет.
      </p>
      <p class="ui-notice-text">
        В 1С ничего не изменилось: сервис работает только на чтение.
      </p>
      <div class="ui-notice-actions">
        <button type="button" class="ui-btn ui-btn-primary ui-btn-sm" @click="retry">
          Повторить расчёт
        </button>
        <RouterLink :to="{ name: 'preview', query: route.query }" class="ui-btn ui-btn-secondary ui-btn-sm">
          Посмотреть состав заказов
        </RouterLink>
      </div>
    </section>

    <!-- Ошибка расчёта. Остаёмся здесь, период сохранён, автоповтора нет. -->
    <ErrorPanel
      v-else-if="status === 'failed' && error"
      :error="error"
      context="Полный расчёт (POST /report)"
      :period="calc.period"
      @retry="retry"
      @retry-report="retry"
    />

    <!-- Расчёт завершён: файл у пользователя -->
    <section v-else-if="status === 'done'" class="ui-card">
      <h2 class="ui-section">Расчёт выполнен</h2>
      <p class="ui-notice-text">
        Файл <code>{{ file?.filename }}</code> сохранён. Результат остаётся на экране —
        он не исчезает вместе со скачанным файлом.
      </p>
      <p v-if="!HAS_REPORT_JSON" class="ui-notice-text">
        Показать расчёт на экране пока нельзя: сервис ещё не отдаёт результат в JSON.
        Содержимое файла можно посмотреть и поправить прямо в браузере.
      </p>

      <div class="ui-notice-actions">
        <RouterLink
          v-if="HAS_REPORT_JSON"
          :to="{ name: 'result-summary', query: route.query }"
          class="ui-btn ui-btn-primary ui-btn-sm"
        >
          Открыть результат расчёта
        </RouterLink>
        <RouterLink
          v-if="file"
          :to="{ name: 'workbook', query: route.query }"
          class="ui-btn"
          :class="HAS_REPORT_JSON ? 'ui-btn-secondary ui-btn-sm' : 'ui-btn-primary ui-btn-sm'"
        >
          Открыть книгу в браузере
        </RouterLink>
        <button type="button" class="ui-btn ui-btn-secondary ui-btn-sm" @click="calc.downloadAgain()">
          Скачать файл ещё раз
        </button>
      </div>
    </section>

    <!-- Прямой заход на экран -->
    <section v-else class="ui-card">
      <h2 class="ui-section">Расчёт не выполнялся</h2>
      <p class="ui-notice-text">
        За {{ label || 'выбранный период' }} расчёт в этой вкладке не запускался.
        Начните с состава заказов: он показывает, что попадёт в расчёт, и стоит секунды.
      </p>
      <div class="ui-notice-actions">
        <RouterLink :to="{ name: 'preview', query: route.query }" class="ui-btn ui-btn-primary ui-btn-sm">
          Посмотреть состав заказов
        </RouterLink>
      </div>
    </section>

    <UiDialog :open="leaveOpen" title="Прервать расчёт" @close="stayAndWait">
      <p class="ui-notice-text">
        Расчёт за {{ label }} идёт {{ elapsedText }}. Если уйти с этого экрана, запрос
        прервётся: результат не сохранится, и расчёт придётся начать с начала — сервис
        снова обратится к 1С.
      </p>
      <p class="ui-notice-text">
        Фоновый режим, при котором расчёт продолжается без открытой вкладки, появится позже.
      </p>
      <template #actions>
        <button type="button" class="ui-btn ui-btn-primary" @click="stayAndWait">
          Остаться и ждать
        </button>
        <button type="button" class="ui-btn ui-btn-danger" @click="leaveAndAbort">
          Уйти и прервать расчёт
        </button>
      </template>
    </UiDialog>
  </div>
</template>
