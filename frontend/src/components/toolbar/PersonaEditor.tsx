import { useEffect, useMemo, useState } from 'react'

import { getResidents, updateResident, type ApiResident } from '../../services/api'
import { useSimulationStore } from '../../stores'

const moodOptions = ['neutral', 'happy', 'sad', 'angry']

export function PersonaEditor() {
  const simulationResidents = useSimulationStore((state) => state.residents)
  const [residents, setResidents] = useState<ApiResident[]>([])
  const [residentId, setResidentId] = useState('')
  const [name, setName] = useState('')
  const [personality, setPersonality] = useState('温和、好奇、爱打听')
  const [mood, setMood] = useState('neutral')
  const [goals, setGoals] = useState('想搞清楚湖边的传闻, 今晚想约朋友散步')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  const selectedResident = useMemo(
    () => residents.find((resident) => resident.id === residentId) ?? residents[0],
    [residentId, residents],
  )

  useEffect(() => {
    let active = true

    const loadResidents = async () => {
      setLoading(true)
      setLoadFailed(false)

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
        setLoadFailed(true)
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
    setPersonality(selectedResident.personality ?? '温和、好奇、爱打听')
    setMood(selectedResident.mood ?? 'neutral')
    setGoals((selectedResident.goals ?? ['想搞清楚湖边的传闻', '今晚想约朋友散步']).join(', '))
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
      <div className="grid gap-4 rounded-[24px] border border-white/10 bg-slate-950/70 p-4 text-slate-100 shadow-[0_18px_44px_rgba(15,23,42,0.35)]">
        <p className="text-[11px] uppercase tracking-[0.3em] text-amber-100/70">Persona Editor</p>
        <p className="text-sm text-slate-300">正在同步居民列表...</p>
      </div>
    )
  }

  if (!residents.length) {
    return (
      <div className="grid gap-4 rounded-[24px] border border-white/10 bg-slate-950/70 p-4 text-slate-100 shadow-[0_18px_44px_rgba(15,23,42,0.35)]">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-amber-100/70">Persona Editor</p>
          <h3 className="mt-2 font-display text-2xl text-white">暂无可编辑对象</h3>
        </div>
        <p className="text-sm leading-6 text-slate-300">暂无居民，请先启动模拟。</p>
        {loadFailed ? (
          <p className="text-xs uppercase tracking-[0.24em] text-rose-200/70">
            后端暂不可达，当前不会回退到前端 mock 居民。
          </p>
        ) : (
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
            地图仍可使用 simulation store 的默认占位居民做前端演示，但人设编辑仅面向后端真实居民。
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-4 rounded-[24px] border border-white/10 bg-slate-950/70 p-4 text-slate-100 shadow-[0_18px_44px_rgba(15,23,42,0.35)]">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-amber-100/70">Persona Editor</p>
        <h3 className="mt-2 font-display text-2xl text-white">改写居民命运</h3>
      </div>

      <label className="grid gap-2 text-sm text-slate-300">
        选择居民
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
        名字
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-50 outline-none focus:border-amber-300/40"
        />
      </label>

      <label className="grid gap-2 text-sm text-slate-300">
        性格描述
        <textarea
          value={personality}
          onChange={(event) => setPersonality(event.target.value)}
          rows={3}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-50 outline-none focus:border-amber-300/40"
        />
      </label>

      <label className="grid gap-2 text-sm text-slate-300">
        当前情绪
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
        目标（用逗号分隔）
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
        保存人设
      </button>

      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
        simulation store 当前有 {simulationResidents.length} 个默认占位居民；编辑器仅使用后端返回的真实居民。
      </p>
    </div>
  )
}
