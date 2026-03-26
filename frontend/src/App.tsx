import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'

import { WelcomePage } from './components/ui/WelcomePage'
import { THEME_ACCENTS, useThemeStore } from './stores/theme'

type AppPage = 'welcome' | 'picking' | 'guide' | 'simulation'

const LazyScenePicker = lazy(() =>
  import('./components/ui/ScenePicker').then((module) => ({ default: module.ScenePicker })),
)
const GuidePage = lazy(() =>
  import('./pages/GuidePage').then((module) => ({ default: module.GuidePage })),
)
const SimulationView = lazy(() =>
  import('./pages/SimulationView').then((module) => ({ default: module.SimulationView })),
)

function PageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-300">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/80 px-5 py-4 shadow-2xl">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-300/70 border-t-transparent" />
        <span>Loading…</span>
      </div>
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
        <Suspense fallback={<PageLoading />}>
          <LazyScenePicker onEnter={() => setPage('simulation')} onBack={() => setPage('welcome')} />
        </Suspense>
      </div>
    )
  }

  if (page === 'guide') {
    return (
      <div key="guide" className="animate-[pageEnter_400ms_ease-out]">
        <Suspense fallback={<PageLoading />}>
          <GuidePage onBack={() => setPage(lastPageRef.current)} />
        </Suspense>
      </div>
    )
  }

  return (
    <div key="simulation" className="animate-[pageEnter_400ms_ease-out]">
      <Suspense fallback={<PageLoading />}>
        <SimulationView />
      </Suspense>
    </div>
  )
}

export default App
