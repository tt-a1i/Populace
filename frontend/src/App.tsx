import { Suspense, lazy, useState } from 'react'

import { Toolbar } from './components/toolbar/Toolbar'
import { FirstRunGuide, LoadingTransition, ScenePicker, WelcomePage } from './components/ui'
import { useWebSocket } from './hooks/useWebSocket'

const TownCanvas = lazy(() =>
  import('./components/town/TownCanvas').then((module) => ({ default: module.TownCanvas })),
)
const GraphPanel = lazy(() =>
  import('./components/graph/GraphPanel').then((module) => ({ default: module.GraphPanel })),
)

type AppPage = 'welcome' | 'picking' | 'simulation'

function PanelFallback({ tone, title }: { tone: 'amber' | 'cyan'; title: string }) {
  const borderTone = tone === 'cyan' ? 'border-cyan-300/25' : 'border-amber-200/25'
  const textTone = tone === 'cyan' ? 'text-cyan-100/70' : 'text-amber-100/70'

  return (
    <div
      className={[
        'mt-5 flex min-h-[30rem] flex-1 items-center justify-center rounded-[24px] border bg-slate-950/35',
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

function SimulationView() {
  const {
    connected,
    disconnected,
    hasInitialSnapshot,
    startupTimedOut,
    retry,
  } = useWebSocket()

  if (!hasInitialSnapshot) {
    return <LoadingTransition onRetry={retry} timedOut={startupTimedOut} />
  }

  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-100">
      {/* Disconnection overlay (spec §13) */}
      {disconnected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 backdrop-blur-md">
          <div className="flex flex-col items-center gap-4 rounded-[28px] border border-white/10 bg-slate-900/90 px-10 py-9 shadow-[0_24px_80px_rgba(2,6,23,0.62)]">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-300/90 border-t-transparent" />
            <div className="text-center">
              <p className="text-[11px] uppercase tracking-[0.34em] text-cyan-100/70">Connection Interrupted</p>
              <p className="mt-3 text-base font-medium text-cyan-50">连接中断，正在重连...</p>
            </div>
          </div>
        </div>
      )}

      {/* Connection status badge */}
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

      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="rounded-[28px] border border-white/10 bg-white/5 px-5 py-4 shadow-[0_24px_80px_rgba(15,23,42,0.35)] backdrop-blur xl:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.4em] text-cyan-300/70">
                POPULACE
              </p>
              <div className="mt-2 flex items-center gap-3">
                <h1 className="font-mono text-2xl font-black tracking-tight text-white sm:text-3xl">
                  现代小区
                </h1>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                  10 residents · 8 buildings
                </span>
              </div>
            </div>
            <div className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-50">
              图谱、地图与上帝模式联动面板
            </div>
          </div>
        </header>

        <section className="mt-4 flex-1 rounded-[32px] border border-white/10 bg-slate-900/80 p-3 shadow-[0_24px_80px_rgba(8,15,31,0.45)] backdrop-blur sm:p-4">
          <div className="grid h-full min-h-[calc(100vh-15rem)] gap-4 xl:grid-cols-[3fr_2fr]">
            <article className="flex min-h-[28rem] flex-col rounded-[28px] border border-cyan-400/20 bg-gradient-to-br from-cyan-400/10 via-slate-900 to-slate-950 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/75">
                    PixiJS Town View
                  </p>
                  <h2 className="mt-2 font-mono text-2xl font-bold text-white">小镇地图</h2>
                </div>
                <span className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1 text-xs text-slate-300">
                  60%
                </span>
              </div>
              <Suspense fallback={<PanelFallback tone="cyan" title="PixiJS Town View" />}>
                <TownCanvas />
              </Suspense>
            </article>

            <article className="flex min-h-[28rem] flex-col rounded-[28px] border border-amber-300/20 bg-gradient-to-b from-amber-200/10 via-slate-900 to-slate-950 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-amber-100/75">
                    D3 Relationship Graph
                  </p>
                  <h2 className="mt-2 font-mono text-2xl font-bold text-white">关系图谱</h2>
                </div>
                <span className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1 text-xs text-slate-300">
                  40%
                </span>
              </div>
              <Suspense fallback={<PanelFallback tone="amber" title="D3 Relationship Graph" />}>
                <GraphPanel />
              </Suspense>
            </article>
          </div>
        </section>

        <footer className="mt-4">
          <Toolbar />
        </footer>
      </div>
      <FirstRunGuide enabled={hasInitialSnapshot} />
    </main>
  )
}

function App() {
  const [page, setPage] = useState<AppPage>('welcome')

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
