<script setup lang="ts">
/**
 * Переключатель темы в шапке.
 *
 * Один кнопочный обход трёх состояний вместо выпадающего списка: состояний
 * три, они равнозначны, и текущее всегда названо словами в `title`
 * и в `aria-label` — знак сам по себе ничего не сообщает.
 */
import { useTheme, THEME_LABEL } from '@/composables/useTheme'

const { mode, cycle } = useTheme()
</script>

<template>
  <button
    type="button"
    class="ui-theme-toggle"
    :title="`${THEME_LABEL[mode]}. Нажмите, чтобы сменить`"
    :aria-label="THEME_LABEL[mode]"
    @click="cycle"
  >
    <!-- система: половина заливки -->
    <svg v-if="mode === 'system'" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M8 2a6 6 0 0 0 0 12z" fill="currentColor" />
    </svg>

    <!-- светлая: солнце -->
    <svg v-else-if="mode === 'light'" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="3.2" fill="currentColor" />
      <g stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <path d="M8 1v1.8M8 13.2V15M1 8h1.8M13.2 8H15M3.1 3.1l1.3 1.3M11.6 11.6l1.3 1.3M12.9 3.1l-1.3 1.3M4.4 11.6l-1.3 1.3" />
      </g>
    </svg>

    <!-- тёмная: месяц -->
    <svg v-else viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z"
        fill="currentColor"
      />
    </svg>
  </button>
</template>
