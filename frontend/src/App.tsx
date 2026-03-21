import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Toolbar } from './components/toolbar/Toolbar'
import {
  FirstRunGuide,
  LoadingTransition,
  ScenePicker,
  SplitPane,
  ThemeToggle,
  WelcomePage,
} from './components/ui'
import { TutorialOverlay } from './components/ui/TutorialOverlay'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useWebSocket } from './hooks/useWebSocket'
import { getLlmKeyStatus } from './services/api'
import { useThemeStore } from './stores/theme'

function ApiKeyBanner() {
  const { t } = useTranslation()
  const [show, setShow] = useState(false)

  useEffect(() => {
    getLlmKeyStatus()
      .then((s) => { if (!s.configured) setShow(true) })
      .catch(() => {})
  }, [])

  if (!show) return null

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-200">
      <span>{t('api_key_banner.message')}</span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('populace:open-settings'))}
          className="rounded-full border border-amber-300/30 bg-amber-300/15 px-3 py-1 text-xs font-medium text-amber-100 transition hover:bg-amber-300/25"
        >
          {t('api_key_banner.action')}
        </button>
        <button
          type="button"
          onClick={() => setShow(false)}
          aria-label="Dismiss"
          className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-400 transition hover:bg-white/10"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

const TownCanvas = lazy(() =>
  import('./components/town/TownCanvas').then((module) => ({ default: module.TownCanvas })),
)
const GraphPanel = lazy(() =>
  import('./components/graph/GraphPanel').then((module) => ({ default: module.GraphPanel })),
)

type AppPage = 'welcome' | 'picking' | 'simulation'
type MobilePane = 'town' | 'graph'

function useIsMobileViewport(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.innerWidth < breakpoint
  })

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const update = () => {
      setIsMobile(mediaQuery.matches)
    }

    update()
    mediaQuery.addEventListener('change', update)
    return () => {
      mediaQuery.removeEventListener('change', update)
    }
  }, [breakpoint])

  return isMobile
}

function PanelFallback({ tone, title }: { tone: 'amber' | 'cyan'; title: string }) {
  const borderTone = tone === 'cyan' ? 'border-cyan-300/25' : 'border-amber-200/25'
  const textTone = tone === 'cyan' ? 'text-cyan-100/70' : 'text-amber-100/70'

  return (
    <div
      className={[
        'flex min-h-[30rem] flex-1 items-center justify-center rounded-[24px] border bg-slate-950/35',
        borderTone,
      ].join(' ')}
    >
      <div className="text-center">
        <p className={['text-xs uppercase tracking-[0.32em]', textTone].join(' ')}>{title}</p>
        <p className="mt-3 text-sm text-slate-300">模块加载中…</p>
      </div>
    </div>
  )
}

function SimulationPanelShell({
  tone,
  eyebrow,
  title,
  badge,
  children,
}: {
  tone: 'cyan' | 'amber'
  eyebrow: string
  title: string
  badge: string
  children: ReactNode
}) {
  const borderTone = tone === 'cyan' ? 'border-cyan-400/20' : 'border-amber-300/20'
  const backgroundTone =
    tone === 'cyan'
      ? 'bg-gradient-to-br from-cyan-400/10 via-slate-900 to-slate-950'
      : 'bg-gradient-to-b from-amber-200/10 via-slate-900 to-slate-950'
  const eyebrowTone = tone === 'cyan' ? 'text-cyan-200/75' : 'text-amber-100/75'

  return (
    <article className={`flex min-h-[28rem] flex-col rounded-[28px] border p-4 sm:p-5 ${borderTone} ${backgroundTone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-xs uppercase tracking-[0.35em] ${eyebrowTone}`}>{eyebrow}</p>
          <h2 className="mt-2 font-mono text-2xl font-bold text-white">{title}</h2>
        </div>
        <span className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1 text-xs text-slate-300">
          {badge}
        </span>
      </div>
      <div className="mt-4 flex min-h-0 flex-1">{children}</div>
    </article>
  )
}

function MobileToolbarSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-hidden={!open}
        className={[
          'fixed inset-0 z-40 bg-slate-950/68 backdrop-blur-sm transition-opacity md:hidden',
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
      />
      <div
        className={[
          'fixed inset-x-3 bottom-3 z-50 max-h-[78vh] overflow-hidden rounded-[28px] border border-white/10 bg-slate-900/96 shadow-[0_24px_80px_rgba(2,6,23,0.62)] transition-transform duration-300 md:hidden',
          open ? 'translate-y-0' : 'translate-y-[115%]',
        ].join(' ')}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-100/70">Tool Drawer</p>
            <p className="mt-1 text-sm text-slate-300">移动端工具面板</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-100"
          >
            关闭
          </button>
        </div>
        <div className="max-h-[calc(78vh-5rem)] overflow-y-auto p-4">
          <Toolbar />
        </div>
      </div>
    </>
  )
}

function SimulationView() {
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
  const isMobile = useIsMobileViewport()
  const [splitRatio, setSplitRatio] = useState(60)
  const [activeMobilePane, setActiveMobilePane] = useState<MobilePane>('town')
  const [mobileToolbarOpen, setMobileToolbarOpen] = useState(false)
  const mobileToolbarVisible = isMobile && mobileToolbarOpen

  const townPanel = useMemo(
    () => (
      <SimulationPanelShell
        tone="cyan"
        eyebrow="PixiJS Town View"
        title="小镇地图"
        badge={isMobile ? 'Map' : `${Math.round(splitRatio)}%`}
      >
        <Suspense fallback={<PanelFallback tone="cyan" title="PixiJS Town View" />}>
          <TownCanvas />
        </Suspense>
      </SimulationPanelShell>
    ),
    [isMobile, splitRatio],
  )

  const graphPanel = useMemo(
    () => (
      <SimulationPanelShell
        tone="amber"
        eyebrow="D3 Relationship Graph"
        title="关系图谱"
        badge={isMobile ? 'Graph' : `${Math.round(100 - splitRatio)}%`}
      >
        <Suspense fallback={<PanelFallback tone="amber" title="D3 Relationship Graph" />}>
          <GraphPanel />
        </Suspense>
      </SimulationPanelShell>
    ),
    [isMobile, splitRatio],
  )

  if (!hasInitialSnapshot) {
    return <LoadingTransition onRetry={retry} timedOut={startupTimedOut} />
  }

  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-100">
      {disconnected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 backdrop-blur-md">
          <div className="flex flex-col items-center gap-4 rounded-[28px] border border-white/10 bg-slate-900/90 px-10 py-9 shadow-[0_24px_80px_rgba(2,6,23,0.62)]">
            {maxRetriesExceeded ? (
              <>
                <span className="text-2xl">⚠️</span>
                <div className="text-center">
                  <p className="text-[11px] uppercase tracking-[0.34em] text-amber-100/70">Connection Failed</p>
                  <p className="mt-3 text-base font-medium text-amber-50">连接失败，请手动刷新页面</p>
                  <button
                    type="button"
                    onClick={retry}
                    className="mt-4 rounded-full border border-amber-400/30 bg-amber-400/10 px-5 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-400/20"
                  >
                    重新连接
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-300/90 border-t-transparent" />
                <div className="text-center">
                  <p className="text-[11px] uppercase tracking-[0.34em] text-cyan-100/70">Connection Interrupted</p>
                  <p className="mt-3 text-base font-medium text-cyan-50">
                    {reconnectCountdown > 0 ? `重连中 ${reconnectCountdown}s...` : '连接中断，正在重连...'}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div
        className={[
          'fixed bottom-4 right-4 z-40 rounded-full px-3 py-1 text-xs font-medium transition-colors',
          connected
            ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
            : 'border border-amber-400/30 bg-amber-400/10 text-amber-300',
        ].join(' ')}
      >
        {connected ? '● 已连接' : '○ 连接中…'}
      </div>

      {isMobile && (
        <>
          <button
            type="button"
            onClick={() => setMobileToolbarOpen((open) => !open)}
            className="fixed bottom-4 left-4 z-40 rounded-full border border-cyan-300/35 bg-cyan-300/14 px-4 py-3 text-sm font-medium text-cyan-50 shadow-[0_18px_44px_rgba(8,15,31,0.42)] md:hidden"
          >
            {mobileToolbarVisible ? '关闭工具' : '打开工具'}
          </button>
          <MobileToolbarSheet open={mobileToolbarVisible} onClose={() => setMobileToolbarOpen(false)} />
        </>
      )}

      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
        <div className="mb-3">
          <ApiKeyBanner />
        </div>
        <header className="rounded-[28px] border border-white/10 bg-white/5 px-4 py-4 shadow-[0_24px_80px_rgba(15,23,42,0.35)] backdrop-blur sm:px-5 xl:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.4em] text-cyan-300/70">
                POPULACE
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="font-mono text-2xl font-black tracking-tight text-white sm:text-3xl">
                  现代小区
                </h1>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                  10 residents · 8 buildings
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-50">
                图谱、地图与上帝模式联动面板
              </div>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <section className="mt-4 flex-1 rounded-[32px] border border-white/10 bg-slate-900/80 p-3 shadow-[0_24px_80px_rgba(8,15,31,0.45)] backdrop-blur sm:p-4">
          {isMobile ? (
            <div className="flex h-full min-h-[calc(100vh-13rem)] flex-col gap-4">
              <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
                {([
                  { key: 'town', label: '地图' },
                  { key: 'graph', label: '图谱' },
                ] as Array<{ key: MobilePane; label: string }>).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveMobilePane(item.key)}
                    className={[
                      'rounded-full px-4 py-2 text-sm font-medium transition',
                      activeMobilePane === item.key
                        ? 'bg-cyan-300/16 text-cyan-50'
                        : 'text-slate-300',
                    ].join(' ')}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex min-h-0 flex-1 flex-col">
                {activeMobilePane === 'town' ? townPanel : graphPanel}
              </div>
            </div>
          ) : (
            <SplitPane
              defaultRatio={60}
              minLeftRatio={30}
              minRightRatio={20}
              onRatioChange={setSplitRatio}
              left={townPanel}
              right={graphPanel}
            />
          )}
        </section>

        {!isMobile && (
          <footer className="mt-4">
            <Toolbar />
          </footer>
        )}
      </div>
      <FirstRunGuide enabled={hasInitialSnapshot} />
      {hasInitialSnapshot && <TutorialOverlay />}
    </main>
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
