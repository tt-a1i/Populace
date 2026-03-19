import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type ScenarioData, generateScenario, startCustomSimulation, startSimulation } from '../../services/api'
import { LanguageSwitcher } from './LanguageSwitcher'

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
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Custom scenario state
  const [customDesc, setCustomDesc] = useState('')
  const [customGenerating, setCustomGenerating] = useState(false)
  const [customError, setCustomError] = useState<string | null>(null)
  const [generatedScenario, setGeneratedScenario] = useState<ScenarioData | null>(null)
  const [customStarting, setCustomStarting] = useState(false)

  const handleEnter = async () => {
    setLoading(true)
    setError(null)
    try {
      await startSimulation()
    } catch (err) {
      setError(
        err instanceof Error
          ? `后端连接失败：${err.message}`
          : '后端连接失败，请确认服务已启动后重试。',
      )
      setLoading(false)
      return  // Stay on picking page — do NOT enter simulation
    }
    setLoading(false)
    onEnter()
  }

  const handleGenerateScenario = async () => {
    if (!customDesc.trim()) return
    setCustomGenerating(true)
    setCustomError(null)
    setGeneratedScenario(null)
    try {
      const scenario = await generateScenario(customDesc.trim())
      setGeneratedScenario(scenario)
    } catch (err) {
      setCustomError(err instanceof Error ? err.message : '生成失败，请重试。')
    } finally {
      setCustomGenerating(false)
    }
  }

  const handleStartCustom = async () => {
    if (!generatedScenario) return
    setCustomStarting(true)
    setCustomError(null)
    try {
      await startCustomSimulation(generatedScenario)
      onEnter()
    } catch (err) {
      setCustomError(err instanceof Error ? `启动失败：${err.message}` : '启动失败，请重试。')
      setCustomStarting(false)
    }
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
          {t('scene.back')}
        </button>

        {/* Heading */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-mono text-2xl font-bold text-white sm:text-3xl">{t('scene.title')}</h2>
            <p className="mt-2 text-sm text-slate-400">{t('scene.subtitle')}</p>
          </div>
          <LanguageSwitcher />
        </div>

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

        {/* ── Custom scene ── */}
        <div className="mt-4 rounded-3xl border border-white/8 bg-white/[0.02] p-6">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            自定义场景
          </span>
          <h3 className="mt-2 text-lg font-bold text-white">描述你的小镇</h3>

          <textarea
            className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-slate-900/60 p-3 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30"
            rows={3}
            placeholder="例如：一个海边渔村，住着6个渔民，有码头和渔市…"
            value={customDesc}
            onChange={(e) => {
              setCustomDesc(e.target.value)
              setGeneratedScenario(null)
              setCustomError(null)
            }}
          />

          <button
            onClick={handleGenerateScenario}
            disabled={customGenerating || !customDesc.trim()}
            className="mt-3 flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-300 transition-colors hover:bg-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {customGenerating ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-300 border-t-transparent" />
                AI 生成中…
              </>
            ) : (
              '✦ 生成场景'
            )}
          </button>

          {customError && (
            <p className="mt-3 text-xs text-red-300">{customError}</p>
          )}

          {/* Preview */}
          {generatedScenario && (
            <div className="mt-4 rounded-xl border border-white/8 bg-slate-900/40 p-4">
              <p className="text-sm font-bold text-white">{generatedScenario.name}</p>
              <div className="mt-2 flex gap-4 text-xs text-slate-400">
                <span>👥 <span className="font-semibold text-slate-200">{generatedScenario.residents.length}</span> 位居民</span>
                <span>🏘️ <span className="font-semibold text-slate-200">{generatedScenario.buildings.length}</span> 栋建筑</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {generatedScenario.residents.slice(0, 8).map((r) => (
                  <span key={r.id} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">
                    {r.name}
                  </span>
                ))}
                {generatedScenario.residents.length > 8 && (
                  <span className="text-[11px] text-slate-500">+{generatedScenario.residents.length - 8}</span>
                )}
              </div>
              <button
                onClick={handleStartCustom}
                disabled={customStarting}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {customStarting ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    启动中…
                  </>
                ) : (
                  '使用此场景 →'
                )}
              </button>
            </div>
          )}
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
