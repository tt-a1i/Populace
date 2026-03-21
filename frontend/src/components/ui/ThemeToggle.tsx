import { useTranslation } from 'react-i18next'

import { useThemeStore } from '../../stores/theme'

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { t } = useTranslation()
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)

  const label = theme === 'dark' ? t('settings.theme_light') : t('settings.theme_dark')

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={label}
      aria-label={label}
      className={[
        'flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm text-slate-300',
        'transition hover:bg-white/10 hover:text-white',
        className,
      ].join(' ')}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}
