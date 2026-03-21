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
        'rounded-full border border-white/15 bg-white/8 p-2 text-base leading-none text-slate-300',
        'transition hover:bg-white/20 hover:text-white',
        className,
      ].join(' ')}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}
