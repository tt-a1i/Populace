import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSound } from '../../audio/SoundProvider'
import { DirectorConsole } from './DirectorConsole'
import { PersonaEditor } from './PersonaEditor'
import { QuestPanel } from './QuestPanel'
import { ReportsPanel } from '../report'
import { PanelSpinner } from '../ui/PanelStates'

const StatsPanel = lazy(() =>
  import('./StatsPanel').then((module) => ({ default: module.StatsPanel })),
)
const HeatmapPanel = lazy(() =>
  import('./HeatmapPanel').then((module) => ({ default: module.HeatmapPanel })),
)
const BuildPanel = lazy(() =>
  import('./BuildPanel').then((module) => ({ default: module.BuildPanel })),
)
const ComparePanel = lazy(() =>
  import('./ComparePanel').then((module) => ({ default: module.ComparePanel })),
)
const CulturePanel = lazy(() =>
  import('./CulturePanel').then((module) => ({ default: module.CulturePanel })),
)
const ReligionPanel = lazy(() =>
  import('./ReligionPanel').then((module) => ({ default: module.ReligionPanel })),
)
const DialogueHistory = lazy(() =>
  import('./DialogueHistory').then((module) => ({ default: module.DialogueHistory })),
)
const BulletinPanel = lazy(() =>
  import('./BulletinPanel').then((module) => ({ default: module.BulletinPanel })),
)
const DiplomacyPanel = lazy(() =>
  import('./DiplomacyPanel').then((module) => ({ default: module.DiplomacyPanel })),
)
const EconomyPanel = lazy(() =>
  import('./EconomyPanel').then((module) => ({ default: module.EconomyPanel })),
)
const MilestonePanel = lazy(() =>
  import('./MilestonePanel').then((module) => ({ default: module.MilestonePanel })),
)
const MarketPanel = lazy(() =>
  import('./MarketPanel').then((module) => ({ default: module.MarketPanel })),
)
const PoliticsPanel = lazy(() =>
  import('./PoliticsPanel').then((module) => ({ default: module.PoliticsPanel })),
)
const FashionPanel = lazy(() =>
  import('./FashionPanel').then((module) => ({ default: module.FashionPanel })),
)
const ExportPanel = lazy(() =>
  import('./ExportPanel').then((module) => ({ default: module.ExportPanel })),
)
const ReputationPanel = lazy(() =>
  import('./ReputationPanel').then((module) => ({ default: module.ReputationPanel })),
)
const ResidentCreationWizard = lazy(() =>
  import('./ResidentCreationWizard').then((module) => ({ default: module.ResidentCreationWizard })),
)
const SavesPanel = lazy(() =>
  import('./SavesPanel').then((module) => ({ default: module.SavesPanel })),
)
const SettingsPanel = lazy(() =>
  import('./SettingsPanel').then((module) => ({ default: module.SettingsPanel })),
)
const SecurityPanel = lazy(() =>
  import('./SecurityPanel').then((module) => ({ default: module.SecurityPanel })),
)
const HealthPanel = lazy(() =>
  import('./HealthPanel').then((module) => ({ default: module.HealthPanel })),
)
const EmergencyPanel = lazy(() =>
  import('./EmergencyPanel').then((module) => ({ default: module.EmergencyPanel })),
)
const PopulationPanel = lazy(() =>
  import('./PopulationPanel').then((module) => ({ default: module.PopulationPanel })),
)
const TimelinePanel = lazy(() =>
  import('./TimelinePanel').then((module) => ({ default: module.TimelinePanel })),
)
const VotePanel = lazy(() =>
  import('./VotePanel').then((module) => ({ default: module.VotePanel })),
)
const FamilyPanel = lazy(() =>
  import('./FamilyPanel').then((module) => ({ default: module.FamilyPanel })),
)
const ActivityLog = lazy(() =>
  import('../ui/ActivityLog').then((module) => ({ default: module.ActivityLog })),
)
const DashboardView = lazy(() =>
  import('./DashboardView').then((module) => ({ default: module.DashboardView })),
)
const LeaderboardPanel = lazy(() =>
  import('./LeaderboardPanel').then((module) => ({ default: module.LeaderboardPanel })),
)
const AchievementWall = lazy(() =>
  import('./AchievementWall').then((module) => ({ default: module.AchievementWall })),
)
const NewspaperPanel = lazy(() =>
  import('./NewspaperPanel').then((module) => ({ default: module.NewspaperPanel })),
)
const WhatIfPanel = lazy(() =>
  import('./WhatIfPanel').then((module) => ({ default: module.WhatIfPanel })),
)
const MapEditor = lazy(() =>
  import('../town/MapEditor').then((module) => ({ default: module.MapEditor })),
)
const RulesPanel = lazy(() =>
  import('./RulesPanel').then((module) => ({ default: module.RulesPanel })),
)
const KnowledgeGraphPanel = lazy(() =>
  import('./KnowledgeGraphPanel').then((module) => ({ default: module.KnowledgeGraphPanel })),
)
const InterventionPanel = lazy(() =>
  import('./InterventionPanel').then((module) => ({ default: module.InterventionPanel })),
)
const DreamPanel = lazy(() =>
  import('./DreamPanel').then((module) => ({ default: module.DreamPanel })),
)
const GangPanel = lazy(() =>
  import('./GangPanel').then((module) => ({ default: module.GangPanel })),
)
const PersonalityPanel = lazy(() =>
  import('./PersonalityPanel').then((module) => ({ default: module.PersonalityPanel })),
)

const OPEN_SETTINGS_EVENT = 'populace:open-settings'

type ToolKey = 'director' | 'persona' | 'quest' | 'report' | 'create' | 'build' | 'votes' | 'security' | 'health' | 'emergency' | 'population' | 'family' | 'economy' | 'fashion' | 'culture' | 'politics' | 'religion' | 'reputation' | 'bulletin' | 'diplomacy' | 'stats' | 'dialogue' | 'saves' | 'heatmap' | 'compare' | 'timeline' | 'export' | 'settings' | 'activity' | 'dashboard' | 'leaderboard' | 'achievements' | 'newspaper' | 'fullreport' | 'whatif' | 'mapeditor' | 'rules' | 'knowledge' | 'intervention' | 'dreams' | 'gangs' | 'market' | 'milestones' | 'personality'

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
  'create', 'build', 'stats', 'dialogue', 'activity', 'saves', 'heatmap', 'compare', 'timeline', 'export', 'settings', 'dashboard', 'leaderboard', 'achievements', 'newspaper', 'fullreport', 'whatif', 'mapeditor', 'rules', 'knowledge',
  'votes', 'security', 'health', 'emergency', 'population', 'family', 'economy', 'fashion', 'culture', 'politics', 'religion', 'reputation', 'bulletin', 'diplomacy', 'dreams', 'gangs', 'market', 'personality',
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
    const cycleTool = (e: Event) => {
      const reverse = (e as CustomEvent).detail?.reverse === true
      const keys = ['director', 'persona', 'quest', 'report'] as const
      setActiveTool((prev) => {
        const idx = keys.indexOf(prev as typeof keys[number])
        if (idx < 0) return keys[0]
        const next = reverse ? (idx - 1 + keys.length) % keys.length : (idx + 1) % keys.length
        return keys[next]
      })
    }
    window.addEventListener(OPEN_SETTINGS_EVENT, openSettings)
    window.addEventListener('populace:open-persona', openPersona)
    window.addEventListener('populace:open-quest', openQuest)
    window.addEventListener('populace:open-report', openReport)
    window.addEventListener('populace:open-director', openDirector)
    window.addEventListener('populace:close-panel', closePanel)
    window.addEventListener('populace:cycle-tool', cycleTool)
    return () => {
      window.removeEventListener(OPEN_SETTINGS_EVENT, openSettings)
      window.removeEventListener('populace:open-persona', openPersona)
      window.removeEventListener('populace:open-quest', openQuest)
      window.removeEventListener('populace:open-report', openReport)
      window.removeEventListener('populace:open-director', openDirector)
      window.removeEventListener('populace:close-panel', closePanel)
      window.removeEventListener('populace:cycle-tool', cycleTool)
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
    { key: 'votes', label: t('toolbar.votes', { defaultValue: '社区投票' }), icon: '\uD83D\uDDD3\uFE0F', tone: 'amber' },
    { key: 'security', label: t('toolbar.security', { defaultValue: '治安面板' }), icon: '\uD83D\uDEE1\uFE0F', tone: 'rose' },
    { key: 'health', label: t('toolbar.health', { defaultValue: '健康面板' }), icon: '\uD83E\uDE7A', tone: 'emerald' },
    { key: 'emergency', label: t('toolbar.emergency', { defaultValue: '应急面板' }), icon: '\uD83D\uDEA8', tone: 'rose' },
    { key: 'population', label: t('toolbar.population', { defaultValue: '人口面板' }), icon: '\uD83E\uDDD3', tone: 'amber' },
    { key: 'family', label: t('toolbar.family', { defaultValue: '家族谱系' }), icon: '\uD83C\uDF33', tone: 'emerald' },
    { key: 'economy', label: t('toolbar.economy', { defaultValue: '经济面板' }), icon: '\uD83D\uDCB0', tone: 'emerald' },
    { key: 'fashion', label: t('toolbar.fashion', { defaultValue: '时尚面板' }), icon: '\uD83D\uDC57', tone: 'rose' },
    { key: 'culture', label: t('toolbar.culture', { defaultValue: '文化面板' }), icon: '\uD83C\uDFA8', tone: 'rose' },
    { key: 'politics', label: t('toolbar.politics', { defaultValue: '政治面板' }), icon: '\uD83C\uDFDB\uFE0F', tone: 'amber' },
    { key: 'religion', label: t('toolbar.religion', { defaultValue: '信仰面板' }), icon: '\uD83D\uDD6F\uFE0F', tone: 'amber' },
    { key: 'reputation', label: t('toolbar.reputation', { defaultValue: '声望排行榜' }), icon: '\u2B50', tone: 'amber' },
    { key: 'bulletin', label: t('toolbar.bulletin', { defaultValue: '公告板' }), icon: '\uD83D\uDCCC', tone: 'rose' },
    { key: 'diplomacy', label: t('toolbar.diplomacy', { defaultValue: '外交面板' }), icon: '\uD83E\uDDED', tone: 'cyan' },
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
    { key: 'newspaper', label: t('toolbar.newspaper', { defaultValue: 'Gazette' }), icon: '\uD83D\uDCF0', tone: 'rose' },
    { key: 'whatif', label: t('toolbar.whatif', { defaultValue: 'What-If' }), icon: '\uD83D\uDD2E', tone: 'violet' },
    { key: 'mapeditor', label: t('toolbar.mapeditor', { defaultValue: '\u5730\u56FE\u7F16\u8F91' }), icon: '\u{1F5FA}\uFE0F', tone: 'emerald' },
    { key: 'rules', label: t('toolbar.rules', { defaultValue: '\u89C4\u5219\u5F15\u64CE' }), icon: '\u2699\uFE0F', tone: 'cyan' },
    { key: 'knowledge', label: t('toolbar.knowledge', { defaultValue: 'Knowledge Graph' }), icon: '\uD83E\uDDE0', tone: 'violet' },
    { key: 'intervention', label: t('toolbar.intervention', { defaultValue: '干预' }), icon: '\u26A1', tone: 'cyan' },
    { key: 'milestones', label: t('toolbar.milestones', { defaultValue: '里程碑' }), icon: '🏅', tone: 'amber' },
    { key: 'dreams', label: t('toolbar.dreams', { defaultValue: '梦想面板' }), icon: '✨', tone: 'violet' },
    { key: 'gangs', label: t('toolbar.gangs', { defaultValue: '势力面板' }), icon: '🗡️', tone: 'rose' },
    { key: 'market', label: t('toolbar.market', { defaultValue: '市场行情' }), icon: '🛒', tone: 'emerald' },
    { key: 'personality', label: t('toolbar.personality', { defaultValue: '个性面板' }), icon: '🧠', tone: 'violet' },
  ]

  const allTools = [...primaryTools, ...secondaryTools]
  const activeTone = allTools.find((tool) => tool.key === activeTool)?.tone ?? 'cyan'

  const { play } = useSound()
  const handleToolClick = (key: ToolKey) => {
    setActiveTool(key)
    play('panel_open')
    // Auto-expand secondary row when a secondary tool is selected
    if (SECONDARY_KEYS.has(key)) {
      setShowSecondary(true)
    }
  }

  const panel = useMemo(() => {
    if (activeTool === 'director') return <DirectorConsole />
    if (activeTool === 'persona') return <PersonaEditor />
    if (activeTool === 'quest') return <QuestPanel />
    if (activeTool === 'stats') {
      return (
        <Suspense fallback={<PanelLoading label={t('toolbar.stats')} />}>
          <StatsPanel />
        </Suspense>
      )
    }
    if (activeTool === 'dialogue') return <LazyPanel label={t('toolbar.dialogue_history')}><DialogueHistory /></LazyPanel>
    if (activeTool === 'activity') return <LazyPanel label={t('toolbar.activity_log', '活动日志')}><ActivityLog /></LazyPanel>
    if (activeTool === 'build') return <LazyPanel label={t('toolbar.build')}><BuildPanel /></LazyPanel>
    if (activeTool === 'votes') return <LazyPanel label={t('toolbar.votes', { defaultValue: '社区投票' })}><VotePanel /></LazyPanel>
    if (activeTool === 'security') return <LazyPanel label={t('toolbar.security', { defaultValue: '治安面板' })}><SecurityPanel /></LazyPanel>
    if (activeTool === 'health') return <LazyPanel label={t('toolbar.health', { defaultValue: '健康面板' })}><HealthPanel /></LazyPanel>
    if (activeTool === 'emergency') return <LazyPanel label={t('toolbar.emergency', { defaultValue: '应急面板' })}><EmergencyPanel /></LazyPanel>
    if (activeTool === 'population') return <LazyPanel label={t('toolbar.population', { defaultValue: '人口面板' })}><PopulationPanel /></LazyPanel>
    if (activeTool === 'family') return <LazyPanel label={t('toolbar.family', { defaultValue: '家族谱系' })}><FamilyPanel /></LazyPanel>
    if (activeTool === 'economy') return <LazyPanel label={t('toolbar.economy', { defaultValue: '经济面板' })}><EconomyPanel /></LazyPanel>
    if (activeTool === 'fashion') return <LazyPanel label={t('toolbar.fashion', { defaultValue: '时尚面板' })}><FashionPanel /></LazyPanel>
    if (activeTool === 'culture') return <LazyPanel label={t('toolbar.culture', { defaultValue: '文化面板' })}><CulturePanel /></LazyPanel>
    if (activeTool === 'politics') return <LazyPanel label={t('toolbar.politics', { defaultValue: '政治面板' })}><PoliticsPanel /></LazyPanel>
    if (activeTool === 'religion') return <LazyPanel label={t('toolbar.religion', { defaultValue: '信仰面板' })}><ReligionPanel /></LazyPanel>
    if (activeTool === 'reputation') return <LazyPanel label={t('toolbar.reputation', { defaultValue: '声望排行榜' })}><ReputationPanel /></LazyPanel>
    if (activeTool === 'bulletin') return <LazyPanel label={t('toolbar.bulletin', { defaultValue: '公告板' })}><BulletinPanel /></LazyPanel>
    if (activeTool === 'diplomacy') return <LazyPanel label={t('toolbar.diplomacy', { defaultValue: '外交面板' })}><DiplomacyPanel /></LazyPanel>
    if (activeTool === 'create') return <LazyPanel label={t('toolbar.create')}><ResidentCreationWizard /></LazyPanel>
    if (activeTool === 'export') return <LazyPanel label={t('toolbar.export')}><ExportPanel /></LazyPanel>
    if (activeTool === 'saves') return <LazyPanel label={t('toolbar.saves')}><SavesPanel /></LazyPanel>
    if (activeTool === 'heatmap') {
      return (
        <Suspense fallback={<PanelLoading label={t('toolbar.heatmap')} />}>
          <HeatmapPanel />
        </Suspense>
      )
    }
    if (activeTool === 'compare') return <LazyPanel label={t('toolbar.compare')}><ComparePanel /></LazyPanel>
    if (activeTool === 'timeline') return <LazyPanel label={t('toolbar.timeline')}><TimelinePanel /></LazyPanel>
    if (activeTool === 'settings') return <LazyPanel label={t('toolbar.settings')}><SettingsPanel /></LazyPanel>
    if (activeTool === 'dashboard') return <LazyPanel label={t('toolbar.dashboard', { defaultValue: 'Dashboard' })}><DashboardView /></LazyPanel>
    if (activeTool === 'leaderboard') return <LazyPanel label={t('toolbar.leaderboard', { defaultValue: 'Rankings' })}><LeaderboardPanel /></LazyPanel>
    if (activeTool === 'achievements') return <LazyPanel label={t('toolbar.achievements', { defaultValue: 'Achievements' })}><AchievementWall /></LazyPanel>
    if (activeTool === 'newspaper' || activeTool === 'fullreport') return <LazyPanel label={t('toolbar.newspaper', { defaultValue: 'Gazette' })}><NewspaperPanel /></LazyPanel>
    if (activeTool === 'whatif') return <LazyPanel label={t('toolbar.whatif', { defaultValue: 'What-If' })}><WhatIfPanel /></LazyPanel>
    if (activeTool === 'mapeditor') {
      return (
        <LazyPanel label={t('toolbar.mapeditor', { defaultValue: '\u5730\u56FE\u7F16\u8F91' })}>
          <MapEditor onTilesChanged={() => window.dispatchEvent(new CustomEvent('populace:tiles-changed'))} onClose={() => { setActiveTool('director'); setShowSecondary(false) }} />
        </LazyPanel>
      )
    }
    if (activeTool === 'rules') return <LazyPanel label={t('toolbar.rules', { defaultValue: '\u89C4\u5219\u5F15\u64CE' })}><RulesPanel /></LazyPanel>
    if (activeTool === 'knowledge') return <LazyPanel label={t('toolbar.knowledge', { defaultValue: 'Knowledge Graph' })}><KnowledgeGraphPanel /></LazyPanel>
    if (activeTool === 'intervention') return <LazyPanel label={t('toolbar.intervention', { defaultValue: '干预' })}><InterventionPanel /></LazyPanel>
    if (activeTool === 'milestones') return <LazyPanel label={t('toolbar.milestones', { defaultValue: '里程碑' })}><MilestonePanel /></LazyPanel>
    if (activeTool === 'dreams') return <LazyPanel label={t('toolbar.dreams', { defaultValue: '梦想面板' })}><DreamPanel /></LazyPanel>
    if (activeTool === 'gangs') return <LazyPanel label={t('toolbar.gangs', { defaultValue: '势力面板' })}><GangPanel /></LazyPanel>
    if (activeTool === 'market') return <LazyPanel label={t('toolbar.market', { defaultValue: '市场行情' })}><MarketPanel /></LazyPanel>
    if (activeTool === 'personality') return <LazyPanel label={t('toolbar.personality', { defaultValue: '个性面板' })}><PersonalityPanel /></LazyPanel>
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

      {panel && (
        <div
          key={activeTool}
          className="animate-[slideInRight_250ms_ease-out]"
        >
          {panel}
        </div>
      )}
    </div>
  )
}

function PanelLoading({ label }: { label: string }) {
  return <PanelSpinner title={label} message="模块正在按需加载…" />
}

function LazyPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return <Suspense fallback={<PanelLoading label={label} />}>{children}</Suspense>
}
