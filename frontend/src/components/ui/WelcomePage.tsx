import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from './LanguageSwitcher'
import { ThemeToggle } from './ThemeToggle'

// Deterministic floating particles — no runtime randomness so renders are stable
const PARTICLES = [
  { left: '7%',  top: '14%', size: 4,  dur: 9,  delay: 0,   op: 0.28 },
  { left: '22%', top: '71%', size: 3,  dur: 12, delay: 2.1, op: 0.18 },
  { left: '46%', top: '33%', size: 5,  dur: 10, delay: 1.0, op: 0.22 },
  { left: '70%', top: '17%', size: 3,  dur: 8,  delay: 3.2, op: 0.20 },
  { left: '84%', top: '60%', size: 6,  dur: 14, delay: 0.5, op: 0.14 },
  { left: '12%', top: '87%', size: 4,  dur: 11, delay: 4.0, op: 0.17 },
  { left: '61%', top: '81%', size: 3,  dur: 7,  delay: 1.5, op: 0.16 },
  { left: '34%', top: '54%', size: 5,  dur: 13, delay: 2.5, op: 0.20 },
  { left: '91%', top: '38%', size: 4,  dur: 9,  delay: 3.8, op: 0.13 },
  { left: '54%', top: '9%',  size: 3,  dur: 11, delay: 0.8, op: 0.19 },
  { left: '27%', top: '41%', size: 6,  dur: 8,  delay: 2.0, op: 0.10 },
  { left: '77%', top: '74%', size: 4,  dur: 10, delay: 1.0, op: 0.15 },
]

interface WelcomePageProps {
  onStart: () => void
}

export function WelcomePage({ onStart }: WelcomePageProps) {
  const { t } = useTranslation()

  const features = [
    { icon: '🧠', title: t('welcome.features.social_title'), desc: t('welcome.features.social_desc') },
    { icon: '🕸️', title: t('welcome.features.graph_title'), desc: t('welcome.features.graph_desc') },
    { icon: '⚡', title: t('welcome.features.god_title'), desc: t('welcome.features.god_desc') },
    { icon: '📋', title: t('welcome.features.report_title'), desc: t('welcome.features.report_desc') },
  ]

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 text-slate-100">
      {/* Background glows */}
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

      {/* Floating particles */}
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="pointer-events-none absolute rounded-full bg-cyan-400"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            ['--p-op' as string]: p.op,
            animation: `particle-float ${p.dur}s ease-in-out ${p.delay}s infinite`,
            opacity: p.op,
          }}
        />
      ))}

      {/* Top-right controls */}
      <div className="absolute right-6 top-6 z-20 flex items-center gap-2">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>

      <div className="relative z-10 flex w-full max-w-4xl flex-col items-center px-4 py-16 sm:px-6">
        {/* Badge — fades in first */}
        <span
          className="animate-fade-up mb-8 rounded-full border border-cyan-400/30 bg-cyan-400/8 px-4 py-1.5 text-[11px] font-semibold tracking-[0.35em] text-cyan-400/90 uppercase"
          style={{ animationDelay: '0ms' }}
        >
          {t('welcome.badge')}
        </span>

        {/* Logo — fades in second */}
        <h1
          className="animate-fade-up select-none text-center font-mono text-[clamp(3.5rem,12vw,7rem)] font-black leading-none tracking-tight"
          style={{ animationDelay: '120ms' }}
        >
          <span className="bg-gradient-to-br from-cyan-200 via-white to-violet-300 bg-clip-text text-transparent drop-shadow-[0_0_60px_rgba(6,182,212,0.25)]">
            POPULACE
          </span>
        </h1>

        <div
          className="animate-fade-up mt-5 flex items-center gap-2 opacity-50"
          style={{ animationDelay: '220ms' }}
        >
          {Array.from({ length: 12 }, (_, i) => (
            <span
              key={i}
              className="inline-block h-1.5 w-1.5 rounded-sm bg-cyan-400"
              style={{ opacity: 0.4 + ((i * 37 + 13) % 100) / 167 }}
            />
          ))}
        </div>

        <p
          className="animate-fade-up mt-6 text-center text-base font-medium text-slate-300 sm:text-lg"
          style={{ animationDelay: '300ms' }}
        >
          {t('welcome.slogan_en')}
        </p>
        <p
          className="animate-fade-up mt-2 text-center text-sm text-slate-500"
          style={{ animationDelay: '360ms' }}
        >
          {t('welcome.slogan_zh')}
        </p>

        {/* Feature cards — staggered */}
        <div
          className="animate-fade-up mt-12 grid w-full grid-cols-2 gap-3 sm:grid-cols-4"
          style={{ animationDelay: '440ms' }}
        >
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

        {/* CTA button */}
        <button
          onClick={onStart}
          className="animate-fade-up group relative mt-14 overflow-hidden rounded-2xl px-12 py-4 text-base font-bold text-white shadow-[0_0_40px_rgba(6,182,212,0.18)] transition-all duration-300 hover:scale-[1.04] hover:shadow-[0_0_60px_rgba(6,182,212,0.35)] active:scale-100"
          style={{ animationDelay: '540ms' }}
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

        <p
          className="animate-fade-up mt-8 text-xs text-slate-600"
          style={{ animationDelay: '620ms' }}
        >
          {t('welcome.footnote')}
        </p>
      </div>
    </div>
  )
}
