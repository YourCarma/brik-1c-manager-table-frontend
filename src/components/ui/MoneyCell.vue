<script setup lang="ts">
/**
 * Денежная ячейка таблицы.
 *
 * ТЗ 5.3.1: сумма приходит строкой и через `parseFloat` не прогоняется —
 * форматирование работает со строкой.
 * ТЗ 5.3.2: ноль показывается как `0,00`. Пустая ячейка означает «нет данных»
 * и остаётся пустой — визуальный слой рисует ей штриховку токеном
 * `--color-ui-wash`, а пояснение живёт в подсказке, чтобы её нельзя было
 * прочитать как ноль.
 */
import { computed } from 'vue'
import { formatMoney, isMoney } from '@/lib/money'
import type { MaybeMoney } from '@/lib/money'

const props = withDefaults(
  defineProps<{
    value: MaybeMoney
    /** Итоговая сумма — выделяется начертанием. */
    strong?: boolean
    /** Граница между блоками колонок. */
    split?: boolean
  }>(),
  { strong: false, split: false },
)

const present = computed(() => isMoney(props.value))
const text = computed(() => formatMoney(props.value))
</script>

<template>
  <td
    class="ui-num"
    :class="{ 'ui-num-strong': strong, 'ui-col-split': split }"
    :title="present ? undefined : 'Значение не пришло от сервиса'"
  >{{ text }}</td>
</template>
