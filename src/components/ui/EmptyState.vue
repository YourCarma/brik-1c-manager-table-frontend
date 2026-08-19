<script setup lang="ts">
/**
 * Пустое состояние.
 *
 * ТЗ 8, п.3: пустое — не ошибка. «За июнь 2026 в 1С нет ни одной группы
 * с оборотом» — это факт о данных, и тон у него спокойный.
 */
defineProps<{ text: string }>()
</script>

<template>
  <div class="ui-table-empty">
    <p class="ui-notice-text">{{ text }}</p>
    <div class="ui-notice-actions">
      <slot />
    </div>
  </div>
</template>
