import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface ShortcutDef {
  keys: string[]
  desc: string
}

interface ShortcutGroup {
  title: string
  icon: string
  shortcuts: ShortcutDef[]
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-white/15 bg-white/8 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-200 shadow-sm">
      {children}
    </kbd>
  )
}

export function KeyboardShortcutsPanel() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setOpen((v) => !v)
        return
      }
      if (e.code === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open])

  const groups: ShortcutGroup[] = [
    {
      title: t('shortcuts.group_simulation', { defaultValue: 'Simulation Control' }),
      icon: '⚡',
      shortcuts: [
        { keys: ['Space'], desc: t('shortcuts.toggle_pause', { defaultValue: 'Pause / Resume' }) },
        { keys: ['1'], desc: t('shortcuts.speed_1', { defaultValue: 'Speed 1×' }) },
        { keys: ['2'], desc: t('shortcuts.speed_2', { defaultValue: 'Speed 2×' }) },
        { keys: ['3'], desc: t('shortcuts.speed_5', { defaultValue: 'Speed 5×' }) },
        { keys: ['4'], desc: t('shortcuts.speed_10', { defaultValue: 'Speed 10×' }) },
        { keys: ['5'], desc: t('shortcuts.speed_50', { defaultValue: 'Speed 50×' }) },
      ],
    },
    {
      title: t('shortcuts.group_map', { defaultValue: 'Map Navigation' }),
      icon: '🗺️',
      shortcuts: [
        { keys: ['Drag'], desc: t('shortcuts.pan', { defaultValue: 'Pan map' }) },
        { keys: ['Scroll'], desc: t('shortcuts.zoom', { defaultValue: 'Zoom in/out' }) },
        { keys: ['Pinch'], desc: t('shortcuts.pinch_zoom', { defaultValue: 'Pinch zoom (touch)' }) },
      ],
    },
    {
      title: t('shortcuts.group_panels', { defaultValue: 'Panel Shortcuts' }),
      icon: '📋',
      shortcuts: [
        { keys: ['Esc'], desc: t('shortcuts.close_panel', { defaultValue: 'Close panel / Deselect resident' }) },
        { keys: ['?'], desc: t('shortcuts.toggle_shortcuts', { defaultValue: 'Toggle this panel' }) },
        { keys: ['⌘', 'K'], desc: t('shortcuts.open_search', { defaultValue: 'Open global search' }) },
      ],
    },
  ]

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-label={t('app.close', { defaultValue: 'Close' })}
      />
      <div className="relative z-10 mx-4 w-full max-w-lg animate-[scaleIn_200ms_ease-out] rounded-2xl border border-white/10 bg-slate-900/95 p-5 shadow-2xl backdrop-blur-md">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
            {t('shortcuts.title', { defaultValue: 'Keyboard Shortcuts' })}
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>

        <div className="grid gap-4">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-slate-400">
                <span>{group.icon}</span> {group.title}
              </p>
              <div className="grid gap-1">
                {group.shortcuts.map((sc) => (
                  <div key={sc.desc} className="flex items-center justify-between rounded-lg px-3 py-1.5 even:bg-white/[0.03]">
                    <span className="text-sm text-slate-300">{sc.desc}</span>
                    <div className="flex items-center gap-1">
                      {sc.keys.map((k, i) => (
                        <span key={i}>
                          {i > 0 && <span className="mx-0.5 text-[10px] text-slate-500">+</span>}
                          <Kbd>{k}</Kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-[10px] text-slate-500">
          {t('shortcuts.hint', { defaultValue: 'Press ? to toggle this panel' })}
        </p>
      </div>
    </div>
  )
}
