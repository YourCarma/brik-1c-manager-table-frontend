/**
 * Подключение `exceljs`.
 *
 * Библиотека поставляется в формате CommonJS, и сборщик Vite заворачивает её
 * экспорт в `default`, а Node при `await import()` — не всегда. Разница вылезает
 * только за пределами браузера (скрипт проверки приёмки), но ломает обращение
 * к `Workbook`. Поэтому загрузка вынесена в одно место.
 *
 * Библиотека подключается динамически: она тяжёлая и нужна только на экране
 * книги. Всё поставляется вместе со сборкой, внешних CDN нет (ТЗ 10.1).
 */
type ExcelModule = typeof import('exceljs')

export async function loadExcelJS(): Promise<ExcelModule> {
  const module_ = await import('exceljs')
  const wrapped = (module_ as unknown as { default?: ExcelModule }).default
  return wrapped?.Workbook ? wrapped : module_
}
