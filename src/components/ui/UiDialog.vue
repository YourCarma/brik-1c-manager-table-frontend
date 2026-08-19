<script setup lang="ts">
/**
 * Модальный диалог. Используется для подтверждения запуска расчёта и для
 * перехвата ухода со страницы во время расчёта (UX-карта 5.4, 5.6).
 */
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()

const dialog = ref<HTMLDialogElement | null>(null)

watch(
  () => props.open,
  (open) => {
    const element = dialog.value
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  },
  { flush: 'post' },
)

onBeforeUnmount(() => dialog.value?.close())
</script>

<template>
  <dialog ref="dialog" class="ui-dialog" @cancel.prevent="emit('close')" @close="emit('close')">
    <h2 class="ui-dialog-title">{{ title }}</h2>
    <div class="ui-dialog-body">
      <slot />
    </div>
    <div class="ui-dialog-actions">
      <slot name="actions" />
    </div>
  </dialog>
</template>
