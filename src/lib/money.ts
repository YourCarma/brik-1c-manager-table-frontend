/**
 * Работа с денежными суммами.
 *
 * ТЗ 5.3.1: все суммы приходят с бэкенда **строками** (`"11124347.86"`). Это не ошибка
 * сериализации, а требование точности — суммы сверяются с бухгалтерией до копейки.
 * Прогонять их через `parseFloat`/`Number` запрещено: ни для отображения, ни для
 * сортировки, ни для сравнения. Двоичная погрешность здесь — дефект, а не мелочь.
 *
 * Поэтому весь модуль работает со строками и `Decimal`, и наружу отдаёт строки.
 */
import Decimal from 'decimal.js'

// Запас разрядности с большим отрывом от реальных сумм (миллиарды с копейками).
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -40, toExpPos: 40 })

/** Неразрывный пробел — разделитель разрядов по ТЗ 5.3.2. */
export const NBSP = ' '

/** Денежная сумма в том виде, в каком её отдаёт бэкенд. */
export type MoneyString = string

/** Значение, которое можно трактовать как сумму. `null`/`undefined` — «нет данных». */
export type MaybeMoney = MoneyString | null | undefined

/**
 * Разбор строки суммы в Decimal. Возвращает `null`, если значение непригодно —
 * молча подставлять ноль нельзя: «нет данных» и «ноль» это разные вещи (ТЗ 5.3.2).
 */
export function toDecimal(value: MaybeMoney): Decimal | null {
  if (value === null || value === undefined) return null
  const raw = String(value).trim()
  if (raw === '') return null
  // Терпимость к записи с запятой и пробелами — на случай, если такое значение
  // придёт из xlsx или из буфера обмена. Данные API приходят с точкой.
  const normalized = raw.replace(/[\s ]/g, '').replace(',', '.')
  try {
    const d = new Decimal(normalized)
    return d.isFinite() ? d : null
  } catch {
    return null
  }
}

/** Есть ли пригодное к показу значение. */
export function isMoney(value: MaybeMoney): boolean {
  return toDecimal(value) !== null
}

/**
 * Форматирование для показа: `15 124 465,77`.
 * Разделитель разрядов — неразрывный пробел, десятичный — запятая, всегда две цифры
 * после запятой. Ноль показывается как `0,00`, а не пустой ячейкой (ТЗ 5.3.2).
 *
 * Если значения нет — возвращается `fallback` (по умолчанию пусто), потому что
 * пустая ячейка читается пользователем как «нет данных».
 */
export function formatMoney(value: MaybeMoney, fallback = ''): string {
  const d = toDecimal(value)
  if (d === null) return fallback
  return formatDecimal(d, 2)
}

/** То же, но для произвольного количества знаков (доли распределения — 2 знака). */
export function formatDecimal(value: Decimal, decimals: number): string {
  const negative = value.isNegative()
  const fixed = value.abs().toFixed(decimals, Decimal.ROUND_HALF_UP)
  const [intPart, fracPart = ''] = fixed.split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
  const body = decimals > 0 ? `${grouped},${fracPart}` : grouped
  return negative ? `−${body}` : body
}

/**
 * Форматирование доли распределения: `21,45 %`.
 * Значение приходит с бэкенда посчитанным, клиент проценты не пересчитывает (ТЗ 4.2.3).
 */
export function formatPercent(value: MaybeMoney, fallback = ''): string {
  const d = toDecimal(value)
  if (d === null) return fallback
  return `${formatDecimal(d, 2)}${NBSP}%`
}

/**
 * Сравнение сумм для сортировки. Decimal-совместимое, без приведения к number (ТЗ 5.3.1).
 * Значения без данных всегда уходят в конец, независимо от направления сортировки —
 * это решает вызывающий код через `nullsLast`.
 */
export function compareMoney(a: MaybeMoney, b: MaybeMoney): number {
  const da = toDecimal(a)
  const db = toDecimal(b)
  if (da === null && db === null) return 0
  if (da === null) return -1
  if (db === null) return 1
  return da.comparedTo(db)
}

/** Строго ноль (а не «нет данных»). */
export function isZero(value: MaybeMoney): boolean {
  const d = toDecimal(value)
  return d !== null && d.isZero()
}

/** Значение есть и оно отлично от нуля — признак, требующий внимания пользователя. */
export function isNonZero(value: MaybeMoney): boolean {
  const d = toDecimal(value)
  return d !== null && !d.isZero()
}

export function isNegative(value: MaybeMoney): boolean {
  const d = toDecimal(value)
  return d !== null && d.isNegative()
}

/**
 * Сумма набора значений в виде строки.
 *
 * ВНИМАНИЕ. Итоги отчёта и любые методологические суммы берутся **с бэкенда**
 * (ТЗ 4.2.3): фронтенд не складывает CC+CD+CE и не считает итоги таблиц сам.
 * Эта функция допустима только там, где серверного итога не существует по природе
 * данных — например, подытог отфильтрованной пользователем расшифровки или
 * контрольная сумма листа в просмотрщике книги.
 */
export function sumMoney(values: MaybeMoney[]): MoneyString {
  return values
    .reduce<Decimal>((acc, v) => {
      const d = toDecimal(v)
      return d === null ? acc : acc.plus(d)
    }, new Decimal(0))
    .toFixed(2)
}

/** Разность двух сумм строкой — для показа расхождения в сверках (ТЗ 6, С4). */
export function diffMoney(a: MaybeMoney, b: MaybeMoney): MoneyString | null {
  const da = toDecimal(a)
  const db = toDecimal(b)
  if (da === null || db === null) return null
  return da.minus(db).toFixed(2)
}

