import { Suspense, lazy, useEffect, useState } from 'react'
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

  const time = useSimulationStore((s) => s.time)
  const weather = useSimulationStore((s) => s.weather)
  const season = useSimulationStore((s) => s.season)
  const residents = useSimulationStore((s) => s.residents)
  const buildings = useSimulationStore((s) => s.buildings)

  const isZh = i18n.language === 'zh'
  const weatherEmoji = WEATHER_EMOJI[weather] ?? WEATHER_EMOJI.sunny
  const seasonEmoji = SEASON_EMOJI[season] ?? SEASON_EMOJI.spring
  const seasonLabel = isZh ? (SEASON_LABEL_ZH[season] ?? season) : season

  if (!hasInitialSnapshot) {
    return <LoadingTransition onRetry={retry} timedOut={startupTimedOut} />
  }

  return (
    <div className="fixed inset-0 bg-slate-950">
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
      <div className="fixed left-4 top-4 z-20 pointer-events-auto">
        <div className="rounded-2xl border border-white/10 bg-slate-950/75 px-4 py-3 text-sm text-slate-200 shadow-lg backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-cyan-300">POPULACE</span>
            <span className="text-slate-500">{'\u00B7'}</span>
            <span className="text-xs text-slate-400">{time}</span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
            <span>{weatherEmoji} {weather}</span>
            <span>{seasonEmoji} {seasonLabel}</span>
            <span>{residents.length} {isZh ? '\u5C45\u6C11' : 'residents'}</span>
            <span>{buildings.length} {isZh ? '\u5EFA\u7B51' : 'buildings'}</span>
          </div>
        </div>
      </div>

      {/* -- TOP-RIGHT: Settings icons -- */}
      <div className="fixed right-4 top-4 z-20 flex items-center gap-2 pointer-events-auto">
        <SoundToggleButton />
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      {/* -- BOTTOM-LEFT: Message Feed -- */}
      <div className="fixed bottom-20 left-4 z-20 w-80 pointer-events-auto">
        <MessageBar />
      </div>

      {/* -- BOTTOM-CENTER: Quick Action Bar -- */}
      <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-white/10 bg-slate-950/80 px-2 py-2 shadow-xl backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setShowToolbar((v) => !v)}
            className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/20"
          >
            {'\u26A1'} {t('toolbar.director')}
          </button>
          <button
            type="button"
            onClick={() => { setShowToolbar(true); window.dispatchEvent(new CustomEvent('populace:open-persona')) }}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            {'\uD83D\uDC64'} {t('toolbar.persona')}
          </button>
          <button
            type="button"
            onClick={() => { setShowToolbar(true); window.dispatchEvent(new CustomEvent('populace:open-quest')) }}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            {'\uD83C\uDFAF'} {t('toolbar.quest')}
          </button>
          <button
            type="button"
            onClick={() => { setShowToolbar(true); window.dispatchEvent(new CustomEvent('populace:open-report')) }}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            {'\uD83D\uDCF0'} {t('toolbar.report')}
          </button>

          <div className="mx-1 h-6 w-px bg-white/10" />

          <button
            type="button"
            onClick={() => setShowGraph((v) => !v)}
            className={`rounded-xl border px-3 py-2 text-sm transition ${showGraph ? 'border-amber-300/40 bg-amber-300/15 text-amber-50' : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'}`}
          >
            {'\uD83D\uDD78\uFE0F'} {t('app.relationship_graph')}
          </button>

          <div className="mx-1 h-6 w-px bg-white/10" />

          <SpeedControl />
        </div>
      </div>

      {/* -- RIGHT DRAWER: Graph Panel -- */}
      <div
        className={`fixed right-0 top-0 bottom-0 z-30 w-96 transform transition-transform duration-300 ${showGraph ? 'translate-x-0' : 'translate-x-full'} pointer-events-auto`}
      >
        <div className="h-full border-l border-white/10 bg-slate-950/90 p-4 backdrop-blur-md">
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
            onClick={() => setShowToolbar(false)}
            className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-[2px]"
            aria-label={t('app.close')}
          />
          <div className="fixed inset-x-0 bottom-16 z-40 flex justify-center pointer-events-none">
            <div className="pointer-events-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-md mx-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-white">{t('app.open_tools')}</span>
                <button
                  type="button"
                  onClick={() => setShowToolbar(false)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400 transition hover:bg-white/10 hover:text-white"
                >
                  {'\u2715'} {t('app.close')}
                </button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                <Toolbar />
              </div>
            </div>
          </div>
        </>
      )}

      {/* -- Connection indicator -- */}
      <div
        className={[
          'fixed bottom-4 right-4 z-20 rounded-full px-3 py-1 text-xs font-medium transition-colors pointer-events-auto',
          connected
            ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 connection-pulse'
            : 'border border-amber-400/30 bg-amber-400/10 text-amber-300',
        ].join(' ')}
      >
        {connected ? t('app.connected') : t('app.connecting')}
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
