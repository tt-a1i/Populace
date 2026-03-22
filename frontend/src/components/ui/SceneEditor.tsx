import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ScenarioData } from '../../services/api'
import { PRESET_SCENES, cloneScenarioTemplate } from './sceneCatalog'

interface SceneEditorProps {
  initialBaseSceneId?: string
  onSave: (payload: { scenario: ScenarioData; basedOn: string }) => void
  onCancel: () => void
}

export function SceneEditor({
  initialBaseSceneId = PRESET_SCENES[0]?.id ?? 'modern_community',
  onSave,
  onCancel,
}: SceneEditorProps) {
  const { t } = useTranslation()
  const [baseSceneId, setBaseSceneId] = useState(initialBaseSceneId)
  const [draft, setDraft] = useState<ScenarioData>(() => cloneScenarioTemplate(initialBaseSceneId))

  const baseSceneOptions = useMemo(
    () => PRESET_SCENES.map((scene) => ({ id: scene.id, label: t(`scene.${scene.i18nKey}_name`) })),
    [t],
  )

  const resetToBaseScene = (sceneId: string) => {
    setBaseSceneId(sceneId)
    setDraft(cloneScenarioTemplate(sceneId))
  }

  return (
    <div className="mt-4 rounded-3xl border border-amber-400/20 bg-amber-400/5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-200/80">
            {t('scene.editor_label')}
          </span>
          <h3 className="mt-2 text-lg font-bold text-white">{t('scene.editor_title')}</h3>
          <p className="mt-1 text-sm text-slate-400">{t('scene.editor_desc')}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 transition-colors hover:border-white/20 hover:text-white"
        >
          {t('scene.editor_close')}
        </button>
      </div>

      <label className="mt-5 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
        {t('scene.editor_base')}
      </label>
      <select
        value={baseSceneId}
        onChange={(event) => resetToBaseScene(event.target.value)}
        className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-300/50 focus:ring-1 focus:ring-amber-300/30"
      >
        {baseSceneOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <label className="mt-5 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
        {t('scene.editor_scene_name')}
      </label>
      <input
        value={draft.name}
        onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
        className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-300/50 focus:ring-1 focus:ring-amber-300/30"
      />

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-slate-950/40 p-4">
          <h4 className="text-sm font-semibold text-white">{t('scene.editor_buildings')}</h4>
          <div className="mt-3 space-y-3">
            {draft.buildings.map((building, index) => (
              <label key={building.id} className="block">
                <span className="mb-1 block text-xs text-slate-400">{building.type}</span>
                <input
                  value={building.name}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      buildings: prev.buildings.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, name: event.target.value } : item,
                      ),
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-300/50 focus:ring-1 focus:ring-amber-300/30"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-slate-950/40 p-4">
          <h4 className="text-sm font-semibold text-white">{t('scene.editor_residents')}</h4>
          <div className="mt-3 space-y-3">
            {draft.residents.map((resident, index) => (
              <div key={resident.id} className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">{t('scene.editor_resident_name')}</span>
                  <input
                    value={resident.name}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        residents: prev.residents.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, name: event.target.value } : item,
                        ),
                      }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-300/50 focus:ring-1 focus:ring-amber-300/30"
                  />
                </label>
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs text-slate-400">{t('scene.editor_resident_personality')}</span>
                  <textarea
                    value={resident.personality ?? ''}
                    rows={3}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        residents: prev.residents.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, personality: event.target.value } : item,
                        ),
                      }))
                    }
                    className="w-full resize-none rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-300/50 focus:ring-1 focus:ring-amber-300/30"
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => resetToBaseScene(baseSceneId)}
          className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-white/20 hover:text-white"
        >
          {t('scene.editor_reset')}
        </button>
        <button
          type="button"
          onClick={() => onSave({ scenario: draft, basedOn: baseSceneId })}
          className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          {t('scene.editor_save')}
        </button>
      </div>
    </div>
  )
}
