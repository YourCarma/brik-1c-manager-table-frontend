<script setup lang="ts">
/**
 * Раскрываемый блок «Подробности».
 *
 * ТЗ 8, п.1: технические детали не попадают в основной текст — ни кодов ошибок,
 * ни стектрейсов. Они живут здесь, для сопровождения.
 */
withDefaults(defineProps<{ summary?: string }>(), { summary: 'Подробности' })
</script>

<template>
  <details class="ui-details">
    <summary>{{ summary }}</summary>
    <div class="ui-details-body">
      <slot />
    </div>
  </details>
</template>
