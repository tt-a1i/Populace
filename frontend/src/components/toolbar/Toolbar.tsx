import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BuildPanel } from './BuildPanel'
import { ComparePanel } from './ComparePanel'
import { DirectorConsole } from './DirectorConsole'
import { DialogueHistory } from './DialogueHistory'
import { ExportPanel } from './ExportPanel'
import { PersonaEditor } from './PersonaEditor'
import { QuestPanel } from './QuestPanel'
import { ResidentCreationWizard } from './ResidentCreationWizard'
import { SavesPanel } from './SavesPanel'
import { SettingsPanel } from './SettingsPanel'
import { TimelinePanel } from './TimelinePanel'
import { ReportsPanel } from '../report'
import { ActivityLog } from '../ui/ActivityLog'
import { DashboardView } from './DashboardView'
import { LeaderboardPanel } from './LeaderboardPanel'
import { AchievementWall } from './AchievementWall'
import { NewspaperPanel } from './NewspaperPanel'
import { FullReportPanel } from './FullReportPanel'
import { WhatIfPanel } from './WhatIfPanel'
import { MapEditor } from '../town/MapEditor'

const StatsPanel = lazy(() =>
  import('./StatsPanel').then((module) => ({ default: module.StatsPanel })),
)
const HeatmapPanel = lazy(() =>
  import('./HeatmapPanel').then((module) => ({ default: module.HeatmapPanel })),
)

const OPEN_SETTINGS_EVENT = 'populace:open-settings'

type ToolKey = 'director' | 'persona' | 'quest' | 'report' | 'create' | 'build' | 'stats' | 'dialogue' | 'saves' | 'heatmap' | 'compare' | 'timeline' | 'export' | 'settings' | 'activity' | 'dashboard' | 'leaderboard' | 'achievements' | 'newspaper' | 'fullreport' | 'whatif' | 'mapeditor'

interface ToolDef {
  key: ToolKey
  label: string
  icon: string
  tone: string
}

const TONE_GLOW: Record<string, string> = {
  cyan: 'theme-accent-indicator',
  amber: 'theme-accent-indicator',
  emerald: 'theme-accent-indicator',
  violet: 'theme-accent-indicator',
  rose: 'theme-accent-indicator',
}

function toneClass(_tone: string, active: boolean): string {
  if (!active) return 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
  return 'theme-accent-button-active'
}

const SECONDARY_KEYS: ReadonlySet<ToolKey> = new Set([
  'create', 'build', 'stats', 'dialogue', 'activity', 'saves', 'heatmap', 'compare', 'timeline', 'export', 'settings', 'dashboard', 'leaderboard', 'achievements', 'newspaper' | 'fullreport', 'whatif', 'mapeditor',
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
    const closePanel = () => { setActiveTool('director'); setShowSecondary(false) }
    window.addEventListener(OPEN_SETTINGS_EVENT, openSettings)
    window.addEventListener('populace:open-persona', openPersona)
    window.addEventListener('populace:open-quest', openQuest)
    window.addEventListener('populace:open-report', openReport)
    window.addEventListener('populace:open-director', openDirector)
    window.addEventListener('populace:close-panel', closePanel)
    return () => {
      window.removeEventListener(OPEN_SETTINGS_EVENT, openSettings)
      window.removeEventListener('populace:open-persona', openPersona)
      window.removeEventListener('populace:open-quest', openQuest)
      window.removeEventListener('populace:open-report', openReport)
      window.removeEventListener('populace:open-director', openDirector)
      window.removeEventListener('populace:close-panel', closePanel)
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
    { key: 'dialogue', label: t('toolbar.dialogue_history'), icon: '\uD83D\uDCAC', tone: 'amber' },
    { key: 'activity', label: t('toolbar.activity_log', '\u6D3B\u52A8\u65E5\u5FD7'), icon: '\uD83D\uDCDC', tone: 'cyan' },
    { key: 'saves', label: t('toolbar.saves'), icon: '\uD83D\uDCBE', tone: 'violet' },
    { key: 'heatmap', label: t('toolbar.heatmap'), icon: '\uD83D\uDFE5', tone: 'violet' },
    { key: 'compare', label: t('toolbar.compare'), icon: '\u2696\uFE0F', tone: 'amber' },
    { key: 'timeline', label: t('toolbar.timeline'), icon: '\uD83D\uDCC5', tone: 'violet' },
    { key: 'export', label: t('toolbar.export'), icon: '\uD83D\uDCE4', tone: 'cyan' },
    { key: 'settings', label: t('toolbar.settings'), icon: '\u2699\uFE0F', tone: 'cyan' },
    { key: 'dashboard', label: t('toolbar.dashboard', { defaultValue: 'Dashboard' }), icon: '\uD83D\uDCCA', tone: 'cyan' },
    { key: 'leaderboard', label: t('toolbar.leaderboard', { defaultValue: 'Rankings' }), icon: '\uD83C\uDFC6', tone: 'amber' },
    { key: 'achievements', label: t('toolbar.achievements', { defaultValue: 'Achievements' }), icon: '\uD83C\uDFC5', tone: 'amber' },
    { key: 'newspaper' | 'fullreport', label: t('toolbar.newspaper', { defaultValue: 'Gazette' }), icon: '\uD83D\uDCF0', tone: 'rose' },
    { key: 'whatif', label: t('toolbar.whatif', { defaultValue: 'What-If' }), icon: '\uD83D\uDD2E', tone: 'violet' },
    { key: 'mapeditor', label: t('toolbar.mapeditor', { defaultValue: '\u5730\u56FE\u7F16\u8F91' }), icon: '\u{1F5FA}\uFE0F', tone: 'emerald' },
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
    if (activeTool === 'stats') {
      return (
        <Suspense fallback={<PanelLoading label={t('toolbar.stats')} />}>
          <StatsPanel />
        </Suspense>
      )
    }
    if (activeTool === 'dialogue') return <DialogueHistory />
    if (activeTool === 'activity') return <ActivityLog />
    if (activeTool === 'build') return <BuildPanel />
    if (activeTool === 'create') return <ResidentCreationWizard />
    if (activeTool === 'export') return <ExportPanel />
    if (activeTool === 'heatmap') {
      return (
        <Suspense fallback={<PanelLoading label={t('toolbar.heatmap')} />}>
          <HeatmapPanel />
        </Suspense>
      )
    }
    if (activeTool === 'compare') return <ComparePanel />
    if (activeTool === 'timeline') return <TimelinePanel />
    if (activeTool === 'settings') return <SettingsPanel />
    if (activeTool === 'dashboard') return <DashboardView />
    if (activeTool === 'leaderboard') return <LeaderboardPanel />
    if (activeTool === 'achievements') return <AchievementWall />
    if (activeTool === 'newspaper' | 'fullreport') return <NewspaperPanel />
    if (activeTool === 'whatif') return <WhatIfPanel />
    if (activeTool === 'mapeditor') return <MapEditor onTilesChanged={() => window.dispatchEvent(new CustomEvent('populace:tiles-changed'))} onClose={() => { setActiveTool('director'); setShowSecondary(false) }} />
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
              aria-pressed={activeTool === tool.key}
              aria-label={tool.label}
              onClick={() => handleToolClick(tool.key)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition duration-200 active:scale-95 ${toneClass(tool.tone, activeTool === tool.key)}`}
            >
              <span className="mr-1.5" aria-hidden="true">{tool.icon}</span>
              {tool.label}
            </button>
          ))}
          <button
            type="button"
            data-testid="more-toggle"
            aria-expanded={showSecondary}
            aria-label={showSecondary ? t('toolbar.less') : t('toolbar.more')}
            onClick={() => setShowSecondary((v) => !v)}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-400 transition duration-200 hover:bg-white/10 active:scale-95"
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
                aria-pressed={activeTool === tool.key}
                aria-label={tool.label}
                onClick={() => handleToolClick(tool.key)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] transition duration-200 active:scale-95 ${toneClass(tool.tone, activeTool === tool.key)}`}
              >
                <span className="mr-1" aria-hidden="true">{tool.icon}</span>
                {tool.label}
              </button>
            ))}
          </div>
        )}
        {indicator.visible && (
          <div
            className={`absolute -bottom-0.5 h-0.5 rounded-full transition-all duration-300 ease-out will-change-[left,width] ${TONE_GLOW[activeTone] ?? TONE_GLOW.cyan}`}
            style={{ left: indicator.left, width: indicator.width }}
          />
        )}
      </div>

      {panel}
    </div>
  )
}

function PanelLoading({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-slate-300">
      {label}
    </div>
  )
}
