import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { setSpeed as apiSetSpeed, startSimulation, stopSimulation, saveGame } from '../../services/api'
import { useSimulationStore, type SimulationSpeed } from '../../stores/simulation'

interface SearchResult {
  id: string
  type: 'resident' | 'building' | 'command'
  icon: string
  label: string
  detail?: string
  action: () => void
}

export function GlobalSearch() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const residents = useSimulationStore((s) => s.residents)
  const buildings = useSimulationStore((s) => s.buildings)
  const speed = useSimulationStore((s) => s.speed)
  const selectResident = useSimulationStore((s) => s.selectResident)
  const setRunning = useSimulationStore((s) => s.setRunning)
  const setStoreSpeed = useSimulationStore((s) => s.setSpeed)

  // Open on Ctrl/Cmd+K
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
        setQuery('')
        setSelectedIdx(0)
      }
      if (e.code === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open])

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Command actions
  const executeSpeed = useCallback((s: Exclude<SimulationSpeed, 0>) => {
    void startSimulation()
      .then(() => apiSetSpeed({ speed: s }))
      .then(() => { setRunning(true); setStoreSpeed(s) })
    setOpen(false)
  }, [setRunning, setStoreSpeed])

  const togglePause = useCallback(() => {
    if (speed === 0) {
      void startSimulation()
        .then(() => apiSetSpeed({ speed: 1 }))
        .then(() => { setRunning(true); setStoreSpeed(1) })
    } else {
      void stopSimulation().then(() => { setRunning(false); setStoreSpeed(0) })
    }
    setOpen(false)
  }, [speed, setRunning, setStoreSpeed])

  const quickSave = useCallback(() => {
    void saveGame(`Quick Save ${new Date().toLocaleTimeString()}`)
    setOpen(false)
  }, [])

  const commands: SearchResult[] = useMemo(() => [
    { id: 'cmd:pause', type: 'command', icon: speed === 0 ? '▶️' : '⏸️', label: speed === 0 ? t('shortcuts.resume', { defaultValue: 'Resume Simulation' }) : t('shortcuts.pause', { defaultValue: 'Pause Simulation' }), action: togglePause },
    { id: 'cmd:speed1', type: 'command', icon: '🏃', label: t('shortcuts.set_speed', { defaultValue: 'Set Speed 1×' }), action: () => executeSpeed(1) },
    { id: 'cmd:speed2', type: 'command', icon: '🏃', label: t('shortcuts.set_speed_2', { defaultValue: 'Set Speed 2×' }), action: () => executeSpeed(2) },
    { id: 'cmd:speed5', type: 'command', icon: '🚀', label: t('shortcuts.set_speed_5', { defaultValue: 'Set Speed 5×' }), action: () => executeSpeed(5) },
    { id: 'cmd:speed10', type: 'command', icon: '🚀', label: t('shortcuts.set_speed_10', { defaultValue: 'Set Speed 10×' }), action: () => executeSpeed(10) },
    { id: 'cmd:save', type: 'command', icon: '💾', label: t('shortcuts.quick_save', { defaultValue: 'Quick Save' }), action: quickSave },
    { id: 'cmd:settings', type: 'command', icon: '⚙️', label: t('toolbar.settings', { defaultValue: 'Settings' }), action: () => { window.dispatchEvent(new CustomEvent('populace:open-settings')); setOpen(false) } },
    { id: 'cmd:director', type: 'command', icon: '⚡', label: t('toolbar.director', { defaultValue: 'Director Console' }), action: () => { window.dispatchEvent(new CustomEvent('populace:open-director')); setOpen(false) } },
  ], [speed, t, togglePause, executeSpeed, quickSave])

  // Filter results
  const results = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return commands.slice(0, 6)

    const matched: SearchResult[] = []

    // Residents
    for (const r of residents) {
      if (r.name.toLowerCase().includes(q)) {
        matched.push({
          id: `r:${r.id}`,
          type: 'resident',
          icon: '👤',
          label: r.name,
          detail: r.status ?? undefined,
          action: () => {
            selectResident(r.id)
            setOpen(false)
          },
        })
      }
    }

    // Buildings
    for (const b of buildings) {
      if (b.name.toLowerCase().includes(q) || b.type.toLowerCase().includes(q)) {
        matched.push({
          id: `b:${b.id}`,
          type: 'building',
          icon: '🏠',
          label: b.name,
          detail: `${b.type} · (${b.position[0]}, ${b.position[1]})`,
          action: () => {
            setOpen(false)
          },
        })
      }
    }

    // Commands
    for (const cmd of commands) {
      if (cmd.label.toLowerCase().includes(q)) {
        matched.push(cmd)
      }
    }

    return matched.slice(0, 12)
  }, [query, residents, buildings, commands, selectResident])

  // Reset selection when results change
  useEffect(() => {
    setSelectedIdx(0)
  }, [results.length, query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      e.preventDefault()
      results[selectedIdx].action()
    }
  }

  if (!open) return null

  const typeLabel: Record<string, string> = {
    resident: t('search.type_resident', { defaultValue: 'Resident' }),
    building: t('search.type_building', { defaultValue: 'Building' }),
    command: t('search.type_command', { defaultValue: 'Command' }),
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]">
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-label={t('app.close', { defaultValue: 'Close' })}
      />
      <div className="relative z-10 mx-4 w-full max-w-md animate-[scaleIn_150ms_ease-out] rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-md">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="7" cy="7" r="5" />
            <path d="M11 11l3.5 3.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('search.placeholder', { defaultValue: 'Search residents, buildings, commands...' })}
            className="flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <kbd className="hidden rounded border border-white/15 bg-white/8 px-1.5 py-0.5 text-[10px] text-slate-400 sm:inline">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[45vh] overflow-y-auto py-1">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              {t('search.no_results', { defaultValue: 'No results found' })}
            </p>
          ) : (
            results.map((result, i) => (
              <button
                key={result.id}
                type="button"
                onClick={result.action}
                onMouseEnter={() => setSelectedIdx(i)}
                className={[
                  'flex w-full items-center gap-3 px-4 py-2.5 text-left transition duration-100',
                  i === selectedIdx ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]',
                ].join(' ')}
              >
                <span className="text-base leading-none">{result.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm ${i === selectedIdx ? 'text-white' : 'text-slate-200'}`}>
                    {result.label}
                  </p>
                  {result.detail && (
                    <p className="truncate text-xs text-slate-500">{result.detail}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-white/[0.04] px-2 py-0.5 text-[9px] uppercase tracking-wider text-slate-500">
                  {typeLabel[result.type] ?? result.type}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2 text-[10px] text-slate-500">
          <div className="flex items-center gap-2">
            <span>↑↓ {t('search.navigate', { defaultValue: 'Navigate' })}</span>
            <span>↵ {t('search.select', { defaultValue: 'Select' })}</span>
          </div>
          <span>⌘K {t('search.toggle', { defaultValue: 'Toggle' })}</span>
        </div>
      </div>
    </div>
  )
}
