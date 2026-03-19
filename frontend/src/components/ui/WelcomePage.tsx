import { useEffect, useRef } from 'react'

const FEATURES = [
  {
    icon: '🧠',
    title: 'AI 自主社交',
    desc: '居民独立感知环境、检索记忆、做出决策，行为完全自驱',
  },
  {
    icon: '🕸️',
    title: '实时关系图谱',
    desc: '力导向图谱动态演化，爱恨情仇一目了然',
  },
  {
    icon: '⚡',
    title: '上帝模式干预',
    desc: '投放事件、修改人设、改变环境，你掌控这座小镇',
  },
  {
    icon: '📋',
    title: '小镇日报',
    desc: 'AI 自动生成戏剧化八卦日报，一键截图发社交媒体',
  },
]

interface WelcomePageProps {
  onStart: () => void
}

export function WelcomePage({ onStart }: WelcomePageProps) {
  const titleRef = useRef<HTMLHeadingElement>(null)

  /* Subtle letter shimmer on mount */
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.classList.add('animate-pulse')
    const t = setTimeout(() => el.classList.remove('animate-pulse'), 1200)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 text-slate-100">
      {/* ── Layered background glows ── */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(6,182,212,0.12),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_100%,rgba(139,92,246,0.10),transparent)]" />

      {/* ── Pixel grid overlay ── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.028]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* ── Content ── */}
      <div className="relative z-10 flex w-full max-w-4xl flex-col items-center px-4 py-16 sm:px-6">
        {/* Version badge */}
        <span className="mb-8 rounded-full border border-cyan-400/30 bg-cyan-400/8 px-4 py-1.5 text-[11px] font-semibold tracking-[0.35em] text-cyan-400/90 uppercase">
          Stanford Generative Agents · V1
        </span>

        {/* Main title */}
        <h1
          ref={titleRef}
          className="select-none text-center font-mono text-[clamp(3.5rem,12vw,7rem)] font-black leading-none tracking-tight"
        >
          <span className="bg-gradient-to-br from-cyan-200 via-white to-violet-300 bg-clip-text text-transparent drop-shadow-[0_0_60px_rgba(6,182,212,0.25)]">
            POPULACE
          </span>
        </h1>

        {/* Pixel-style decorative bar */}
        <div className="mt-5 flex items-center gap-2 opacity-50">
          {[...Array(12)].map((_, i) => (
            <span
              key={i}
              className="inline-block h-1.5 w-1.5 rounded-sm bg-cyan-400"
              style={{ opacity: Math.random() * 0.6 + 0.4 }}
            />
          ))}
        </div>

        {/* Slogan */}
        <p className="mt-6 text-center text-base font-medium text-slate-300 sm:text-lg">
          Create a pixel town, watch AI residents live their drama.
        </p>
        <p className="mt-2 text-center text-sm text-slate-500">
          创造一个像素小镇，围观 AI 居民的悲欢离合
        </p>

        {/* Feature cards */}
        <div className="mt-12 grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
          {FEATURES.map((f) => (
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
          className="group relative mt-14 overflow-hidden rounded-2xl px-12 py-4 text-base font-bold text-white shadow-[0_0_40px_rgba(6,182,212,0.18)] transition-all duration-300 hover:scale-[1.04] hover:shadow-[0_0_60px_rgba(6,182,212,0.35)] active:scale-100"
        >
          {/* Button gradient bg */}
          <span className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-violet-500 transition-opacity duration-300" />
          <span className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-violet-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          {/* Shine sweep */}
          <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
          <span className="relative z-10 flex items-center gap-2">
            开始模拟
            <svg className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </span>
        </button>

        {/* Footnote */}
        <p className="mt-8 text-xs text-slate-600">
          基于 Stanford Generative Agents 论文 · 完全开源
        </p>
      </div>
    </div>
  )
}
