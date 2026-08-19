/**
 * Маршрутизация (UX-карта 1).
 *
 * Устройство подчинено ТЗ 10.3: все рабочие экраны — **дети одного корневого
 * маршрута** с каркасом `AppShell` и признаком `requiresAuth`. `/login` объявлен
 * вне каркаса и сейчас отдаёт редирект. Появление авторизации = замена стаба
 * сессии и монтирование компонента на `/login`; ни один экран не переписывается.
 *
 * Период живёт в адресе (`?period=2026-06`) — ссылку на любой экран можно
 * переслать коллеге.
 */
import { createRouter, createWebHistory } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import { useSessionStore } from '@/stores/session'
import { HAS_HISTORY, HAS_OVERRIDES, HAS_REPORT_JSON } from '@/config/features'
import { periodLabel } from '@/lib/period'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      // Экран входа зарезервирован, но не смонтирован (ТЗ 10.3).
      redirect: { name: 'preview' },
    },
    {
      path: '/',
      component: AppShell,
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: { name: 'preview' } },
        {
          path: 'preview',
          name: 'preview',
          component: () => import('@/views/PreviewView.vue'),
          meta: { title: 'Состав расчёта' },
        },
        {
          path: 'calc',
          name: 'calc',
          component: () => import('@/views/CalcView.vue'),
          meta: { title: 'Расчёт' },
        },
        {
          path: 'result',
          component: () => import('@/views/ResultView.vue'),
          meta: { title: 'Результат расчёта', enabled: HAS_REPORT_JSON },
          children: [
            { path: '', redirect: { name: 'result-summary' } },
            {
              path: 'summary',
              name: 'result-summary',
              component: () => import('@/views/result/ResultSummary.vue'),
              meta: { title: 'Свод по заказам' },
            },
            {
              path: 'allocation',
              name: 'result-allocation',
              component: () => import('@/views/result/ResultAllocation.vue'),
              meta: { title: 'Распределение 26 сч' },
            },
            {
              path: 'details',
              name: 'result-details',
              component: () => import('@/views/result/ResultDetails.vue'),
              meta: { title: 'Расшифровка' },
            },
            {
              path: 'overrides',
              name: 'result-overrides',
              component: () => import('@/views/result/ResultOverrides.vue'),
              meta: { title: 'Переопределение участия', enabled: HAS_OVERRIDES },
            },
          ],
        },
        {
          path: 'mismatch',
          name: 'mismatch',
          component: () => import('@/views/MismatchView.vue'),
          meta: { title: 'Расчёт не сошёлся' },
        },
        {
          path: 'workbook',
          name: 'workbook',
          component: () => import('@/views/WorkbookView.vue'),
          meta: { title: 'Книга .xlsx' },
        },
        {
          path: 'history',
          name: 'history',
          component: () => import('@/views/HistoryView.vue'),
          meta: { title: 'История расчётов', enabled: HAS_HISTORY },
        },
        {
          path: ':pathMatch(.*)*',
          name: 'not-found',
          component: () => import('@/views/NotFoundView.vue'),
          meta: { title: 'Страница не найдена' },
        },
      ],
    },
  ],
})

/**
 * Единственная глобальная проверка. Сегодня стаб всегда отвечает «да» —
 * при появлении авторизации меняется только он (ТЗ 10.3).
 */
router.beforeEach((to) => {
  const session = useSessionStore()
  if (to.meta.requiresAuth && !session.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // Экран, ручки для которого ещё нет, не показывается заглушкой — его просто нет.
  const disabled = to.matched.some((record) => record.meta.enabled === false)
  if (disabled) return { name: 'preview', query: to.query }

  return true
})

/**
 * Заголовок вкладки браузера меняется вместе с экраном: по нему человек находит
 * нужную вкладку среди десятка открытых (UX-карта 1.3).
 */
router.afterEach((to) => {
  const screen = [...to.matched].reverse().find((record) => record.meta.title)?.meta.title
  const period = typeof to.query.period === 'string' ? periodLabel(to.query.period) : ''
  document.title = [period, screen, 'Факт'].filter(Boolean).join(' · ')
})

export default router
