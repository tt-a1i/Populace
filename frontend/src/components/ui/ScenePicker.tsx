import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type ScenarioData, generateScenario, startCustomSimulation, startSimulation } from '../../services/api'
import { SceneEditor } from './SceneEditor'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ThemeToggle } from './ThemeToggle'
import { type CustomSceneRecord, PRESET_SCENES, loadCustomScenes, saveCustomScenes } from './sceneCatalog'

interface ScenePickerProps {
  onEnter: () => void
  onBack: () => void
}

export function ScenePicker({ onEnter, onBack }: ScenePickerProps) {
  const { t } = useTranslation()
  const [selectedScene, setSelectedScene] = useState(PRESET_SCENES[0].id)
  const [selectedCustomSceneId, setSelectedCustomSceneId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customScenes, setCustomScenes] = useState<CustomSceneRecord[]>([])
  const [editorOpen, setEditorOpen] = useState(false)

  const [customDesc, setCustomDesc] = useState('')
  const [customGenerating, setCustomGenerating] = useState(false)
  const [customError, setCustomError] = useState<string | null>(null)
  const [generatedScenario, setGeneratedScenario] = useState<ScenarioData | null>(null)
  const [customStarting, setCustomStarting] = useState(false)

  useEffect(() => {
    const scenes = loadCustomScenes()
    setCustomScenes(scenes)
    if (scenes.length > 0) {
      setSelectedCustomSceneId((current) => current ?? scenes[0].id)
    }
  }, [])

  const handleEnter = async () => {
    setLoading(true)
    setError(null)
    try {
      if (selectedScene === 'custom_saved') {
        const customScene = customScenes.find((scene) => scene.id === selectedCustomSceneId)
        if (!customScene) {
          throw new Error(t('scene.custom_missing'))
        }
        await startCustomSimulation(customScene.scenario)
      } else {
        await startSimulation(selectedScene)
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? `${t('scene.backend_error')}: ${err.message}`
          : t('scene.backend_error_hint'),
      )
      setLoading(false)
      return
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
      setCustomError(err instanceof Error ? err.message : t('scene.generate_failed'))
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
      setCustomError(err instanceof Error ? `${t('scene.start_failed')}: ${err.message}` : t('scene.start_failed_hint'))
      setCustomStarting(false)
    }
  }

  const handleSaveEditedScene = ({
    scenario,
    basedOn,
  }: {
    scenario: ScenarioData
    basedOn: string
  }) => {
    const nextRecord: CustomSceneRecord = {
      id: `custom_${Date.now()}`,
      name: scenario.name,
      basedOn,
      scenario,
      createdAt: new Date().toISOString(),
    }
    const nextScenes = [nextRecord, ...customScenes]
    saveCustomScenes(nextScenes)
    setCustomScenes(nextScenes)
    setSelectedScene('custom_saved')
    setSelectedCustomSceneId(nextRecord.id)
    setEditorOpen(false)
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 text-slate-100">
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
        <button
          onClick={onBack}
          className="mb-8 flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('scene.back')}
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-mono text-2xl font-bold text-white sm:text-3xl">{t('scene.title')}</h2>
            <p className="mt-2 text-sm text-slate-400">{t('scene.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          {PRESET_SCENES.map((scene) => {
            const isSelected = selectedScene === scene.id
            return (
              <div
                key={scene.id}
                className={[
                  'cursor-pointer rounded-3xl border bg-gradient-to-br p-6 shadow-lg transition-all',
                  isSelected
                    ? `ring-2 ring-offset-2 ring-offset-slate-950 ${scene.border.replace('border-', 'ring-')}`
                    : 'opacity-70 hover:opacity-90',
                  scene.color,
                  scene.border,
                ].join(' ')}
                onClick={() => setSelectedScene(scene.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => event.key === 'Enter' && setSelectedScene(scene.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold uppercase tracking-[0.3em] ${scene.accent}`}>
                        {t('scene.preset_label')}
                      </span>
                      {scene.recommended && (
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                          {t('scene.preset_badge')}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 text-xl font-bold text-white">{t(`scene.${scene.i18nKey}_name`)}</h3>
                  </div>
                  <div
                    className={[
                      'mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                      isSelected ? `${scene.border} bg-white/20` : 'border-white/20 bg-transparent',
                    ].join(' ')}
                  >
                    {isSelected && <div className="h-2.5 w-2.5 rounded-full bg-white/80" />}
                  </div>
                </div>

                <div className="relative mt-4 h-16 w-full overflow-hidden rounded-xl border border-white/8 bg-black/20">
                  {scene.preview.map((item, index) => (
                    <span
                      key={index}
                      className="pointer-events-none absolute text-lg leading-none"
                      style={{ left: `${item.x}%`, top: `${item.y}%` }}
                      aria-hidden="true"
                    >
                      {item.emoji}
                    </span>
                  ))}
                </div>

                <p className="mt-3 text-sm leading-relaxed text-slate-300">{t(`scene.${scene.i18nKey}_desc`)}</p>

                <div className="mt-5 flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-xs text-slate-300">
                    <span className="text-base">👥</span>
                    <span><span className="font-bold text-white">{scene.residents}</span> {t('scene.residents')}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-300">
                    <span className="text-base">🏘️</span>
                    <span><span className="font-bold text-white">{scene.buildings}</span> {t('scene.buildings')}</span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {(t(`scene.${scene.i18nKey}_tags`, { returnObjects: true }) as string[]).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-slate-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {customScenes.length > 0 && (
          <div className="mt-4 rounded-3xl border border-amber-400/20 bg-amber-400/5 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-200/80">
                  {t('scene.saved_label')}
                </span>
                <h3 className="mt-2 text-lg font-bold text-white">{t('scene.saved_title')}</h3>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
                {customScenes.length} {t('scene.saved_count')}
              </span>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              {customScenes.map((scene) => {
                const isSelected = selectedScene === 'custom_saved' && selectedCustomSceneId === scene.id
                return (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => {
                      setSelectedScene('custom_saved')
                      setSelectedCustomSceneId(scene.id)
                    }}
                    className={[
                      'rounded-2xl border p-4 text-left transition-all',
                      isSelected
                        ? 'border-amber-300/50 bg-amber-300/10 ring-2 ring-amber-300/30'
                        : 'border-white/10 bg-slate-950/30 hover:border-white/20 hover:bg-white/[0.04]',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{scene.name}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {t(`scene.${scene.basedOn}_name`)} · {scene.scenario.residents.length} {t('scene.residents')} · {scene.scenario.buildings.length} {t('scene.buildings')}
                        </p>
                      </div>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-300">
                        {t('scene.saved_badge')}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="mt-4 rounded-3xl border border-white/8 bg-white/[0.02] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                {t('scene.custom_label')}
              </span>
              <h3 className="mt-2 text-lg font-bold text-white">{t('scene.custom_title')}</h3>
            </div>
            <button
              type="button"
              onClick={() => setEditorOpen((current) => !current)}
              className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-400/15"
            >
              {editorOpen ? t('scene.editor_close') : t('scene.open_editor')}
            </button>
          </div>

          <textarea
            className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-slate-900/60 p-3 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30"
            rows={3}
            placeholder={t('scene.custom_placeholder')}
            value={customDesc}
            onChange={(event) => {
              setCustomDesc(event.target.value)
              setGeneratedScenario(null)
              setCustomError(null)
            }}
          />

          <button
            onClick={handleGenerateScenario}
            disabled={customGenerating || !customDesc.trim()}
            className="mt-3 flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-300 transition-colors hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {customGenerating ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-300 border-t-transparent" />
                {t('scene.generating')}
              </>
            ) : (
              t('scene.generate')
            )}
          </button>

          {customError && <p className="mt-3 text-xs text-red-300">{customError}</p>}

          {generatedScenario && (
            <div className="mt-4 rounded-xl border border-white/8 bg-slate-900/40 p-4">
              <p className="text-sm font-bold text-white">{generatedScenario.name}</p>
              <div className="mt-2 flex gap-4 text-xs text-slate-400">
                <span>👥 <span className="font-semibold text-slate-200">{generatedScenario.residents.length}</span> {t('scene.residents')}</span>
                <span>🏘️ <span className="font-semibold text-slate-200">{generatedScenario.buildings.length}</span> {t('scene.buildings')}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {generatedScenario.residents.slice(0, 8).map((resident) => (
                  <span key={resident.id} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">
                    {resident.name}
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
                    {t('scene.starting')}
                  </>
                ) : (
                  t('scene.use_scene')
                )}
              </button>
            </div>
          )}
        </div>

        {editorOpen && (
          <SceneEditor
            initialBaseSceneId={PRESET_SCENES.find((scene) => scene.id === selectedScene)?.id ?? PRESET_SCENES[0].id}
            onSave={handleSaveEditedScene}
            onCancel={() => setEditorOpen(false)}
          />
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

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
                {t('scene.entering')}
              </>
            ) : (
              <>
                {t('scene.enter')}
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
