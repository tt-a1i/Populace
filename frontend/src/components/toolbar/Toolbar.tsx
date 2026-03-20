import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SoundToggleButton } from './SoundToggleButton'
import { EventInjector } from './EventInjector'
import { PersonaEditor } from './PersonaEditor'
import { SavesPanel } from './SavesPanel'
import { SpeedControl } from './SpeedControl'
import { StatsPanel } from './StatsPanel'
import { ReportsPanel } from '../report'
import { LanguageSwitcher, MessageBar } from '../ui'

type ToolKey = 'event' | 'persona' | 'build' | 'report' | 'stats' | 'saves'

function toneClass(tone: string, active: boolean): string {
  if (!active) return 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
  if (tone === 'cyan') return 'border-cyan-300/40 bg-cyan-300/15 text-cyan-50'
  if (tone === 'amber') return 'border-amber-300/40 bg-amber-300/15 text-amber-50'
  if (tone === 'emerald') return 'border-emerald-300/40 bg-emerald-300/15 text-emerald-50'
  if (tone === 'violet') return 'border-violet-300/40 bg-violet-300/15 text-violet-50'
  return 'border-rose-300/40 bg-rose-300/15 text-rose-50'
}

export function Toolbar() {
  const { t } = useTranslation()
  const [activeTool, setActiveTool] = useState<ToolKey>('event')

  const tools: Array<{ key: ToolKey; label: string; icon: string; tone: string }> = [
    { key: 'event', label: t('toolbar.event'), icon: '⚡', tone: 'cyan' },
    { key: 'persona', label: t('toolbar.persona'), icon: '👤', tone: 'amber' },
    { key: 'build', label: t('toolbar.build'), icon: '🏗', tone: 'emerald' },
    { key: 'report', label: t('toolbar.report'), icon: '📰', tone: 'rose' },
    { key: 'stats', label: t('toolbar.stats'), icon: '📊', tone: 'cyan' },
    { key: 'saves', label: t('toolbar.saves'), icon: '💾', tone: 'violet' },
  ]

  const panel = useMemo(() => {
    if (activeTool === 'event') return <EventInjector />
    if (activeTool === 'persona') return <PersonaEditor />
    if (activeTool === 'saves') return <SavesPanel />
    if (activeTool === 'stats') return <StatsPanel />
    if (activeTool === 'build') {
      return (
        <div className="rounded-[24px] border border-white/10 bg-slate-950/70 p-4 text-slate-300 shadow-[0_18px_44px_rgba(15,23,42,0.35)]">
          <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-200/70">{t('build.badge')}</p>
          <h3 className="mt-2 font-display text-2xl text-white">{t('build.title')}</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6">{t('build.desc')}</p>
        </div>
      )
    }
    return <ReportsPanel />
  }, [activeTool, t])

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/5 px-5 py-4 shadow-[0_18px_48px_rgba(15,23,42,0.25)] backdrop-blur xl:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2 text-sm text-slate-100">
            {tools.map((tool) => (
              <button
                key={tool.key}
                type="button"
                onClick={() => setActiveTool(tool.key)}
                className={`rounded-full border px-4 py-2 transition ${toneClass(tool.tone, activeTool === tool.key)}`}
              >
                <span className="mr-2">{tool.icon}</span>
                {tool.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <SpeedControl />
            <SoundToggleButton />
            <LanguageSwitcher />
          </div>
        </div>

        <div className="rounded-full border border-white/10 bg-slate-950/45 px-4 py-2 text-sm text-slate-300">
          {t('toolbar.current_tool')}
          <span className="ml-2 font-medium text-white">
            {tools.find((tool) => tool.key === activeTool)?.label}
          </span>
        </div>

        <MessageBar />
      </div>

      {panel}
    </div>
  )
}
