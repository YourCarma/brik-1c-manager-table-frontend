/**
 * Шлюз тяжёлых запросов.
 *
 * ТЗ 7.1.4: параллельно к сервису идёт **не более одного тяжёлого запроса** —
 * 1С работает в один поток соединений. Интерфейс не должен фоново опрашивать
 * `/orders` во время идущего расчёта.
 *
 * Шлюз не ставит запросы в очередь намеренно: очередь означала бы, что второй
 * тяжёлый запрос всё равно уйдёт в 1С, просто позже. Вместо этого он честно
 * отказывает и сообщает, что именно сейчас выполняется, — вызывающий экран
 * показывает это пользователю.
 */
import { ref } from 'vue'

export type HeavyKind = 'orders' | 'report'

interface HeavyState {
  kind: HeavyKind
  /** Что показывать пользователю: «Расчёт за июнь 2026». */
  label: string
  startedAt: number
}

const current = ref<HeavyState | null>(null)

export class HeavyBusyError extends Error {
  readonly busyWith: HeavyState
  constructor(busyWith: HeavyState) {
    super(`Сервис уже занят: ${busyWith.label}`)
    this.name = 'HeavyBusyError'
    this.busyWith = busyWith
  }
}

export function isBusy(): boolean {
  return current.value !== null
}

/**
 * Выполнить тяжёлую операцию, заняв шлюз на её время.
 * Если шлюз занят — бросает `HeavyBusyError`, не отправляя запрос.
 */
export async function runHeavy<T>(
  kind: HeavyKind,
  label: string,
  task: () => Promise<T>,
): Promise<T> {
  if (current.value) throw new HeavyBusyError(current.value)
  current.value = { kind, label, startedAt: Date.now() }
  try {
    return await task()
  } finally {
    current.value = null
  }
}
