/**
 * Контракт с бэкендом (ТЗ 5).
 *
 * Все денежные величины — строки (ТЗ 5.3.1). Ни одно поле суммы здесь не имеет
 * тип `number`, и это намеренно.
 */
import type { MoneyString } from '@/lib/money'

/* ------------------------------------------------------------------ */
/* GET /api/v1/table-creator/orders?date=<период>  — реализовано       */
/* ------------------------------------------------------------------ */

export interface OrderRow {
  /** GUID номенклатурной группы. В интерфейсе не показывается (ТЗ 5.3.4). */
  order_key: string
  /** Наименование номенклатурной группы из 1С. */
  order_name: string
  /** Номер заказа — ключ связи с таблицей менеджеров, `П3747`. */
  order_code: string
  /** Оборот Дт по счетам расчёта (20.01 и 28). */
  turnover: MoneyString
  /** Остаток НЗП на конец периода. */
  wip_balance: MoneyString
  /** Справочный признак «в работе». НЕ равен участию в распределении 26 сч (ТЗ 3). */
  in_progress: boolean
  /** Попадёт ли заказ в расчёт. */
  in_report: boolean
}

export interface OrdersResponse {
  period: string
  orders: OrderRow[]
  /** Действующий фильтр состава; `null` — берутся все заказы с оборотом. */
  orders_filter: string | null
  /** Оборот без номенклатурной группы — не попадёт ни в один заказ. */
  turnover_without_order: MoneyString
  total: number
  in_report_count: number
  in_progress_count: number
  total_turnover: MoneyString
  /** GUID групп, у которых не удалось определить номер заказа. */
  unmatched: UnmatchedGroup[]
}

/**
 * Несопоставленная группа. Бэкенд отдаёт либо голый GUID строкой, либо объект —
 * поддерживаем оба варианта, приводя к объекту в клиенте.
 */
export interface UnmatchedGroup {
  order_key: string
  order_name?: string
  turnover?: MoneyString
}

/* ------------------------------------------------------------------ */
/* GET /report?date=<период> — JSON-отчёт (ТЗ 5.2, пока на моках)      */
/* ------------------------------------------------------------------ */

export interface ReportOrder {
  order_code: string
  order_name: string
  /**
   * Суммы по целевым колонкам. Состав ключей **не фиксирован**: появятся 44 счёт,
   * «БГ» и другие (ТЗ 5.2). Таблицы строятся по фактическим ключам, а не по
   * захардкоженному списку (критерий приёмки 11.9).
   */
  by_column: Record<string, MoneyString>
  /** Расшифровка по статьям затрат. */
  by_article: Record<string, MoneyString>
  /** Прямая ЗП производственных рабочих без взносов — база распределения 26 сч. */
  direct_wage: MoneyString
  /** Доля общехозяйственных расходов, пришедшаяся на заказ (колонка CF). */
  overhead_26: MoneyString
  wip_balance: MoneyString
  in_progress: boolean
  /** CC + CD + CE. Обязана совпадать с оборотом Дт 20.01. */
  cost_1c: MoneyString
  /** Потери от брака (28 сч). В себестоимость по данным 1С не входят. */
  defects: MoneyString
  /** CC + CD + CE + Брак + CF. */
  full_cost: MoneyString

  /* Поля распределения 26 счёта — появляются вместе с JSON-отчётом. */
  /** Участвует ли заказ в распределении 26 счёта. */
  in_allocation?: boolean
  /** Доля в распределении, проценты. Считает бэкенд. */
  allocation_share?: MoneyString
  /** Участие переопределено пользователем вручную (С5). */
  allocation_overridden?: boolean
}

export interface ReconciliationCheck {
  /** Название проверки, как его формулирует бэкенд. */
  name: string
  expected: MoneyString
  actual: MoneyString
  /** Расхождение. Если бэкенд не прислал — считается в клиенте только для показа. */
  difference?: MoneyString
  passed: boolean
}

export interface ReportResponse {
  period: string
  orders: ReportOrder[]
  /** Общая сумма 26 счёта за период. */
  overhead_26_total: MoneyString
  /** Расшифровка 26 счёта по статьям. */
  articles_26: Record<string, MoneyString>
  /** База распределения — прямая ЗП производственных рабочих без взносов. */
  allocation_base: MoneyString
  unmapped_orders: string[]
  total_cost_1c: MoneyString
  total_defects: MoneyString
  total_full_cost: MoneyString

  /** Итоги по целевым колонкам, если бэкенд их отдаёт. */
  totals_by_column?: Record<string, MoneyString>
  /** Построчная расшифровка (заказ × статья × счёт). */
  breakdown?: BreakdownRow[]
  /** Результаты сверок. */
  checks?: ReconciliationCheck[]
  /** Признак «из кэша» и время исходного расчёта (ТЗ 5.2, С6). */
  from_cache?: boolean
  calculated_at?: string
  /** К расчёту применялось ручное переопределение участия (С5). */
  overrides_applied?: boolean
}

export interface BreakdownRow {
  order_code: string
  /** Статья затрат. */
  article: string
  /** Счёт учёта: `20.01`, `25`, `26`, `28`. */
  account: string
  amount: MoneyString
  /** Целевая колонка: `CC`, `CD`, `CE`, `CF`, `28сч`… */
  column: string
}

/* ------------------------------------------------------------------ */
/* POST /report — расчёт                                               */
/* ------------------------------------------------------------------ */

/** Тело запроса при ручном переопределении участия в распределении (С5). */
export interface ReportOverrides {
  /** Заказы, у которых участие в распределении 26 сч задано вручную. */
  allocation_overrides: Record<string, boolean>
}

export interface DownloadedFile {
  blob: Blob
  /** Имя из заголовка `Content-Disposition` (ТЗ 5.1, С2.3). */
  filename: string
}

/* ------------------------------------------------------------------ */
/* Фоновый режим (ТЗ 5.2) — интерфейс готов, ручки ещё нет            */
/* ------------------------------------------------------------------ */

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed'

export interface TaskState {
  task_id: string
  status: TaskStatus
  progress?: number
  result?: unknown
}

/* ------------------------------------------------------------------ */
/* История расчётов (С6)                                               */
/* ------------------------------------------------------------------ */

export type RunOutcome = 'success' | 'reconciliation_failed' | 'error'

export interface HistoryEntry {
  id: string
  period: string
  /** Момент расчёта, ISO. */
  calculated_at: string
  outcome: RunOutcome
  /** Длительность расчёта, секунды. */
  duration_seconds: number
  /** Отдан ли результат из кэша закрытых периодов. */
  from_cache: boolean
  /** Имя файла для повторного скачивания, если он сохранён на бэкенде. */
  filename?: string
  /** Короткое пояснение для неуспешных расчётов. */
  note?: string
}

/* ------------------------------------------------------------------ */
/* Служебное                                                           */
/* ------------------------------------------------------------------ */

export interface HealthResponse {
  status: string
}
