import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getResidents, updateResident, type ApiResident } from '../../services/api'
import { useSimulationStore } from '../../stores'

const moodOptions = ['neutral', 'happy', 'sad', 'angry']

export function PersonaEditor() {
  const { t } = useTranslation()
  const simulationResidents = useSimulationStore((state) => state.residents)
  const [residents, setResidents] = useState<ApiResident[]>([])
  const [residentId, setResidentId] = useState('')
  const [name, setName] = useState('')
  const [personality, setPersonality] = useState('')
  const [mood, setMood] = useState('neutral')
  const [goals, setGoals] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const selectedResident = useMemo(
    () => residents.find((resident) => resident.id === residentId) ?? residents[0],
    [residentId, residents],
  )

  useEffect(() => {
    let active = true

    const loadResidents = async () => {
      setLoading(true)

      try {
        const nextResidents = await getResidents() as ApiResident[]
        if (!active) {
          return
        }

        setResidents(nextResidents)
        setResidentId(nextResidents[0]?.id ?? '')
      } catch {
        if (!active) {
          return
        }
        
        setResidents([])
        setResidentId('')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadResidents()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!selectedResident) {
      setName('')
      return
    }

    setResidentId(selectedResident.id)
    setName(selectedResident.name)
    setPersonality(selectedResident.personality ?? t('persona.default_personality'))
    setMood(selectedResident.mood ?? 'neutral')
    setGoals((selectedResident.goals ?? t('persona.default_goals').split(', ')).join(', '))
  }, [selectedResident])

  const handleSave = async () => {
    if (!residentId) {
      return
    }

    setBusy(true)
    try {
      const updatedResident = await updateResident(residentId, {
        name: name.trim(),
        personality: personality.trim(),
        mood,
        goals: goals
          .split(',')
          .map((goal) => goal.trim())
          .filter(Boolean),
      })

      setResidents((currentResidents) =>
        currentResidents.map((resident) =>
          resident.id === residentId ? { ...resident, ...(updatedResident as ApiResident) } : resident,
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4 rounded-xl border border-white/10 bg-slate-950/70 p-4 text-slate-100 ">
        <p className="text-[11px] uppercase tracking-[0.3em] text-amber-100/70">{t('persona.badge')}</p>
        <p className="text-sm text-slate-300">{t('persona.loading')}</p>
      </div>
    )
  }

  if (!residents.length) {
    return (
      <div className="grid gap-4 rounded-xl border border-white/10 bg-slate-950/70 p-4 text-slate-100 ">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-amber-100/70">{t('persona.badge')}</p>
          <h3 className="mt-2 font-display text-2xl text-white">{t('persona.title')}</h3>
        </div>
        <p className="text-sm leading-6 text-slate-300">
          {t('persona.load_failed')}
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 rounded-xl border border-white/10 bg-slate-950/70 p-4 text-slate-100 ">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-amber-100/70">{t('persona.badge')}</p>
        <h3 className="mt-2 font-display text-2xl text-white">{t('persona.title')}</h3>
      </div>

      <label className="grid gap-2 text-sm text-slate-300">
        {t('persona.select')}
        <select
          value={residentId}
          onChange={(event) => setResidentId(event.target.value)}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-50 outline-none focus:border-amber-300/40"
        >
          {residents.map((resident) => (
            <option key={resident.id} value={resident.id}>
              {resident.name}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm text-slate-300">
        {t('persona.name')}
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-50 outline-none focus:border-amber-300/40"
        />
      </label>

      <label className="grid gap-2 text-sm text-slate-300">
        {t('persona.personality')}
        <textarea
          value={personality}
          onChange={(event) => setPersonality(event.target.value)}
          rows={3}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-50 outline-none focus:border-amber-300/40"
        />
      </label>

      <label className="grid gap-2 text-sm text-slate-300">
        {t('persona.mood')}
        <select
          value={mood}
          onChange={(event) => setMood(event.target.value)}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-50 outline-none focus:border-amber-300/40"
        >
          {moodOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm text-slate-300">
        {t('persona.goals')}
        <textarea
          value={goals}
          onChange={(event) => setGoals(event.target.value)}
          rows={3}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-50 outline-none focus:border-amber-300/40"
        />
      </label>

      <button
        type="button"
        disabled={busy || !residentId}
        onClick={() => void handleSave()}
        className="rounded-2xl border border-amber-300/30 bg-amber-300/15 px-5 py-3 text-sm font-medium text-amber-50 transition hover:bg-amber-300/25 disabled:opacity-50"
      >
        {t('persona.save')}
      </button>

      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
        {t('persona.hint', { count: simulationResidents.length })}
      </p>
    </div>
  )
}
