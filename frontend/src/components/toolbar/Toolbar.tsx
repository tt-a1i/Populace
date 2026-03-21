import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SoundToggleButton } from './SoundToggleButton'
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
import { SpeedControl } from './SpeedControl'
import { StatsPanel } from './StatsPanel'
import { TimelinePanel } from './TimelinePanel'
import { ReportsPanel } from '../report'
import { LanguageSwitcher, MessageBar } from '../ui'

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
    const handler = () => {
      setActiveTool('settings')
      setShowSecondary(true)
    }
    window.addEventListener(OPEN_SETTINGS_EVENT, handler)
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, handler)
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
    <div className="grid gap-4">
      <div className="flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/5 px-5 py-4 shadow-[0_18px_48px_rgba(15,23,42,0.25)] backdrop-blur xl:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative" ref={containerRef}>
            {/* Primary tools row */}
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-100">
              {primaryTools.map((tool) => (
                <button
                  key={tool.key}
                  type="button"
                  data-active={activeTool === tool.key}
                  onClick={() => handleToolClick(tool.key)}
                  className={`rounded-full border px-5 py-3 text-sm font-semibold transition ${toneClass(tool.tone, activeTool === tool.key)}`}
                >
                  <span className="mr-2">{tool.icon}</span>
                  {tool.label}
                </button>
              ))}
              <button
                type="button"
                data-testid="more-toggle"
                onClick={() => setShowSecondary((v) => !v)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/10"
              >
                {showSecondary ? t('toolbar.less') : t('toolbar.more')} {showSecondary ? '\u25B4' : '\u25BE'}
              </button>
            </div>
            {/* Secondary tools row */}
            {showSecondary && (
              <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-100" data-testid="secondary-row">
                {secondaryTools.map((tool) => (
                  <button
                    key={tool.key}
                    type="button"
                    data-active={activeTool === tool.key}
                    onClick={() => handleToolClick(tool.key)}
                    className={`rounded-full border px-3 py-2 text-xs transition ${toneClass(tool.tone, activeTool === tool.key)}`}
                  >
                    <span className="mr-1">{tool.icon}</span>
                    {tool.label}
                  </button>
                ))}
              </div>
            )}
            {indicator.visible && (
              <div
                className={`absolute -bottom-1 h-0.5 rounded-full transition-all duration-300 ease-out ${TONE_GLOW[activeTone] ?? TONE_GLOW.cyan}`}
                style={{ left: indicator.left, width: indicator.width }}
              />
            )}
          </div>
          <div className="flex items-center gap-3">
            <SpeedControl />
            <SoundToggleButton />
            <LanguageSwitcher />
          </div>
        </div>

        <MessageBar />
      </div>

      {panel}
    </div>
  )
}
