import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FirstRunGuide } from '../components/ui/FirstRunGuide'
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher'
import { LoadingTransition } from '../components/ui/LoadingTransition'
import { MessageBar } from '../components/ui/MessageBar'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { SplitPane } from '../components/ui/SplitPane'
import { OnboardingDrama } from '../components/ui/OnboardingDrama'
import { TutorialOverlay } from '../components/ui/TutorialOverlay'
import { KeyboardShortcutsPanel } from '../components/ui/KeyboardShortcutsPanel'
import { GlobalSearch } from '../components/ui/GlobalSearch'
import { NotificationCenter } from '../components/ui/NotificationCenter'
import { ScreenshotButton, ShareCardButton } from '../components/ui/ScreenshotShare'
import { SoundToggleButton } from '../components/toolbar/SoundToggleButton'
import { SpeedControl } from '../components/toolbar/SpeedControl'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useWebSocket } from '../hooks/useWebSocket'
import { useSimulationStore } from '../stores/simulation'

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

const Toolbar = lazy(() =>
  import('../components/toolbar/Toolbar').then((module) => ({ default: module.Toolbar })),
)
const RightPanel = lazy(() =>
  import('../components/ui/RightPanel').then((module) => ({ default: module.RightPanel })),
)
const TownCanvas = lazy(() =>
  import('../components/town/TownCanvas').then((module) => ({ default: module.TownCanvas })),
)

function ShellLoading({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-40 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/70 px-6 py-8">
      <div className="flex items-center gap-3 text-sm text-slate-300">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-300/70 border-t-transparent" />
        <span>{label}</span>
      </div>
    </div>
  )
}

export function SimulationView() {
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
  const currentFestival = useSimulationStore((s) => s.currentFestival)

  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('populace:onboarding_done'),
  )
  const [showToolbar, setShowToolbar] = useState(false)
  const [activeQuickTool, setActiveQuickTool] = useState<string | null>(null)

  const isPaused = speed === 0

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
  const festivalSummary = currentFestival
    ? ({
        spring: '全镇集会与舞蹈正在展开',
        summer: '户外聚餐让社交节奏明显提速',
        autumn: '分享物品与感恩问候正在传递',
        winter: '围炉夜话让家人重新聚在一起',
        birthday: '小范围生日庆祝正在进行',
        achievement: '成就庆典吸引亲友围拢祝贺',
      }[currentFestival.type] ?? '镇上的庆典正在进行')
    : null

  if (!hasInitialSnapshot) {
    return <LoadingTransition onRetry={retry} timedOut={startupTimedOut} />
  }

  const mapArea = (
    <div className="relative h-full w-full overflow-hidden">
      <div
        className={`absolute inset-0 transition-[filter] duration-500 ${isPaused ? 'grayscale' : ''}`}
        role="region"
        aria-label={t('app.map_region')}
        tabIndex={2}
      >
        <Suspense fallback={<ShellLoading label={t('app.loading_map', { defaultValue: '地图加载中…' })} />}>
          <TownCanvas />
        </Suspense>
      </div>

      {isPaused && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="animate-[fadeIn_300ms_ease-out] rounded-2xl border border-white/10 bg-slate-950/60 px-8 py-4 shadow-2xl backdrop-blur-sm">
            <span className="text-lg font-bold uppercase tracking-[0.3em] text-white/70">
              {t('app.paused')}
            </span>
          </div>
        </div>
      )}

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

      {currentFestival && festivalSummary ? (
        <div className="pointer-events-none absolute inset-x-0 top-14 z-20 flex justify-center px-3">
          <div className="pointer-events-auto flex max-w-2xl items-center gap-3 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-amber-50 shadow-lg backdrop-blur-md">
            <span className="text-xl">🎉</span>
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-amber-100/70">Festival Live</p>
              <p className="text-sm font-semibold">{currentFestival.name}</p>
              <p className="text-xs text-amber-100/80">{festivalSummary}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-16 left-3 z-20 hidden w-72 sm:bottom-14 sm:block">
        <MessageBar />
      </div>

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
                <Suspense fallback={<ShellLoading label={t('app.loading_tools', { defaultValue: '工具面板加载中…' })} />}>
                  <Toolbar />
                </Suspense>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-950 animate-[fadeIn_600ms_ease-out]">
      <header className="relative z-30 flex h-10 shrink-0 items-center justify-between border-b border-white/8 bg-slate-950/90 px-3 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-cyan-300/80">
            POPULACE
          </span>
        </div>

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

      <div className="relative min-h-0 flex-1">
        <SplitPane
          left={mapArea}
          right={(
            <Suspense fallback={<ShellLoading label={t('app.loading_panels', { defaultValue: '侧边面板加载中…' })} />}>
              <RightPanel />
            </Suspense>
          )}
          defaultRatio={65}
          minLeftRatio={45}
          minRightRatio={20}
          storageKey="populace:main-split-ratio"
        />
      </div>

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
