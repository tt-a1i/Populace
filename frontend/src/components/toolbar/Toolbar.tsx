import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BuildPanel } from './BuildPanel'
import { ComparePanel } from './ComparePanel'
import { DirectorConsole } from './DirectorConsole'
import { ExportPanel } from './ExportPanel'
import { HeatmapPanel } from './HeatmapPanel'
import { PersonaEditor } from './PersonaEditor'
import { QuestPanel } from './QuestPanel'
import { ResidentCreationWizard } from './ResidentCreationWizard'
import { SavesPanel } from './SavesPanel'
import { SettingsPanel } from './SettingsPanel'
import { StatsPanel } from './StatsPanel'
import { TimelinePanel } from './TimelinePanel'
import { ReportsPanel } from '../report'

const OPEN_SETTINGS_EVENT = 'populace:open-settings'

type ToolKey = 'director' | 'persona' | 'quest' | 'report' | 'create' | 'build' | 'stats' | 'saves' | 'heatmap' | 'compare' | 'timeline' | 'export' | 'settings'

interface ToolDef {
  key: ToolKey
  label: string
  icon: string
  tone: string
}

const TONE_GLOW: Record<string, string> = {
  cyan: 'bg-cyan-400/60 shadow-[0_0_8px_rgba(34,211,238,0.3)]',
  amber: 'bg-amber-400/60 shadow-[0_0_8px_rgba(245,158,11,0.3)]',
  emerald: 'bg-emerald-400/60 shadow-[0_0_8px_rgba(52,211,153,0.3)]',
  violet: 'bg-violet-400/60 shadow-[0_0_8px_rgba(167,139,250,0.3)]',
  rose: 'bg-rose-400/60 shadow-[0_0_8px_rgba(251,113,133,0.3)]',
}

function toneClass(tone: string, active: boolean): string {
  if (!active) return 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
  if (tone === 'cyan') return 'border-cyan-300/40 bg-cyan-300/15 text-cyan-50'
  if (tone === 'amber') return 'border-amber-300/40 bg-amber-300/15 text-amber-50'
  if (tone === 'emerald') return 'border-emerald-300/40 bg-emerald-300/15 text-emerald-50'
  if (tone === 'violet') return 'border-violet-300/40 bg-violet-300/15 text-violet-50'
  return 'border-rose-300/40 bg-rose-300/15 text-rose-50'
}

const SECONDARY_KEYS: ReadonlySet<ToolKey> = new Set([
  'create', 'build', 'stats', 'saves', 'heatmap', 'compare', 'timeline', 'export', 'settings',
])

export function Toolbar() {
  const { t } = useTranslation()
  const [activeTool, setActiveTool] = useState<ToolKey>('director')
  const [showSecondary, setShowSecondary] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0, visible: false })

  useEffect(() => {
    const openSettings = () => { setActiveTool('settings'); setShowSecondary(true) }
    const openPersona = () => setActiveTool('persona')
    const openQuest = () => setActiveTool('quest')
    const openReport = () => setActiveTool('report')
    const openDirector = () => setActiveTool('director')
    window.addEventListener(OPEN_SETTINGS_EVENT, openSettings)
    window.addEventListener('populace:open-persona', openPersona)
    window.addEventListener('populace:open-quest', openQuest)
    window.addEventListener('populace:open-report', openReport)
    window.addEventListener('populace:open-director', openDirector)
    return () => {
      window.removeEventListener(OPEN_SETTINGS_EVENT, openSettings)
      window.removeEventListener('populace:open-persona', openPersona)
      window.removeEventListener('populace:open-quest', openQuest)
      window.removeEventListener('populace:open-report', openReport)
      window.removeEventListener('populace:open-director', openDirector)
    }
  }, [])

  // Measure active button position for sliding indicator
  useLayoutEffect(() => {
    if (!containerRef.current) return
    const btn = containerRef.current.querySelector('[data-active="true"]') as HTMLElement | null
    if (btn) {
      setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth, visible: true })
    }
  }, [activeTool, showSecondary])

  // Re-measure on resize (flex-wrap can reflow buttons)
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(() => {
      const btn = containerRef.current?.querySelector('[data-active="true"]') as HTMLElement | null
      if (btn) {
        setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth, visible: true })
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const primaryTools: ToolDef[] = [
    { key: 'director', label: t('toolbar.director'), icon: '\u26A1', tone: 'cyan' },
    { key: 'persona', label: t('toolbar.persona'), icon: '\uD83D\uDC64', tone: 'amber' },
    { key: 'quest', label: t('toolbar.quest'), icon: '\uD83C\uDFAF', tone: 'emerald' },
    { key: 'report', label: t('toolbar.report'), icon: '\uD83D\uDCF0', tone: 'rose' },
  ]

  const secondaryTools: ToolDef[] = [
    { key: 'create', label: t('toolbar.create'), icon: '\uD83E\uDDD1', tone: 'emerald' },
    { key: 'build', label: t('toolbar.build'), icon: '\uD83C\uDFD7', tone: 'emerald' },
    { key: 'stats', label: t('toolbar.stats'), icon: '\uD83D\uDCCA', tone: 'cyan' },
    { key: 'saves', label: t('toolbar.saves'), icon: '\uD83D\uDCBE', tone: 'violet' },
    { key: 'heatmap', label: t('toolbar.heatmap'), icon: '\uD83D\uDFE5', tone: 'violet' },
    { key: 'compare', label: t('toolbar.compare'), icon: '\u2696\uFE0F', tone: 'amber' },
    { key: 'timeline', label: t('toolbar.timeline'), icon: '\uD83D\uDCC5', tone: 'violet' },
    { key: 'export', label: t('toolbar.export'), icon: '\uD83D\uDCE4', tone: 'cyan' },
    { key: 'settings', label: t('toolbar.settings'), icon: '\u2699\uFE0F', tone: 'cyan' },
  ]

  const allTools = [...primaryTools, ...secondaryTools]
  const activeTone = allTools.find((tool) => tool.key === activeTool)?.tone ?? 'cyan'

  const handleToolClick = (key: ToolKey) => {
    setActiveTool(key)
    // Auto-expand secondary row when a secondary tool is selected
    if (SECONDARY_KEYS.has(key)) {
      setShowSecondary(true)
    }
  }

  const panel = useMemo(() => {
    if (activeTool === 'director') return <DirectorConsole />
    if (activeTool === 'persona') return <PersonaEditor />
    if (activeTool === 'quest') return <QuestPanel />
    if (activeTool === 'saves') return <SavesPanel />
    if (activeTool === 'stats') return <StatsPanel />
    if (activeTool === 'build') return <BuildPanel />
    if (activeTool === 'create') return <ResidentCreationWizard />
    if (activeTool === 'export') return <ExportPanel />
    if (activeTool === 'heatmap') return <HeatmapPanel />
    if (activeTool === 'compare') return <ComparePanel />
    if (activeTool === 'timeline') return <TimelinePanel />
    if (activeTool === 'settings') return <SettingsPanel />
    return <ReportsPanel />
  }, [activeTool, t])

  return (
    <div className="grid gap-3">
      {/* Tool selector tabs */}
      <div className="relative" ref={containerRef}>
        <div className="flex flex-wrap items-center gap-1.5">
          {primaryTools.map((tool) => (
            <button
              key={tool.key}
              type="button"
              data-active={activeTool === tool.key}
              onClick={() => handleToolClick(tool.key)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${toneClass(tool.tone, activeTool === tool.key)}`}
            >
              <span className="mr-1.5">{tool.icon}</span>
              {tool.label}
            </button>
          ))}
          <button
            type="button"
            data-testid="more-toggle"
            onClick={() => setShowSecondary((v) => !v)}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-400 transition hover:bg-white/10"
          >
            {showSecondary ? t('toolbar.less') : t('toolbar.more')} {showSecondary ? '\u25B4' : '\u25BE'}
          </button>
        </div>
        {showSecondary && (
          <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid="secondary-row">
            {secondaryTools.map((tool) => (
              <button
                key={tool.key}
                type="button"
                data-active={activeTool === tool.key}
                onClick={() => handleToolClick(tool.key)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] transition ${toneClass(tool.tone, activeTool === tool.key)}`}
              >
                <span className="mr-1">{tool.icon}</span>
                {tool.label}
              </button>
            ))}
          </div>
        )}
        {indicator.visible && (
          <div
            className={`absolute -bottom-0.5 h-0.5 rounded-full transition-all duration-300 ease-out ${TONE_GLOW[activeTone] ?? TONE_GLOW.cyan}`}
            style={{ left: indicator.left, width: indicator.width }}
          />
        )}
      </div>

      {panel}
    </div>
  )
}
