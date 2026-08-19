<script setup lang="ts">
/**
 * Книга `.xlsx` в браузере — просмотр и правка (UX-карта 7).
 *
 * Отдельная страница, а не панель поверх результата: книгу листают и правят,
 * ей нужна вся ширина, у неё своё состояние (несохранённые правки), и на неё
 * дают ссылку.
 *
 * Границы, которые экран не переходит:
 *  - **браузер формулы не пересчитывает** (ТЗ 4.2.3) — это делает Excel при
 *    открытии сохранённого файла, и об этом сказано постоянной строкой;
 *  - **в 1С и в сервис правки не попадают** (ТЗ 4.2.1) — они живут только
 *    в скачанном файле;
 *  - источник истины при сверке с ОСВ — экран «Результат расчёта», а не эта книга.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useCalcStore } from '@/stores/calc'
import { useWorkbookStore } from '@/stores/workbook'
import type { SheetCell } from '@/stores/workbook'
import UiDialog from '@/components/ui/UiDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { columnLetter } from '@/lib/excelRefs'
import { HAS_REPORT_JSON } from '@/config/features'

const route = useRoute()
const router = useRouter()
const calc = useCalcStore()
const book = useWorkbookStore()

const { sheets, loading, parseError, dirty, hasFormulas } = storeToRefs(book)

const activeName = ref<string>(typeof route.query.sheet === 'string' ? route.query.sheet : '')
const selected = ref<SheetCell | null>(null)
const editing = ref<{ cell: SheetCell; value: string } | null>(null)
const editInput = ref<HTMLInputElement | HTMLInputElement[] | null>(null)
const formulaConfirm = ref<{ cell: SheetCell; value: string } | null>(null)
const leaveOpen = ref(false)
let pendingLeave: (() => void) | null = null

const active = computed(
  () => sheets.value.find((s) => s.name === activeName.value) ?? sheets.value[0] ?? null,
)

/**
 * Куда возвращаться. Пока JSON-метода отчёта нет (ТЗ 5.2), экрана результата
 * не существует, и возврат ведёт на экран расчёта — тупиков быть не должно.
 */
const backLink = computed(() =>
  HAS_REPORT_JSON
    ? { name: 'result-summary', query: route.query }
    : { name: 'calc', query: route.query },
)

onMounted(async () => {
  if (calc.file && book.source !== calc.file.blob) {
    await book.open(calc.file.blob, calc.file.filename)
  }
  if (!activeName.value && sheets.value.length) activeName.value = sheets.value[0].name
})

watch(activeName, (name) => {
  if (name && route.query.sheet !== name) {
    void router.replace({ query: { ...route.query, sheet: name } })
  }
})

/** Уход с несохранёнными правками перехватывается: книга живёт в памяти вкладки. */
onBeforeRouteLeave((_to, _from, next) => {
  if (!dirty.value) {
    next()
    return
  }
  pendingLeave = () => next()
  leaveOpen.value = true
  next(false)
})

function select(cell: SheetCell) {
  selected.value = cell
}

function beginEdit(cell: SheetCell) {
  selected.value = cell
  editing.value = { cell, value: cell.editable }
}

/**
 * Поле правки получает фокус сразу: `autofocus` на элементе, вставленном после
 * загрузки страницы, браузером не отрабатывается, и человеку пришлось бы кликать
 * дважды. Значение выделяется целиком — правят обычно всю сумму, а не символ.
 */
watch(editing, async (value) => {
  if (!value) return
  await nextTick()
  const element = Array.isArray(editInput.value) ? editInput.value[0] : editInput.value
  element?.focus()
  element?.select()
})

function commitEdit() {
  const current = editing.value
  if (!current || !active.value) return

  // Замена формулы числом — только с явным подтверждением: связь с остальной
  // книгой при этом пропадает, и человек должен об этом знать.
  if (current.cell.kind === 'formula' && current.value !== current.cell.editable) {
    formulaConfirm.value = { cell: current.cell, value: current.value }
    editing.value = null
    return
  }

  if (current.value !== current.cell.editable) {
    book.editCell(active.value.name, current.cell, current.value)
  }
  editing.value = null
}

function confirmFormulaReplace() {
  const pending = formulaConfirm.value
  formulaConfirm.value = null
  if (!pending || !active.value) return
  book.editCell(active.value.name, pending.cell, pending.value)
}

async function saveBook() {
  const result = await book.save()
  if (!result) return
  const href = URL.createObjectURL(result.blob)
  const link = document.createElement('a')
  link.href = href
  link.download = result.filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(href), 60_000)
}

async function discardEdits() {
  await book.discard()
}

function stay() {
  leaveOpen.value = false
  pendingLeave = null
}

async function saveAndLeave() {
  await saveBook()
  leaveNow()
}

function leaveNow() {
  leaveOpen.value = false
  const go = pendingLeave
  pendingLeave = null
  book.reset()
  go?.()
}

</script>

<template>
  <div class="ui-screen">
    <header class="ui-screen-head">
      <div>
        <div class="ui-kicker">Файл расчёта</div>
        <h1 class="ui-title">Книга {{ book.filename || '.xlsx' }}</h1>
      </div>
      <div class="ui-screen-actions">
        <RouterLink :to="backLink" class="ui-btn ui-btn-secondary ui-btn-sm">
          {{ HAS_REPORT_JSON ? 'Вернуться к результату расчёта' : 'Вернуться к расчёту' }}
        </RouterLink>
        <button type="button" class="ui-btn ui-btn-ghost ui-btn-sm" :disabled="!dirty" @click="discardEdits">
          Отменить правки
        </button>
        <button type="button" class="ui-btn ui-btn-primary ui-btn-sm" @click="saveBook">
          Сохранить книгу
        </button>
      </div>
    </header>
    <div class="ui-rule-accent"></div>

    <p class="ui-hint ui-measure">
      Это содержимое файла <code>.xlsx</code> — ровно то, что уйдёт в таблицу менеджеров.
      Здесь можно поправить значения перед переносом. Чтобы разобраться, откуда взялась
      сумма, вернитесь к результату расчёта.
    </p>

    <!-- Постоянная строка на всех листах: честно про пересчёт -->
    <p v-if="hasFormulas" class="ui-notice ui-notice-neutral ui-notice-tight">
      Браузер показывает книгу и позволяет поправить значения, но <strong>формулы
      не пересчитывает</strong>. Пересчёт сделает Excel, когда вы откроете сохранённый файл.
    </p>

    <p v-if="dirty" class="ui-notice ui-notice-warn ui-notice-tight">
      Правки живут только в скачанном файле. В сервис и в 1С они не попадают: сервис
      работает только на чтение. Сверяться с 1С нужно по экрану «Результат расчёта»:
      он показывает то, что посчитал сервис, и не меняется от ваших правок.
    </p>

    <section v-if="loading" class="ui-card">
      <h2 class="ui-section">Открываем книгу</h2>
      <div class="ui-progress"></div>
    </section>

    <section v-else-if="parseError" class="ui-card">
      <h2 class="ui-section">Файл не открылся</h2>
      <p class="ui-notice-text">
        Книгу не удалось разобрать в браузере. Сам файл при этом цел — его можно скачать
        и открыть в Excel.
      </p>
      <div class="ui-notice-actions">
        <button type="button" class="ui-btn ui-btn-primary ui-btn-sm" @click="calc.downloadAgain()">
          Скачать файл
        </button>
      </div>
    </section>

    <section v-else-if="!calc.file" class="ui-card">
      <EmptyState
        text="Файл этого расчёта не загружен в браузер. Такое бывает после перезагрузки страницы: книга живёт в памяти вкладки."
      >
        <RouterLink :to="{ name: 'preview', query: route.query }" class="ui-btn ui-btn-primary ui-btn-sm">
          Вернуться к составу расчёта
        </RouterLink>
      </EmptyState>
    </section>

    <template v-else-if="active">
      <!-- Строка формул — как в Excel -->
      <div class="ui-formula-bar">
        <span class="ui-formula-ref ui-num">{{ selected?.ref ?? '—' }}</span>
        <span v-if="selected?.kind === 'formula'" class="ui-formula-text">
          ={{ selected.formula }}
        </span>
        <span v-else class="ui-formula-text">{{ selected?.editable ?? '' }}</span>
        <span v-if="selected?.kind === 'formula'" class="ui-micro">
          Значение из файла: {{ selected.cachedResult }}
        </span>
      </div>

      <section class="ui-card ui-card-flush">
        <!-- Прокручивается сетка, а не страница (ТЗ 9). В запас входит и то, что
             стоит под сеткой: вкладки листов и подпись о правке. -->
        <div class="ui-table-wrap" style="max-block-size: calc(100vh - 400px)">
          <table class="ui-table ui-table-dense ui-grid">
            <thead>
              <tr>
                <th class="ui-col-key ui-grid-corner"></th>
                <th
                  v-for="c in active.columnCount"
                  :key="c"
                  class="ui-grid-head"
                  :style="{ minWidth: `${Math.max(active.widths[c - 1] ?? 14, 8) * 7}px` }"
                >
                  {{ columnLetter(c) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, r) in active.rows" :key="r">
                <th class="ui-col-key ui-grid-index" scope="row">{{ r + 1 }}</th>
                <td
                  v-for="cell in row"
                  :key="cell.ref"
                  class="ui-grid-cell"
                  :class="{ 'ui-num': cell.numeric }"
                  :data-kind="cell.kind"
                  :data-edited="cell.edited ? 'true' : undefined"
                  :aria-selected="selected?.ref === cell.ref"
                  @click="select(cell)"
                  @dblclick="beginEdit(cell)"
                >
                  <input
                    v-if="editing?.cell.ref === cell.ref"
                    ref="editInput"
                    v-model="editing.value"
                    class="ui-grid-input"
                    type="text"
                    @keydown.enter.prevent="commitEdit"
                    @keydown.esc.prevent="editing = null"
                    @blur="commitEdit"
                  />
                  <template v-else>
                    <span>{{ cell.display }}</span>
                    <span
                      v-if="cell.kind === 'formula'"
                      class="ui-cell-flag"
                      :title="dirty
                        ? 'Значение в этой ячейке взято из файла и могло устареть после ваших правок. Excel пересчитает его при открытии.'
                        : 'В ячейке формула. Её пересчитывает Excel, а не браузер.'"
                    >
                      {{ dirty ? '≈' : 'ƒ' }}
                    </span>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Вкладки листов — внизу, как в Excel, с названиями из самой книги -->
      <nav class="ui-sheet-tabs" role="tablist">
        <button
          v-for="sheet in sheets"
          :key="sheet.name"
          type="button"
          class="ui-sheet-tab"
          role="tab"
          :aria-selected="sheet.name === active.name"
          :disabled="sheet.broken"
          @click="activeName = sheet.name"
        >
          {{ sheet.name }}
          <span v-if="sheet.broken" class="ui-badge ui-badge-warn">Лист не прочитан</span>
        </button>
      </nav>

      <p class="ui-micro">
        Двойной клик по ячейке — правка. Оформление, ширины колонок и объединения
        сохраняются как есть. Книга сохраняется с признаком полного пересчёта при открытии.
      </p>
    </template>

    <UiDialog
      :open="formulaConfirm !== null"
      title="Заменить формулу числом"
      @close="formulaConfirm = null"
    >
      <p class="ui-notice-text">
        В ячейке <code>{{ formulaConfirm?.cell.ref }}</code> стоит формула
        <code>={{ formulaConfirm?.cell.formula }}</code>. Если заменить её числом, связь
        с остальной книгой пропадёт: Excel больше не будет пересчитывать эту ячейку
        при изменении соседних.
      </p>
      <template #actions>
        <button type="button" class="ui-btn ui-btn-danger" @click="confirmFormulaReplace">
          Заменить формулу числом
        </button>
        <button type="button" class="ui-btn ui-btn-secondary" @click="formulaConfirm = null">
          Отмена
        </button>
      </template>
    </UiDialog>

    <UiDialog :open="leaveOpen" title="Правки не сохранены" @close="stay">
      <p class="ui-notice-text">
        В книге есть изменения, которые вы не сохранили. Если уйти, они пропадут —
        книга живёт в памяти вкладки.
      </p>
      <template #actions>
        <button type="button" class="ui-btn ui-btn-primary" @click="stay">Остаться</button>
        <button type="button" class="ui-btn ui-btn-secondary" @click="saveAndLeave">
          Сохранить книгу
        </button>
        <button type="button" class="ui-btn ui-btn-danger" @click="leaveNow">
          Уйти без сохранения
        </button>
      </template>
    </UiDialog>
  </div>
</template>
