<script setup lang="ts">
/** Страница не найдена. Тупиковых состояний не бывает — отсюда всегда есть выход. */
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="ui-screen">
    <header class="ui-screen-head">
      <div>
        <div class="ui-kicker">Навигация</div>
        <h1 class="ui-title">Страница не найдена</h1>
      </div>
    </header>
    <div class="ui-rule-accent"></div>

    <section class="ui-card">
      <p class="ui-notice-text">Такой страницы нет.</p>
      <div class="ui-notice-actions">
        <RouterLink :to="{ name: 'preview', query: route.query }" class="ui-btn ui-btn-primary ui-btn-sm">
          Вернуться к составу расчёта
        </RouterLink>
      </div>
    </section>
  </div>
</template>
