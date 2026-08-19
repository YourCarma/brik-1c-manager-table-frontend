<script setup lang="ts">
/**
 * Копирование текста для сопровождения (ТЗ 8, п.2: каждая ошибка сопровождается
 * действием, одно из которых — «скопировать текст для сопровождения»).
 */
import { ref } from 'vue'

const props = withDefaults(
  defineProps<{
    text: string | (() => string)
    label?: string
    small?: boolean
    /**
     * Вид кнопки. Призрачная — для второстепенного действия в плотной панели;
     * вторичная — когда действие равнозначно соседним (шаги «Что делать» на
     * экране несходимости: разный вес кнопок читался бы как разная важность).
     */
    variant?: 'ghost' | 'secondary'
  }>(),
  { label: 'Скопировать текст для сопровождения', small: true, variant: 'ghost' },
)

const copied = ref(false)

async function copy() {
  const value = typeof props.text === 'function' ? props.text() : props.text
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    // Буфер недоступен (нет разрешения) — показываем текст, чтобы его можно было
    // выделить вручную. Тупиковых состояний не бывает.
    window.prompt('Скопируйте текст вручную:', value)
    return
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <button
    type="button"
    class="ui-btn"
    :class="[`ui-btn-${variant}`, { 'ui-btn-sm': small }]"
    @click="copy"
  >
    {{ copied ? 'Скопировано' : label }}
  </button>
</template>
