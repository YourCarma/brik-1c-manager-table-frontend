<script setup lang="ts">
/**
 * С4. Отказ по несходимости.
 *
 * **Это штатный, а не аварийный сценарий** (ТЗ 6/С4), и экран подаёт его именно так:
 * сервис сознательно не выдаёт отчёт, который не сошёлся с 1С.
 *
 * Кнопки «скачать всё равно» здесь нет — ни в основном интерфейсе, ни в
 * «Подробностях», ни где-либо ещё (ТЗ 6/С4, критерий приёмки 11.6).
 *
 * Компонент принимает и структурированный перечень проверок, и сырой текст:
 * пока бэкенд отдаёт проверки построчно в тексте ошибки, работает запасной режим.
 * Появление структуры экран не переписывает (ТЗ 5.2).
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useCalcStore } from '@/stores/calc'
import { usePeriodStore } from '@/stores/period'
import { compareMoney, formatMoney, isNegative, diffMoney } from '@/lib/money'
import CopyButton from '@/components/ui/CopyButton.vue'
import DetailsBlock from '@/components/ui/DetailsBlock.vue'
import type { ReconciliationCheck } from '@/api/types'

const route = useRoute()
const calc = useCalcStore()
const period = usePeriodStore()
const { checks, mismatchText, error } = storeToRefs(calc)

/** Экран отвечает на вопрос «что не так», а не «что проверялось». */
const failed = computed<ReconciliationCheck[]>(() =>
  (checks.value ?? []).filter((c) => !c.passed),
)

const hasData = computed(() => failed.value.length > 0 || mismatchText.value.length > 0)

/**
 * Расхождение подписывается словом: знак минуса в бухгалтерской таблице читается
 * неоднозначно, «больше на» / «меньше на» — однозначно.
 *
 * Направление берётся из сравнения полученного с ожидаемым, а не из знака поля
 * `difference`: бэкенд отдаёт его модулем, и по знаку направление не восстановить.
 * Само поле используется как величина расхождения, если оно пришло.
 */
function differenceOf(check: ReconciliationCheck) {
  const direction = compareMoney(check.actual, check.expected)
  const raw = check.difference ?? diffMoney(check.actual, check.expected)
  if (raw === null) return { text: '', word: '' }

  const magnitude = isNegative(raw) ? raw.replace('-', '') : raw
  if (direction === 0) return { text: formatMoney(magnitude), word: '' }

  return {
    text: formatMoney(magnitude),
    word: direction > 0 ? 'больше на' : 'меньше на',
  }
}

const checksText = () => {
  if (failed.value.length > 0) {
    return [
      'Факт — перечень непрошедших проверок',
      `Период: ${calc.period ?? period.canonical ?? '—'}`,
      '',
      ...failed.value.map(
        (c) => `${c.name}\tожидалось ${c.expected}\tполучено ${c.actual}\tрасхождение ${c.difference ?? ''}`,
      ),
    ].join('\n')
  }
  return `Факт — ответ сервиса\nПериод: ${calc.period ?? '—'}\n\n${mismatchText.value}`
}
</script>

<template>
  <div class="ui-screen">
    <header class="ui-screen-head">
      <div>
        <div class="ui-kicker">Контроль сходимости</div>
        <h1 class="ui-title">Расчёт не сошёлся. Отчёт не выдан</h1>
      </div>
    </header>
    <div class="ui-rule-accent"></div>

    <template v-if="hasData">
      <section class="ui-card">
        <p class="ui-notice-text">
          Расчёт за {{ period.label }} выполнен полностью, но не прошёл обязательные контроли
          сходимости с 1С. Сервис не выдаёт отчёт, который расходится с учётом: цифра,
          которую нельзя сверить с ОСВ, хуже, чем отсутствие цифры.
        </p>
        <p class="ui-notice-text">
          В 1С ничего не изменилось: сервис работает только на чтение.
        </p>
      </section>

      <!-- Структурированный перечень проверок -->
      <section v-if="failed.length" class="ui-card ui-card-flush">
        <div class="ui-toolbar">
          <h2 class="ui-section">Непрошедшие проверки</h2>
        </div>
        <div class="ui-table-wrap">
          <table class="ui-table">
            <thead>
              <tr>
                <th class="ui-col-key">Проверка</th>
                <th class="ui-num">Ожидалось</th>
                <th class="ui-num">Получено</th>
                <th class="ui-num ui-col-split">Расхождение</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="check in failed" :key="check.name">
                <th class="ui-col-key" scope="row">{{ check.name }}</th>
                <td class="ui-num">{{ formatMoney(check.expected) }}</td>
                <td class="ui-num">{{ formatMoney(check.actual) }}</td>
                <td class="ui-num ui-col-split">
                  {{ differenceOf(check).word }} {{ differenceOf(check).text }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Запасной режим: бэкенд пока отдаёт проверки текстом -->
      <section v-else class="ui-card">
        <h2 class="ui-section">Сервис сообщил:</h2>
        <pre class="ui-pre">{{ mismatchText }}</pre>
      </section>

      <section class="ui-card">
        <h2 class="ui-section">Что делать</h2>
        <ol class="ui-steps">
          <li>
            <p class="ui-notice-text">
              Посмотрите состав заказов за период. Чаще всего расхождение объясняется группой
              без номера заказа или оборотом без номенклатурной группы — оба признака видны
              в предпросмотре.
            </p>
            <RouterLink :to="{ name: 'preview', query: route.query }" class="ui-btn ui-btn-primary ui-btn-sm">
              Посмотреть состав заказов
            </RouterLink>
          </li>
          <li>
            <p class="ui-notice-text">
              Если в составе всё чисто — расхождение методологическое. Передайте сопровождению
              перечень проверок целиком.
            </p>
            <CopyButton
              :text="checksText"
              label="Скопировать перечень проверок"
              variant="secondary"
            />
          </li>
          <li>
            <p class="ui-notice-text">
              После исправления данных в 1С запустите расчёт заново.
            </p>
            <RouterLink :to="{ name: 'preview', query: route.query }" class="ui-btn ui-btn-secondary ui-btn-sm">
              Повторить расчёт
            </RouterLink>
          </li>
        </ol>
      </section>

      <section class="ui-card">
        <p class="ui-notice-text">
          Скачать несошедшийся отчёт нельзя. Такой файл внешне не отличается от правильного:
          открыв его через неделю, отличить его от сошедшегося будет невозможно, а колонки
          из него уже уйдут в рабочую таблицу менеджеров.
        </p>

        <DetailsBlock>
          <dl class="ui-kv">
            <dt>Период</dt>
            <dd>{{ calc.period ?? '—' }}</dd>
            <dt>Операция</dt>
            <dd>Полный расчёт (POST /report)</dd>
            <dt>Длительность</dt>
            <dd>{{ calc.elapsedText }}</dd>
            <dt>Код ответа</dt>
            <dd>{{ error?.status ?? '—' }}</dd>
          </dl>

          <table v-if="checks?.length" class="ui-table ui-table-dense">
            <thead>
              <tr>
                <th>Контроль</th>
                <th class="ui-num">Ожидалось</th>
                <th class="ui-num">Получено</th>
                <th>Итог</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="check in checks" :key="check.name">
                <td>{{ check.name }}</td>
                <td class="ui-num">{{ formatMoney(check.expected) }}</td>
                <td class="ui-num">{{ formatMoney(check.actual) }}</td>
                <td>
                  <span v-if="check.passed" class="ui-badge ui-badge-ok">Сошлось</span>
                  <span v-else class="ui-badge ui-badge-deny">Не сошлось</span>
                </td>
              </tr>
            </tbody>
          </table>

          <pre class="ui-pre">{{ error?.serverMessage || mismatchText }}</pre>
        </DetailsBlock>
      </section>
    </template>

    <section v-else class="ui-card">
      <h2 class="ui-section">Данных о несошедшемся расчёте нет</h2>
      <p class="ui-notice-text">
        Возможно, страница открыта по прямой ссылке или обновлена: результат живёт
        в памяти вкладки.
      </p>
      <div class="ui-notice-actions">
        <RouterLink :to="{ name: 'preview', query: route.query }" class="ui-btn ui-btn-primary ui-btn-sm">
          Вернуться к составу расчёта
        </RouterLink>
      </div>
    </section>
  </div>
</template>
