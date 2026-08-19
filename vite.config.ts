import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  // Адрес сервиса берётся из переменной окружения (ТЗ 10.2), в код не зашивается.
  // В dev удобно ходить через прокси, чтобы не зависеть от настроек CORS стенда:
  // VITE_API_BASE_URL='' + VITE_DEV_API_PROXY='http://localhost:8000'
  const devProxyTarget = env.VITE_DEV_API_PROXY

  return {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: devProxyTarget
        ? {
            '/api': { target: devProxyTarget, changeOrigin: true },
            '/health': { target: devProxyTarget, changeOrigin: true },
          }
        : undefined,
      // Расчёт идёт до 15 минут (ТЗ 7.1) — dev-прокси не должен обрывать соединение
      // раньше сервера.
      proxyTimeout: 20 * 60 * 1000,
      timeout: 20 * 60 * 1000,
    },
    build: {
      // Внутренняя сеть заказчика, интернета может не быть (ТЗ 10.1):
      // всё поставляется вместе со сборкой, внешних CDN нет.
      // exceljs тяжёлый и нужен только на экране книги — он подключается
      // динамическим импортом и попадает в отдельный кусок сборки сам.
      assetsInlineLimit: 4096,
      chunkSizeWarningLimit: 1200,
    },
  }
})
