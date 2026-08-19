<script setup lang="ts">
/**
 * Подсказка к бухгалтерскому термину (UX-карта 5.11).
 *
 * Раскрывается по клику, а не только по наведению: экономист читает подсказку,
 * а не проглядывает. Формулировки — дословно из глоссария ТЗ 3.
 */
import { ref } from 'vue'

defineProps<{ text: string }>()

const open = ref(false)
</script>

<template>
  <span class="ui-hint-host">
    <slot />
    <button
      type="button"
      class="ui-hint-mark"
      :aria-expanded="open"
      :title="text"
      @click.stop="open = !open"
    >
      ?
    </button>
    <span v-if="open" class="ui-hint-bubble" role="tooltip" @click.stop>{{ text }}</span>
  </span>
</template>
