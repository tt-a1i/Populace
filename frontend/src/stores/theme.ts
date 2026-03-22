import { create } from 'zustand'

export type Theme = 'dark' | 'light'
export type ThemeAccent = 'blue' | 'green' | 'purple' | 'red' | 'orange' | 'cyan'

export interface ThemeAccentPalette {
  key: ThemeAccent
  hex: string
  rgb: string
  softText: string
}

export const THEME_ACCENTS: Record<ThemeAccent, ThemeAccentPalette> = {
  blue: { key: 'blue', hex: '#3b82f6', rgb: '59 130 246', softText: '#dbeafe' },
  green: { key: 'green', hex: '#22c55e', rgb: '34 197 94', softText: '#dcfce7' },
  purple: { key: 'purple', hex: '#a855f7', rgb: '168 85 247', softText: '#f3e8ff' },
  red: { key: 'red', hex: '#ef4444', rgb: '239 68 68', softText: '#fee2e2' },
  orange: { key: 'orange', hex: '#f97316', rgb: '249 115 22', softText: '#ffedd5' },
  cyan: { key: 'cyan', hex: '#06b6d4', rgb: '6 182 212', softText: '#cffafe' },
}

interface ThemeState {
  theme: Theme
  accent: ThemeAccent
  toggleTheme: () => void
  setAccent: (accent: ThemeAccent) => void
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

function readAccent(): ThemeAccent {
  try {
    const stored = localStorage.getItem('populace-theme-accent')
    if (stored && stored in THEME_ACCENTS) return stored as ThemeAccent
  } catch {
    // ignore
  }
  return 'blue'
}

function saveAccent(accent: ThemeAccent): void {
  try {
    localStorage.setItem('populace-theme-accent', accent)
  } catch {
    // ignore
  }
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: readTheme(),
  accent: readAccent(),
  toggleTheme: () =>
    set((s) => {
      const next: Theme = s.theme === 'dark' ? 'light' : 'dark'
      saveTheme(next)
      return { theme: next }
    }),
  setAccent: (accent) =>
    set(() => {
      saveAccent(accent)
      return { accent }
    }),
}))
