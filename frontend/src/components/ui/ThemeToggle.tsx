import { useThemeStore } from '../../stores/theme'

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === 'dark' ? '切换亮色主题' : '切换暗色主题'}
      aria-label={theme === 'dark' ? '切换亮色主题' : '切换暗色主题'}
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
