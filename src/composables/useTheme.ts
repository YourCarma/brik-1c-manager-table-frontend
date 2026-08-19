/**
 * Тема оформления: системная, светлая, тёмная.
 *
 * Выбор пользователя записывается атрибутом `data-theme` на `<html>` и живёт
 * в localStorage. Пока выбрана «системная», атрибута нет и решает
 * `prefers-color-scheme` — так же, как договорено в дизайн-системе
 * (`src/assets/ui.css`, блок «ТЁМНАЯ ТЕМА»).
 *
 * Состояние поднято в модуль, а не в компонент: переключатель стоит в шапке
 * в одном экземпляре, но читать тему может кто угодно.
 */
import { ref } from 'vue'

export type ThemeMode = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'ui-theme'

/** Порядок обхода по клику: система → светлая → тёмная → система. */
const ORDER: ThemeMode[] = ['system', 'light', 'dark']

export const THEME_LABEL: Record<ThemeMode, string> = {
  system: 'Тема: как в системе',
  light: 'Тема: светлая',
  dark: 'Тема: тёмная',
}

function read(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  } catch {
    // Приватный режим или запрет хранилища — не повод падать: берём системную.
  }
  return 'system'
}

function apply(value: ThemeMode) {
  const root = document.documentElement
  if (value === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', value)
}

const mode = ref<ThemeMode>(read())
apply(mode.value)

export function useTheme() {
  function set(value: ThemeMode) {
    mode.value = value
    apply(value)
    try {
      if (value === 'system') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Не сохранилось — тема всё равно применена до конца сессии.
    }
  }

  function cycle() {
    set(ORDER[(ORDER.indexOf(mode.value) + 1) % ORDER.length])
  }

  return { mode, set, cycle }
}
