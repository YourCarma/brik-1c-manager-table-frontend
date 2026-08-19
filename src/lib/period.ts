/**
 * Период расчёта.
 *
 * ТЗ 5.3.3: пользователь вводит период в свободной человеческой записи
 * (`2026-06`, `06.2026`, `6/2026`, `июнь 2026`, `июня 2026`, `June 2026`).
 * **Разбор периода — обязанность бэкенда.** Фронтенд не дублирует правила
 * регулярными выражениями: он отправляет введённое как есть и показывает
 * сообщение сервера при отказе.
 *
 * Здесь живёт только то, что фронту действительно нужно:
 *  - подпись канонического периода (`2026-06` → «июнь 2026») для показа;
 *  - сборка `YYYY-MM` из вспомогательного выбора месяца и года;
 *  - определение месяца по умолчанию при первом входе.
 *
 * Ничего из этого не является проверкой пользовательского ввода.
 */

export const MONTHS_NOMINATIVE = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
] as const

/** Канонический период, каким его возвращает бэкенд: `2026-06`. */
export type CanonicalPeriod = string

/** `2026-06` → «июнь 2026». Если формат неожиданный — отдаём как пришло. */
export function periodLabel(period: CanonicalPeriod | null | undefined): string {
  if (!period) return ''
  const m = /^(\d{4})-(\d{2})$/.exec(period.trim())
  if (!m) return period
  const monthIndex = Number(m[2]) - 1
  const month = MONTHS_NOMINATIVE[monthIndex]
  return month ? `${month} ${m[1]}` : period
}

/** Сборка значения из вспомогательного выбора месяца/года: (2026, 6) → `2026-06`. */
export function buildPeriod(year: number, month: number): CanonicalPeriod {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** Разбор канонического ответа сервера для подсветки выбранного месяца в помощнике. */
export function splitCanonical(period: CanonicalPeriod | null | undefined): {
  year: number
  month: number
} | null {
  if (!period) return null
  const m = /^(\d{4})-(\d{2})$/.exec(period.trim())
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]) }
}

/**
 * Период по умолчанию — предыдущий календарный месяц: закрывают всегда прошедший.
 * Это подсказка, а не подстановка за пользователя: поле остаётся редактируемым.
 */
export function previousMonth(now: Date = new Date()): CanonicalPeriod {
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const month = now.getMonth() === 0 ? 12 : now.getMonth()
  return buildPeriod(year, month)
}

/** Год «сейчас» — для границ вспомогательного выбора. */
export function currentYear(now: Date = new Date()): number {
  return now.getFullYear()
}
