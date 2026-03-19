import { useState } from 'react'

import { startSimulation } from '../../services/api'

interface ScenePickerProps {
  onEnter: () => void
  onBack: () => void
}

const PRESET_SCENE = {
  id: 'modern_community',
  name: '现代小区',
  nameEn: 'Modern Community',
  description: '一个充满故事的都市小区，十位居民各有各的性格与秘密。',
  residents: 10,
  buildings: 8,
  tags: ['社交', '爱恨情仇', '八卦'],
  color: 'from-cyan-500/20 to-violet-500/10',
  border: 'border-cyan-400/30',
  accent: 'text-cyan-300',
}

export function ScenePicker({ onEnter, onBack }: ScenePickerProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleEnter = async () => {
    setLoading(true)
    setError(null)
    try {
      await startSimulation()
    } catch {
      // Backend may be unavailable; proceed to UI anyway
    }
    setLoading(false)
    onEnter()
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 text-slate-100">
      {/* Background glows (same as WelcomePage) */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(6,182,212,0.10),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_100%,rgba(139,92,246,0.08),transparent)]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 w-full max-w-xl px-4 py-16 sm:px-0">
        {/* Back button */}
        <button
          onClick={onBack}
          className="mb-8 flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回
        </button>

        {/* Heading */}
        <h2 className="font-mono text-2xl font-bold text-white sm:text-3xl">选择场景</h2>
        <p className="mt-2 text-sm text-slate-400">选择一个预设场景，或自定义你的小镇</p>

        {/* ── Preset scene card ── */}
        <div
          className={[
            'mt-8 cursor-pointer rounded-3xl border bg-gradient-to-br p-6 shadow-lg',
            'ring-2 ring-cyan-400/50 ring-offset-2 ring-offset-slate-950',
            PRESET_SCENE.color,
            PRESET_SCENE.border,
          ].join(' ')}
          onClick={handleEnter}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleEnter()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold uppercase tracking-[0.3em] ${PRESET_SCENE.accent}`}>
                  预设场景
                </span>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                  ✓ 推荐
                </span>
              </div>
              <h3 className="mt-2 text-xl font-bold text-white">{PRESET_SCENE.name}</h3>
              <p className="mt-1 text-xs text-slate-400">{PRESET_SCENE.nameEn}</p>
            </div>
            {/* Selected indicator */}
            <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-cyan-400 bg-cyan-400/20">
              <div className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-slate-300">{PRESET_SCENE.description}</p>

          {/* Stats */}
          <div className="mt-5 flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <span className="text-base">👥</span>
              <span><span className="font-bold text-white">{PRESET_SCENE.residents}</span> 位居民</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <span className="text-base">🏘️</span>
              <span><span className="font-bold text-white">{PRESET_SCENE.buildings}</span> 栋建筑</span>
            </div>
          </div>

          {/* Tags */}
          <div className="mt-4 flex flex-wrap gap-2">
            {PRESET_SCENE.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-slate-300"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* ── Custom scene (coming soon) ── */}
        <div className="mt-4 relative rounded-3xl border border-white/8 bg-white/[0.02] p-6 opacity-60">
          <div className="absolute right-4 top-4 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-amber-300 uppercase">
            即将推出
          </div>
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            自定义场景
          </span>
          <h3 className="mt-2 text-lg font-bold text-slate-400">描述你的小镇</h3>
          <div className="mt-3 rounded-xl border border-white/6 bg-slate-900/50 p-3">
            <p className="text-xs text-slate-600">在一个宁静的山间小镇，住着…</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {/* Enter button */}
        <button
          onClick={handleEnter}
          disabled={loading}
          className="group relative mt-8 w-full overflow-hidden rounded-2xl py-4 text-base font-bold text-white shadow-[0_0_40px_rgba(6,182,212,0.15)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_60px_rgba(6,182,212,0.30)] active:scale-100 disabled:opacity-60 disabled:hover:scale-100"
        >
          <span className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-violet-500 transition-opacity duration-300" />
          <span className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-violet-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-disabled:opacity-0" />
          <span className="relative z-10 flex items-center justify-center gap-2">
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                正在启动…
              </>
            ) : (
              <>
                进入小镇
                <svg className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </span>
        </button>
      </div>
    </div>
  )
}
