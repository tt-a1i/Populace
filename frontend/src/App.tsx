import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Toolbar } from './components/toolbar/Toolbar'
import {
  FirstRunGuide,
  LanguageSwitcher,
  LoadingTransition,
  MessageBar,
  ScenePicker,
  ThemeToggle,
  WelcomePage,
} from './components/ui'
import { OnboardingDrama } from './components/ui/OnboardingDrama'
import { TutorialOverlay } from './components/ui/TutorialOverlay'
import { SoundToggleButton } from './components/toolbar/SoundToggleButton'
import { SpeedControl } from './components/toolbar/SpeedControl'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useWebSocket } from './hooks/useWebSocket'
import { useSimulationStore } from './stores/simulation'
import { useThemeStore } from './stores/theme'

const WEATHER_EMOJI: Record<string, string> = {
  sunny: '\u2600\uFE0F',
  cloudy: '\u26C5',
  rainy: '\uD83C\uDF27\uFE0F',
  stormy: '\u26C8\uFE0F',
  snowy: '\u2744\uFE0F',
}

const SEASON_EMOJI: Record<string, string> = {
  spring: '\uD83C\uDF38',
  summer: '\u2600\uFE0F',
  autumn: '\uD83C\uDF42',
  winter: '\u2744\uFE0F',
}

const SEASON_LABEL_ZH: Record<string, string> = {
  spring: '\u6625\u5929',
  summer: '\u590F\u5929',
  autumn: '\u79CB\u5929',
  winter: '\u51AC\u5929',
}

const TownCanvas = lazy(() =>
  import('./components/town/TownCanvas').then((module) => ({ default: module.TownCanvas })),
)
const GraphPanel = lazy(() =>
  import('./components/graph/GraphPanel').then((module) => ({ default: module.GraphPanel })),
)

type AppPage = 'welcome' | 'picking' | 'simulation'

function SimulationView() {
  const { t, i18n } = useTranslation()
  const {
    connected,
    disconnected,
    hasInitialSnapshot,
    startupTimedOut,
    reconnectCountdown,
    maxRetriesExceeded,
    retry,
  } = useWebSocket()
  useKeyboardShortcuts(true)

  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('populace:onboarding_done'),
  )
  const [showGraph, setShowGraph] = useState(false)
  const [showToolbar, setShowToolbar] = useState(false)
  const [activeQuickTool, setActiveQuickTool] = useState<string | null>(null)

  // Auto-close graph drawer when resident sidebar opens
  const prevSelectedRef = useRef(selectedResidentId)
  if (selectedResidentId && selectedResidentId !== prevSelectedRef.current && showGraph) {
    setShowGraph(false)
  }
  prevSelectedRef.current = selectedResidentId

  const toggleTool = (tool: string, eventName?: string) => {
    if (showToolbar && activeQuickTool === tool) {
      setShowToolbar(false)
      setActiveQuickTool(null)
    } else {
      setShowToolbar(true)
      setActiveQuickTool(tool)
      if (eventName) {
        window.dispatchEvent(new CustomEvent(eventName))
      }
    }
  }

  const selectedResidentId = useSimulationStore((s) => s.selectedResidentId)
  const time = useSimulationStore((s) => s.time)
  const weather = useSimulationStore((s) => s.weather)
  const season = useSimulationStore((s) => s.season)


  const isZh = i18n.language === 'zh'
  const weatherEmoji = WEATHER_EMOJI[weather] ?? WEATHER_EMOJI.sunny
  const seasonEmoji = SEASON_EMOJI[season] ?? SEASON_EMOJI.spring
  const seasonLabel = isZh ? (SEASON_LABEL_ZH[season] ?? season) : season

  if (!hasInitialSnapshot) {
    return <LoadingTransition onRetry={retry} timedOut={startupTimedOut} />
  }

  return (
    <div className="fixed inset-0 bg-slate-950 animate-[fadeIn_600ms_ease-out]">
      {/* -- FULLSCREEN MAP -- */}
      <div className="absolute inset-0">
        <Suspense fallback={null}>
          <TownCanvas />
        </Suspense>
      </div>

      {/* -- Disconnected overlay -- */}
      {disconnected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 backdrop-blur-md">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-slate-900/90 px-10 py-9 shadow-2xl">
            {maxRetriesExceeded ? (
              <>
                <span className="text-2xl">{'\u26A0\uFE0F'}</span>
                <div className="text-center">
                  <p className="text-[11px] uppercase tracking-[0.34em] text-amber-100/70">Connection Failed</p>
                  <p className="mt-3 text-base font-medium text-amber-50">{t('app.conn_failed')}</p>
                  <button
                    type="button"
                    onClick={retry}
                    className="mt-4 rounded-full border border-amber-400/30 bg-amber-400/10 px-5 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-400/20"
                  >
                    {t('app.reconnect')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-300/90 border-t-transparent" />
                <div className="text-center">
                  <p className="text-[11px] uppercase tracking-[0.34em] text-cyan-100/70">Connection Interrupted</p>
                  <p className="mt-3 text-base font-medium text-cyan-50">
                    {reconnectCountdown > 0 ? t('app.reconnecting', { seconds: reconnectCountdown }) : t('app.conn_interrupted')}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* -- TOP-LEFT HUD: Status -- */}
      <div className="fixed left-3 top-3 z-20 pointer-events-auto">
        <div className="rounded-xl border border-white/8 bg-slate-950/65 px-3 py-2 shadow-lg backdrop-blur-sm">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="font-mono font-bold uppercase tracking-wider text-cyan-300/80">POPULACE</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">{time}</span>
            <span className="text-slate-600">|</span>
            <span>{weatherEmoji}</span>
            <span>{seasonEmoji} {seasonLabel}</span>
          </div>
        </div>
      </div>

      {/* -- TOP-RIGHT: Settings icons -- */}
      <div className="fixed right-3 top-3 z-20 flex items-center gap-1.5 pointer-events-auto">
        <SoundToggleButton />
        <LanguageSwitcher />
        <ThemeToggle />
        <button
          type="button"
          onClick={() => { setShowToolbar(true); setActiveQuickTool('settings'); window.dispatchEvent(new CustomEvent('populace:open-settings')) }}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
          title={t('toolbar.settings')}
        >
          {'\u2699\uFE0F'}
        </button>
      </div>

      {/* -- BOTTOM-LEFT: Message Feed (hidden on small screens) -- */}
      <div className="fixed bottom-14 left-3 z-20 hidden w-72 pointer-events-none sm:block">
        <MessageBar />
      </div>

      {/* -- BOTTOM-CENTER: Quick Action Bar -- */}
      <div className="fixed inset-x-0 bottom-3 z-30 flex justify-center pointer-events-none px-3">
        <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-white/10 bg-slate-950/80 px-1.5 py-1.5 shadow-xl backdrop-blur-sm">
          {[
            { key: 'director', icon: '\u26A1', event: 'populace:open-director' },
            { key: 'persona', icon: '\uD83D\uDC64', event: 'populace:open-persona' },
            { key: 'quest', icon: '\uD83C\uDFAF', event: 'populace:open-quest' },
            { key: 'report', icon: '\uD83D\uDCF0', event: 'populace:open-report' },
          ].map((tool) => (
            <button
              key={tool.key}
              type="button"
              onClick={() => toggleTool(tool.key, tool.event)}
              title={t(`toolbar.${tool.key}`)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                showToolbar && activeQuickTool === tool.key
                  ? 'border-cyan-300/40 bg-cyan-300/15 text-cyan-50'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {tool.icon}<span className="ml-1 hidden sm:inline">{t(`toolbar.${tool.key}`)}</span>
            </button>
          ))}

          <div className="mx-0.5 h-5 w-px bg-white/10" />

          <button
            type="button"
            onClick={() => setShowGraph((v) => !v)}
            className={`rounded-lg border px-2 py-1.5 text-xs transition ${showGraph ? 'border-amber-300/40 bg-amber-300/15 text-amber-50' : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'}`}
            title={t('app.relationship_graph')}
          >
            {'\uD83D\uDD78\uFE0F'}
          </button>

          <div className="mx-0.5 h-5 w-px bg-white/10 hidden sm:block" />

          <div className="hidden sm:flex">
            <SpeedControl />
          </div>
        </div>
      </div>

      {/* -- RIGHT DRAWER: Graph Panel -- */}
      <div
        className={`fixed right-0 top-0 bottom-0 z-30 w-full transform transition-transform duration-300 sm:w-96 ${showGraph ? 'translate-x-0' : 'translate-x-full'} pointer-events-auto`}
      >
        <div className="h-full border-l border-white/10 bg-slate-950/92 p-3 backdrop-blur-md sm:p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">{t('app.relationship_graph')}</h3>
            <button
              type="button"
              onClick={() => setShowGraph(false)}
              className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              {'\u2715'}
            </button>
          </div>
          <Suspense fallback={null}>
            <GraphPanel />
          </Suspense>
        </div>
      </div>

      {/* -- TOOL PANEL DRAWER -- */}
      {showToolbar && (
        <>
          <button
            type="button"
            onClick={() => { setShowToolbar(false); setActiveQuickTool(null) }}
            className="fixed inset-0 z-30 bg-black/20"
            aria-label={t('app.close')}
          />
          <div className="fixed inset-x-0 bottom-12 z-40 flex justify-center pointer-events-none animate-[slideUp_200ms_ease-out] sm:bottom-14">
            <div className="pointer-events-auto w-full max-w-2xl rounded-xl border border-white/10 bg-slate-950/92 p-2 shadow-2xl backdrop-blur-md mx-2 sm:mx-3 sm:p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">{activeQuickTool ? t(`toolbar.${activeQuickTool}`) : t('app.open_tools')}</span>
                <button
                  type="button"
                  onClick={() => { setShowToolbar(false); setActiveQuickTool(null) }}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400 transition hover:bg-white/10 hover:text-white"
                >
                  {'\u2715'} {t('app.close')}
                </button>
              </div>
              <div className="max-h-[50vh] overflow-y-auto">
                <Toolbar />
              </div>
            </div>
          </div>
        </>
      )}

      {/* -- Connection indicator (top-left, below HUD) -- */}
      <div
        className={[
          'fixed left-3 top-11 z-20 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors pointer-events-none',
          connected
            ? 'text-emerald-400/60'
            : 'text-amber-400/70',
        ].join(' ')}
      >
        {connected ? '\u25CF' : '\u25CB'}
      </div>

      {/* -- Onboarding + tutorial -- */}
      {hasInitialSnapshot && showOnboarding && (
        <OnboardingDrama
          onComplete={() => {
            localStorage.setItem('populace:onboarding_done', '1')
            setShowOnboarding(false)
          }}
        />
      )}
      {!showOnboarding && <FirstRunGuide enabled={hasInitialSnapshot} />}
      {!showOnboarding && hasInitialSnapshot && <TutorialOverlay />}
    </div>
  )
}

function App() {
  const [page, setPage] = useState<AppPage>('welcome')
  const theme = useThemeStore((s) => s.theme)

  // Apply / remove theme-light class on <html> for CSS overrides
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('theme-light')
    } else {
      document.documentElement.classList.remove('theme-light')
    }
  }, [theme])

  if (page === 'welcome') {
    return <WelcomePage onStart={() => setPage('picking')} />
  }

  if (page === 'picking') {
    return (
      <ScenePicker
        onEnter={() => setPage('simulation')}
        onBack={() => setPage('welcome')}
      />
    )
  }

  return <SimulationView />
}

export default App
