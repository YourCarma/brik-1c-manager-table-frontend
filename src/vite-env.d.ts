/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Базовый адрес сервиса. Пусто — тот же origin (dev-прокси / раздача со стенда). */
  readonly VITE_API_BASE_URL?: string
  /** Включить мок-слой для ещё не реализованных ручек бэкенда (ТЗ 5.2). */
  readonly VITE_USE_MOCKS?: string
  /** Таймаут расчёта в минутах. По ТЗ 7.1.1 — не меньше 15. */
  readonly VITE_REPORT_TIMEOUT_MINUTES?: string
  /** Цель dev-прокси, используется только vite.config.ts. */
  readonly VITE_DEV_API_PROXY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
