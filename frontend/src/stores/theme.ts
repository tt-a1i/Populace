import { create } from 'zustand'

export type Theme = 'dark' | 'light'

interface ThemeState {
  theme: Theme
  toggleTheme: () => void
}

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem('populace-theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // ignore — localStorage may be unavailable (SSR / test env)
  }
  return 'dark'
}

function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem('populace-theme', theme)
  } catch {
    // ignore
  }
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: readTheme(),
  toggleTheme: () =>
    set((s) => {
      const next: Theme = s.theme === 'dark' ? 'light' : 'dark'
      saveTheme(next)
      return { theme: next }
    }),
}))
