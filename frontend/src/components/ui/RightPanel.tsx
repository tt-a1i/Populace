import { Suspense, lazy, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

const GraphPanel = lazy(() =>
  import('../graph/GraphPanel').then((module) => ({ default: module.GraphPanel })),
)
const TimelinePanel = lazy(() =>
  import('../toolbar/TimelinePanel').then((module) => ({ default: module.TimelinePanel })),
)
const StatsPanel = lazy(() =>
  import('../toolbar/StatsPanel').then((module) => ({ default: module.StatsPanel })),
)

type TabKey = 'graph' | 'timeline' | 'stats'

interface TabDef {
  key: TabKey
  icon: string
  labelKey: string
}

const TABS: TabDef[] = [
  { key: 'graph', icon: '\uD83D\uDD78\uFE0F', labelKey: 'app.tab_graph' },
  { key: 'timeline', icon: '\uD83D\uDCC5', labelKey: 'app.tab_timeline' },
  { key: 'stats', icon: '\uD83D\uDCCA', labelKey: 'app.tab_stats' },
]

function PanelFallback() {
  return (
    <div className="flex h-32 items-center justify-center text-sm text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-300/60 border-t-transparent" />
    </div>
  )
}

export function RightPanel() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabKey>('graph')

  const panels: Record<TabKey, ReactNode> = {
    graph: (
      <Suspense fallback={<PanelFallback />}>
        <GraphPanel />
      </Suspense>
    ),
    timeline: (
      <Suspense fallback={<PanelFallback />}>
        <TimelinePanel />
      </Suspense>
    ),
    stats: (
      <Suspense fallback={<PanelFallback />}>
        <StatsPanel />
      </Suspense>
    ),
  }

  return (
    <div className="flex h-full flex-col border-l border-white/10 bg-slate-950/92 backdrop-blur-md">
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-white/8 px-1 pt-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            aria-pressed={activeTab === tab.key}
            className={[
              'relative flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-medium transition duration-200',
              activeTab === tab.key
                ? 'bg-white/8 text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
            ].join(' ')}
          >
            <span aria-hidden="true">{tab.icon}</span>
            <span>{t(tab.labelKey)}</span>
            {activeTab === tab.key && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-cyan-400/70" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content with transition */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 animate-[fadeIn_200ms_ease-out]" key={activeTab}>
        {panels[activeTab]}
      </div>
    </div>
  )
}
