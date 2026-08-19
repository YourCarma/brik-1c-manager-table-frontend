/**
 * Сортировка таблиц.
 *
 * ТЗ 5.3.1: сравнение денежных сумм — **decimal-совместимое**, без `parseFloat`.
 * Поэтому колонка объявляет свой тип (`money` / `text` / `flag`), и сравнение
 * подбирается по типу, а не по виду значения.
 */
import { computed, ref } from 'vue'
import { compareMoney } from '@/lib/money'
import type { MaybeMoney } from '@/lib/money'

export type SortKind = 'money' | 'text' | 'flag'
export type SortDirection = 'asc' | 'desc'

export interface SortableColumn<T> {
  key: string
  kind: SortKind
  value: (row: T) => MaybeMoney | string | boolean
}

export function useTableSort<T>(
  rows: () => T[],
  columns: Array<SortableColumn<T>>,
  initial?: { key: string; direction: SortDirection },
) {
  const sortKey = ref<string | null>(initial?.key ?? null)
  const direction = ref<SortDirection>(initial?.direction ?? 'desc')

  const byKey = new Map(columns.map((c) => [c.key, c]))

  function toggle(key: string) {
    if (sortKey.value === key) {
      direction.value = direction.value === 'asc' ? 'desc' : 'asc'
      return
    }
    sortKey.value = key
    // Денежные колонки читаются сверху вниз от большего — как их отдаёт бэкенд.
    direction.value = byKey.get(key)?.kind === 'money' ? 'desc' : 'asc'
  }

  /** Значение для `aria-sort` — им же дизайн-система включает стрелку в шапке. */
  function ariaSort(key: string): 'ascending' | 'descending' | 'none' {
    if (sortKey.value !== key) return 'none'
    return direction.value === 'asc' ? 'ascending' : 'descending'
  }

  const sorted = computed(() => {
    const source = rows()
    const column = sortKey.value ? byKey.get(sortKey.value) : undefined
    if (!column) return source

    const factor = direction.value === 'asc' ? 1 : -1
    return [...source].sort((a, b) => {
      const va = column.value(a)
      const vb = column.value(b)

      if (column.kind === 'money') return compareMoney(va as MaybeMoney, vb as MaybeMoney) * factor
      if (column.kind === 'flag') return (Number(va) - Number(vb)) * factor
      return String(va ?? '').localeCompare(String(vb ?? ''), 'ru') * factor
    })
  })

  return { sortKey, direction, sorted, toggle, ariaSort }
}
