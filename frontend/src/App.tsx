import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { GuidePage } from './pages/GuidePage'
import { Toolbar } from './components/toolbar/Toolbar'
import {
  FirstRunGuide,
  LanguageSwitcher,
  LoadingTransition,
  MessageBar,
  RightPanel,
  ScenePicker,
  ThemeToggle,
  WelcomePage,
} from './components/ui'
import { SplitPane } from './components/ui/SplitPane'
import { OnboardingDrama } from './components/ui/OnboardingDrama'
import { TutorialOverlay } from './components/ui/TutorialOverlay'
import { KeyboardShortcutsPanel } from './components/ui/KeyboardShortcutsPanel'
import { GlobalSearch } from './components/ui/GlobalSearch'
import { NotificationCenter } from './components/ui/NotificationCenter'
import { ScreenshotButton, ShareCardButton } from './components/ui/ScreenshotShare'
import { SoundToggleButton } from './components/toolbar/SoundToggleButton'
import { SpeedControl } from './components/toolbar/SpeedControl'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useWebSocket } from './hooks/useWebSocket'
import { useSimulationStore } from './stores/simulation'
import { THEME_ACCENTS, useThemeStore } from './stores/theme'

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

const TownCanvas = lazy(() =>
  import('./components/town/TownCanvas').then((module) => ({ default: module.TownCanvas })),
)

type AppPage = 'welcome' | 'picking' | 'guide' | 'simulation'

function SimulationView() {
  const { t } = useTranslation()
  const {
    connected,
    connectionCount,
    disconnected,
    hasInitialSnapshot,
    startupTimedOut,
    reconnectCountdown,
    maxRetriesExceeded,
    retry,
  } = useWebSocket()
  useKeyboardShortcuts(true)

  const time = useSimulationStore((s) => s.time)
  const weather = useSimulationStore((s) => s.weather)
  const season = useSimulationStore((s) => s.season)
  const speed = useSimulationStore((s) => s.speed)

  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('populace:onboarding_done'),
  )
  const [showToolbar, setShowToolbar] = useState(false)
  const [activeQuickTool, setActiveQuickTool] = useState<string | null>(null)

  const isPaused = speed === 0

  // Escape closes toolbar drawer
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (showToolbar) {
        setShowToolbar(false)
        setActiveQuickTool(null)
        e.stopPropagation()
      }
    },
    [showToolbar],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleEscape, true)
    return () => window.removeEventListener('keydown', handleEscape, true)
  }, [handleEscape])

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

  const weatherEmoji = WEATHER_EMOJI[weather] ?? WEATHER_EMOJI.sunny
  const seasonEmoji = SEASON_EMOJI[season] ?? SEASON_EMOJI.spring
  const seasonLabel = t(`app.season_${season}`, season)

  if (!hasInitialSnapshot) {
    return <LoadingTransition onRetry={retry} timedOut={startupTimedOut} />
  }

  const mapArea = (
    <div className="relative h-full w-full overflow-hidden">
      {/* Fullscreen Map */}
      <div
        className={`absolute inset-0 transition-[filter] duration-500 ${isPaused ? 'grayscale' : ''}`}
        role="region"
        aria-label={t('app.map_region')}
        tabIndex={2}
      >
        <Suspense fallback={null}>
          <TownCanvas />
        </Suspense>
      </div>

      {/* Paused overlay */}
      {isPaused && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="animate-[fadeIn_300ms_ease-out] rounded-2xl border border-white/10 bg-slate-950/60 px-8 py-4 shadow-2xl backdrop-blur-sm">
            <span className="text-lg font-bold uppercase tracking-[0.3em] text-white/70">
              {t('app.paused')}
            </span>
          </div>
        </div>
      )}

      {/* TOP-LEFT HUD: Glassmorphism status bar */}
      <div className="pointer-events-auto absolute left-3 top-3 z-20">
        <div className="flex items-center gap-0 rounded-xl border border-white/10 bg-slate-950/50 shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-2 px-3 py-2 text-[11px]">
            <span className="text-slate-300">{time}</span>
            <span className="text-white/15">|</span>
            <span title={seasonLabel}>{seasonEmoji}</span>
            <span>{weatherEmoji}</span>
            <span className="text-white/15">|</span>
            <SpeedControl variant="compact" />
          </div>
        </div>
      </div>

      {/* BOTTOM-LEFT: Message Feed (hidden on small screens) */}
      <div className="pointer-events-none absolute bottom-16 left-3 z-20 hidden w-72 sm:bottom-14 sm:block">
        <MessageBar />
      </div>

      {/* BOTTOM: Mobile tab bar / Desktop floating toolbar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center sm:bottom-3 sm:px-3">
        <div
          className="pointer-events-auto flex w-full items-stretch border-t border-white/10 bg-slate-950/85 backdrop-blur-md sm:w-auto sm:max-w-full sm:gap-1 sm:rounded-2xl sm:border sm:px-1.5 sm:py-1.5 sm:shadow-xl"
          role="toolbar"
          aria-label={t('app.toolbar_region')}
          tabIndex={1}
        >
          {[
            { key: 'director', icon: '\u26A1', event: 'populace:open-director' },
            { key: 'persona', icon: '\uD83D\uDC64', event: 'populace:open-persona' },
            { key: 'quest', icon: '\uD83C\uDFAF', event: 'populace:open-quest' },
            { key: 'report', icon: '\uD83D\uDCF0', event: 'populace:open-report' },
            { key: 'settings', icon: '\u2699\uFE0F', event: 'populace:open-settings' },
          ].map((tool) => {
            const isActive = showToolbar && activeQuickTool === tool.key
            return (
              <button
                key={tool.key}
                type="button"
                onClick={() => toggleTool(tool.key, tool.event)}
                aria-pressed={isActive}
                aria-label={t(`toolbar.${tool.key}`)}
                title={t(`toolbar.${tool.key}`)}
                className={[
                  'flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition duration-200 active:scale-95',
                  'sm:flex-none sm:flex-row sm:gap-1 sm:rounded-lg sm:border sm:px-2.5 sm:py-1.5 sm:text-xs',
                  isActive
                    ? 'text-white theme-accent-button-active'
                    : 'text-slate-400 hover:text-white sm:border-white/10 sm:bg-white/5 sm:text-slate-300 sm:hover:bg-white/10',
                ].join(' ')}
              >
                <span aria-hidden="true" className="text-lg leading-none sm:text-sm">{tool.icon}</span>
                <span className="sm:hidden">{t(`toolbar.${tool.key}`)}</span>
                <span className="hidden sm:inline">{t(`toolbar.${tool.key}`)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* TOOL PANEL DRAWER */}
      {showToolbar && (
        <>
          <button
            type="button"
            onClick={() => {
              setShowToolbar(false)
              setActiveQuickTool(null)
            }}
            className="absolute inset-0 z-30 bg-black/20"
            aria-label={t('app.close')}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-[3.25rem] z-40 flex animate-[slideUp_200ms_ease-out] justify-center sm:bottom-14">
            <div
              className="pointer-events-auto w-full rounded-t-2xl border border-b-0 border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-md sm:mx-3 sm:max-w-2xl sm:rounded-xl sm:border-b sm:p-3"
              role="region"
              aria-label={t('app.panel_region')}
              tabIndex={4}
            >
              {/* Drag handle (mobile) */}
              <div className="mb-2 flex justify-center sm:hidden">
                <div className="h-1 w-10 rounded-full bg-white/20" />
              </div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">
                  {activeQuickTool ? t(`toolbar.${activeQuickTool}`) : t('app.open_tools')}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowToolbar(false)
                    setActiveQuickTool(null)
                  }}
                  aria-label={t('app.close')}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400 transition duration-200 hover:bg-white/10 hover:text-white active:scale-95"
                >
                  {'\u2715'} {t('app.close')}
                </button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto sm:max-h-[50vh]">
                <Toolbar />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-950 animate-[fadeIn_600ms_ease-out]">
      {/* ── HEADER BAR ── */}
      <header className="relative z-30 flex h-10 shrink-0 items-center justify-between border-b border-white/8 bg-slate-950/90 px-3 backdrop-blur-sm">
        {/* Left: Logo */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-cyan-300/80">
            POPULACE
          </span>
        </div>

        {/* Right: Connection + online + settings */}
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1.5 text-[10px] font-medium ${connected ? 'text-emerald-400/80' : 'animate-pulse text-amber-400/80'}`}
            title={connected ? t('ws.reconnected') : t('ws.connection_lost')}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`}
            />
            <span>{connected ? t('app.connected') : t('app.disconnected_short')}</span>
          </div>
          <span className="text-[10px] text-slate-500">|</span>
          <span className="text-[10px] text-slate-400">
            {t('app.online_count', { count: connectionCount })}
          </span>
          <span className="text-[10px] text-slate-500">|</span>
          <SoundToggleButton />
          <LanguageSwitcher />
          <ThemeToggle />
          <ScreenshotButton />
          <ShareCardButton />
          <NotificationCenter />
          <button
            type="button"
            onClick={() => {
              setShowToolbar(true)
              setActiveQuickTool('settings')
              window.dispatchEvent(new CustomEvent('populace:open-settings'))
            }}
            className="theme-accent-focus flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[11px] text-slate-300 transition duration-200 hover:bg-white/10 hover:text-white active:scale-95"
            title={t('toolbar.settings')}
            aria-label={t('toolbar.settings')}
          >
            {'\u2699\uFE0F'}
          </button>
        </div>
      </header>

      {/* ── MAIN CONTENT: Split Pane ── */}
      <div className="relative min-h-0 flex-1">
        <SplitPane
          left={mapArea}
          right={<RightPanel />}
          defaultRatio={65}
          minLeftRatio={45}
          minRightRatio={20}
          storageKey="populace:main-split-ratio"
        />
      </div>

      {/* ── Disconnected overlay ── */}
      {disconnected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 backdrop-blur-md">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-slate-900/90 px-10 py-9 shadow-2xl">
            {maxRetriesExceeded ? (
              <>
                <span className="text-2xl">{'\u26A0\uFE0F'}</span>
                <div className="text-center">
                  <p className="text-[11px] uppercase tracking-[0.34em] text-amber-100/70">
                    {t('app.conn_failed_badge')}
                  </p>
                  <p className="mt-3 text-base font-medium text-amber-50">
                    {t('app.conn_failed')}
                  </p>
                  <button
                    type="button"
                    onClick={retry}
                    className="mt-4 rounded-full border border-amber-400/30 bg-amber-400/10 px-5 py-2 text-sm font-medium text-amber-200 transition duration-200 hover:bg-amber-400/20 active:scale-95"
                  >
                    {t('app.reconnect')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-300/90 border-t-transparent" />
                <div className="text-center">
                  <p className="text-[11px] uppercase tracking-[0.34em] text-cyan-100/70">
                    {t('app.conn_interrupted_badge')}
                  </p>
                  <p className="mt-3 text-base font-medium text-cyan-50">
                    {reconnectCountdown > 0
                      ? t('app.reconnecting', { seconds: reconnectCountdown })
                      : t('app.conn_interrupted')}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Onboarding + tutorial ── */}
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
      {hasInitialSnapshot && <KeyboardShortcutsPanel />}
      {hasInitialSnapshot && <GlobalSearch />}
    </div>
  )
}

function App() {
  const [page, setPage] = useState<AppPage>('welcome')
  const theme = useThemeStore((s) => s.theme)
  const accent = useThemeStore((s) => s.accent)
  const lastPageRef = useRef<Exclude<AppPage, 'guide'>>('welcome')

  const openGuide = useCallback((source: Exclude<AppPage, 'guide'>) => {
    lastPageRef.current = source
    setPage('guide')
  }, [])

  useEffect(() => {
    const handleOpenGuide = () => {
      setPage((current) => {
        if (current === 'guide') {
          return current
        }
        lastPageRef.current = current
        return 'guide'
      })
    }

    window.addEventListener('populace:open-guide', handleOpenGuide)
    return () => window.removeEventListener('populace:open-guide', handleOpenGuide)
  }, [])

  // Apply / remove theme-light class on <html> for CSS overrides
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('theme-light')
    } else {
      document.documentElement.classList.remove('theme-light')
    }
  }, [theme])

  useEffect(() => {
    const palette = THEME_ACCENTS[accent]
    document.documentElement.style.setProperty('--primary-color', palette.hex)
    document.documentElement.style.setProperty('--primary-color-rgb', palette.rgb)
    document.documentElement.style.setProperty('--primary-color-soft-text', palette.softText)
  }, [accent])

  if (page === 'welcome') {
    return (
      <div key="welcome" className="animate-[pageEnter_400ms_ease-out]">
        <WelcomePage onStart={() => setPage('picking')} onGuide={() => openGuide('welcome')} />
      </div>
    )
  }

  if (page === 'picking') {
    return (
      <div key="picking" className="animate-[pageEnter_400ms_ease-out]">
        <ScenePicker onEnter={() => setPage('simulation')} onBack={() => setPage('welcome')} />
      </div>
    )
  }

  if (page === 'guide') {
    return (
      <div key="guide" className="animate-[pageEnter_400ms_ease-out]">
        <GuidePage onBack={() => setPage(lastPageRef.current)} />
      </div>
    )
  }

  return (
    <div key="simulation" className="animate-[pageEnter_400ms_ease-out]">
      <SimulationView />
    </div>
  )
}

export default App
