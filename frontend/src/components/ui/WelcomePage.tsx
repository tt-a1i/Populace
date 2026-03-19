import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from './LanguageSwitcher'

const PIXEL_DOT_OPACITIES = Array.from({ length: 12 }, (_, i) =>
  0.4 + ((i * 37 + 13) % 100) / 167,
)

interface WelcomePageProps {
  onStart: () => void
}

export function WelcomePage({ onStart }: WelcomePageProps) {
  const { t } = useTranslation()
  const titleRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.classList.add('animate-pulse')
    const timer = setTimeout(() => el.classList.remove('animate-pulse'), 1200)
    return () => clearTimeout(timer)
  }, [])

  const features = [
    { icon: '🧠', title: t('welcome.features.social_title'), desc: t('welcome.features.social_desc') },
    { icon: '🕸️', title: t('welcome.features.graph_title'), desc: t('welcome.features.graph_desc') },
    { icon: '⚡', title: t('welcome.features.god_title'), desc: t('welcome.features.god_desc') },
    { icon: '📋', title: t('welcome.features.report_title'), desc: t('welcome.features.report_desc') },
  ]

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(6,182,212,0.12),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_100%,rgba(139,92,246,0.10),transparent)]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.028]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Language switcher */}
      <div className="absolute right-6 top-6 z-20">
        <LanguageSwitcher />
      </div>

      <div className="relative z-10 flex w-full max-w-4xl flex-col items-center px-4 py-16 sm:px-6">
        <span className="mb-8 rounded-full border border-cyan-400/30 bg-cyan-400/8 px-4 py-1.5 text-[11px] font-semibold tracking-[0.35em] text-cyan-400/90 uppercase">
          {t('welcome.badge')}
        </span>

        <h1
          ref={titleRef}
          className="select-none text-center font-mono text-[clamp(3.5rem,12vw,7rem)] font-black leading-none tracking-tight"
        >
          <span className="bg-gradient-to-br from-cyan-200 via-white to-violet-300 bg-clip-text text-transparent drop-shadow-[0_0_60px_rgba(6,182,212,0.25)]">
            POPULACE
          </span>
        </h1>

        <div className="mt-5 flex items-center gap-2 opacity-50">
          {PIXEL_DOT_OPACITIES.map((opacity, i) => (
            <span
              key={i}
              className="inline-block h-1.5 w-1.5 rounded-sm bg-cyan-400"
              style={{ opacity }}
            />
          ))}
        </div>

        <p className="mt-6 text-center text-base font-medium text-slate-300 sm:text-lg">
          {t('welcome.slogan_en')}
        </p>
        <p className="mt-2 text-center text-sm text-slate-500">
          {t('welcome.slogan_zh')}
        </p>

        <div className="mt-12 grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="group flex flex-col gap-2.5 rounded-2xl border border-white/6 bg-white/[0.03] p-4 backdrop-blur-sm transition-colors hover:border-white/12 hover:bg-white/[0.05]"
            >
              <span className="text-2xl">{f.icon}</span>
              <p className="text-sm font-semibold text-white">{f.title}</p>
              <p className="text-xs leading-relaxed text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>

        <button
          onClick={onStart}
          className="group relative mt-14 overflow-hidden rounded-2xl px-12 py-4 text-base font-bold text-white shadow-[0_0_40px_rgba(6,182,212,0.18)] transition-all duration-300 hover:scale-[1.04] hover:shadow-[0_0_60px_rgba(6,182,212,0.35)] active:scale-100"
        >
          <span className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-violet-500 transition-opacity duration-300" />
          <span className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-violet-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
          <span className="relative z-10 flex items-center gap-2">
            {t('welcome.start')}
            <svg className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </span>
        </button>

        <p className="mt-8 text-xs text-slate-600">
          {t('welcome.footnote')}
        </p>
      </div>
    </div>
  )
}
