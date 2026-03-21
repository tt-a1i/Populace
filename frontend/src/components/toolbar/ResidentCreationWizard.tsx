import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { createResident, getResidents, type ApiResident } from '../../services/api'
import { useSimulationStore } from '../../stores'

const PERSONALITY_PRESETS = [
  '外向开朗，热爱社交，充满活力',
  '内向安静，温和细腻，喜欢独处',
  '好奇心旺盛，爱探索，思维活跃',
  '认真负责，勤劳踏实，值得信赖',
  '幽默风趣，乐观开朗，擅长化解尴尬',
  '神秘低调，城府深，难以看透',
]

const MOOD_OPTIONS = ['neutral', 'happy', 'content', 'excited', 'sad', 'tired', 'angry']
const REL_TYPES = ['knows', 'friendship', 'love', 'rivalry']

interface RelSelection {
  resident_id: string
  type: string
  intensity: number
}

export function ResidentCreationWizard() {
  const { t } = useTranslation()
  const buildings = useSimulationStore((state) => state.buildings)
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [mood, setMood] = useState('neutral')
  const [homeBuildingId, setHomeBuildingId] = useState('')
  const [personality, setPersonality] = useState('')
  const [relationships, setRelationships] = useState<RelSelection[]>([])
  const [existingResidents, setExistingResidents] = useState<ApiResident[]>([])
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<ApiResident | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getResidents()
      .then((data) => setExistingResidents(data as ApiResident[]))
      .catch(() => {})
  }, [])

  const toggleRelationship = (residentId: string) => {
    setRelationships((prev) => {
      const exists = prev.find((r) => r.resident_id === residentId)
      if (exists) return prev.filter((r) => r.resident_id !== residentId)
      return [...prev, { resident_id: residentId, type: 'knows', intensity: 0.5 }]
    })
  }

  const updateRelType = (residentId: string, type: string) => {
    setRelationships((prev) =>
      prev.map((r) => (r.resident_id === residentId ? { ...r, type } : r)),
    )
  }

  const handleCreate = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await createResident({
        name: name.trim(),
        personality: personality.trim(),
        mood,
        home_building_id: homeBuildingId || undefined,
        initial_relationships: relationships,
      })
      setCreated(result)
    } catch {
      setError(t('create_resident.error'))
    } finally {
      setBusy(false)
    }
  }

  const handleReset = () => {
    setStep(0)
    setName('')
    setMood('neutral')
    setHomeBuildingId('')
    setPersonality('')
    setRelationships([])
    setCreated(null)
    setError('')
  }

  if (created) {
    return (
      <div className="grid gap-4 rounded-[24px] border border-emerald-300/20 bg-slate-950/70 p-4 text-slate-100 shadow-[0_18px_44px_rgba(15,23,42,0.35)]">
        <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-100/70">{t('create_resident.badge')}</p>
        <h3 className="font-display text-2xl text-white">{t('create_resident.success_title')}</h3>
        <p className="text-sm text-slate-300">{t('create_resident.success_desc', { name: created.name })}</p>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-2xl border border-emerald-300/30 bg-emerald-300/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-300/25"
        >
          {t('create_resident.add_another')}
        </button>
      </div>
    )
  }

  return (
    <div className="grid gap-4 rounded-[24px] border border-white/10 bg-slate-950/70 p-4 text-slate-100 shadow-[0_18px_44px_rgba(15,23,42,0.35)]">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-100/70">{t('create_resident.badge')}</p>
        <h3 className="mt-2 font-display text-2xl text-white">{t('create_resident.title')}</h3>
      </div>

      <div className="flex gap-2" aria-label="wizard-steps">
        {[0, 1, 2].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition ${s <= step ? 'bg-emerald-400/70' : 'bg-white/10'}`}
          />
        ))}
      </div>

      {step === 0 && (
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm text-slate-300">
            {t('create_resident.name')}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('create_resident.name_placeholder')}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-50 outline-none focus:border-emerald-300/40"
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            {t('create_resident.mood')}
            <select
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-50 outline-none focus:border-emerald-300/40"
            >
              {MOOD_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            {t('create_resident.home_building')}
            <select
              value={homeBuildingId}
              onChange={(e) => setHomeBuildingId(e.target.value)}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-50 outline-none focus:border-emerald-300/40"
            >
              <option value="">{t('create_resident.no_home')}</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.type})</option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => setStep(1)}
            disabled={!name.trim()}
            className="rounded-2xl border border-emerald-300/30 bg-emerald-300/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-300/25 disabled:opacity-40"
          >
            {t('create_resident.next')}
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{t('create_resident.personality')}</p>
          <div className="flex flex-wrap gap-2">
            {PERSONALITY_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setPersonality(preset)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  personality === preset
                    ? 'border-emerald-300/45 bg-emerald-300/16 text-emerald-50'
                    : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          <label className="grid gap-2 text-sm text-slate-300">
            {t('create_resident.personality_custom')}
            <textarea
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              rows={3}
              placeholder={t('create_resident.personality_placeholder')}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-50 outline-none focus:border-emerald-300/40"
            />
          </label>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(0)}
              className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 transition hover:bg-white/10"
            >
              {t('create_resident.back')}
            </button>
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!personality.trim()}
              className="flex-1 rounded-2xl border border-emerald-300/30 bg-emerald-300/15 px-4 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-300/25 disabled:opacity-40"
            >
              {t('create_resident.next')}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{t('create_resident.relationships')}</p>

          {existingResidents.length > 0 ? (
            <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
              {existingResidents.map((resident) => {
                const selected = relationships.find((r) => r.resident_id === resident.id)
                return (
                  <div
                    key={resident.id}
                    className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/3 px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={!!selected}
                      onChange={() => toggleRelationship(resident.id)}
                      className="accent-emerald-400"
                    />
                    <span className="flex-1 text-sm text-slate-200">{resident.name}</span>
                    {selected && (
                      <select
                        value={selected.type}
                        onChange={(e) => updateRelType(resident.id, e.target.value)}
                        className="rounded-xl border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-300 outline-none"
                      >
                        {REL_TYPES.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-400">{t('create_resident.no_residents')}</p>
          )}

          <div className="rounded-2xl border border-white/8 bg-white/3 px-4 py-3 text-sm">
            <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">{t('create_resident.summary')}</p>
            <p className="text-white"><span className="text-slate-400">{t('create_resident.name')}：</span>{name}</p>
            <p className="mt-1 text-white">
              <span className="text-slate-400">{t('create_resident.personality')}：</span>
              {personality.length > 24 ? personality.slice(0, 24) + '…' : personality}
            </p>
            <p className="mt-1 text-white"><span className="text-slate-400">{t('create_resident.mood')}：</span>{mood}</p>
            {relationships.length > 0 && (
              <p className="mt-1 text-white">
                <span className="text-slate-400">{t('create_resident.relationships')}：</span>{relationships.length}
              </p>
            )}
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={busy}
              className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
            >
              {t('create_resident.back')}
            </button>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={busy}
              className="flex-1 rounded-2xl border border-emerald-300/30 bg-emerald-300/15 px-4 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-300/25 disabled:opacity-40"
            >
              {busy ? t('create_resident.creating') : t('create_resident.confirm')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
