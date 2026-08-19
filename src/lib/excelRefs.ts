/**
 * Адресация ячеек `.xlsx`: номер колонки → её буква (1 → `A`, 27 → `AA`).
 *
 * Нужна в двух местах — при сборке формул мок-книги и при показе шапки сетки
 * на экране книги. Живёт здесь, чтобы не расходиться между ними.
 */
export function columnLetter(index: number): string {
  let n = index
  let out = ''
  while (n > 0) {
    const rest = (n - 1) % 26
    out = String.fromCharCode(65 + rest) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}
