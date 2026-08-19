/**
 * Флаги готовности сценариев.
 *
 * UX-карта, раздел 8: заглушки нереализованных экранов не показываются —
 * обещать неработающее хуже, чем не обещать. Пункт меню либо есть и работает,
 * либо его нет.
 *
 * В мок-режиме (разработка и демонстрация по ТЗ 5.2) экраны доступны:
 * ручек ещё нет, но поведение проектируется и проверяется на моках.
 * При сборке против реального бэкенда пункт появится ровно тогда, когда
 * в `PENDING_ENDPOINTS` снимут соответствующий флаг.
 */
import { PENDING_ENDPOINTS, USE_MOCKS } from '@/api/service'

/** Экран результата в JSON (С3). */
export const HAS_REPORT_JSON = USE_MOCKS || !PENDING_ENDPOINTS.reportJson

/** Ручное переопределение участия в распределении 26 счёта (С5). */
export const HAS_OVERRIDES = USE_MOCKS || !PENDING_ENDPOINTS.overrides

/** История расчётов (С6). */
export const HAS_HISTORY = USE_MOCKS || !PENDING_ENDPOINTS.history

/** Фоновый режим расчёта (ТЗ 12.1). Пока нет — уход со страницы прерывает расчёт. */
export const HAS_BACKGROUND_MODE = !PENDING_ENDPOINTS.background
