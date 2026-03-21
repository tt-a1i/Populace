import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ResidentAchievement, ResidentRelationship } from '../../services/api'
import { getResidentAchievements, getResidentRelationships } from '../../services/api'
import { useSimulationStore } from '../../stores/simulation'

interface CompareData {
  name: string
  mood: string
  personality: string
  coins: number
  occupation: string
  relationshipCount: number
  achievementCount: number
}

function moodEmoji(mood: string): string {
  const map: Record<string, string> = {
    happy: '😄', sad: '😢', angry: '😠', neutral: '😐', excited: '🤩', anxious: '😰',
  }
  return map[mood] ?? '😐'
}

function occupationLabel(occ: string): string {
  const map: Record<string, string> = {
    unemployed: '无业', barista: '咖啡师', teacher: '教师', shopkeeper: '店主',
    fisherman: '渔夫', chef: '厨师', doctor: '医生',
  }
  return map[occ] ?? occ
}

interface RowProps {
  label: string
  a: string | number
  b: string | number
}

function CompareRow({ label, a, b }: RowProps) {
  const diff = typeof a === 'number' && typeof b === 'number' && a !== b
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl px-3 py-2 even:bg-white/4">
      <div className={`text-right text-sm ${diff && a > b ? 'font-semibold text-cyan-300' : 'text-slate-200'}`}>{a}</div>
      <div className="min-w-[6rem] text-center text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`text-left text-sm ${diff && b > a ? 'font-semibold text-amber-300' : 'text-slate-200'}`}>{b}</div>
    </div>
  )
}

export function ComparePanel() {
  const { t } = useTranslation()
  const residents = useSimulationStore((s) => s.residents)
  const [idA, setIdA] = useState<string>('')
  const [idB, setIdB] = useState<string>('')
  const [dataA, setDataA] = useState<CompareData | null>(null)
  const [dataB, setDataB] = useState<CompareData | null>(null)
  const [loading, setLoading] = useState(false)

  const residentById = (id: string) => residents.find((r) => r.id === id)

  async function fetchData(id: string): Promise<CompareData | null> {
    const r = residentById(id)
    if (!r) return null
    const [rels, achs] = await Promise.all([
      getResidentRelationships(id).catch((): ResidentRelationship[] => []),
      getResidentAchievements(id).catch((): ResidentAchievement[] => []),
    ])
    return {
      name: r.name,
      mood: r.mood ?? 'neutral',
      personality: r.personality ?? '—',
      coins: r.coins ?? 100,
      occupation: r.occupation ?? 'unemployed',
      relationshipCount: rels.length,
      achievementCount: achs.filter((a) => a.unlocked).length,
    }
  }

  const handleCompare = async () => {
    if (!idA || !idB || idA === idB) return
    setLoading(true)
    const [a, b] = await Promise.all([fetchData(idA), fetchData(idB)])
    setDataA(a)
    setDataB(b)
    setLoading(false)
  }

  const handleSelectA = (id: string) => { setIdA(id); setDataA(null); setDataB(null) }
  const handleSelectB = (id: string) => { setIdB(id); setDataA(null); setDataB(null) }

  const selectClass =
    'rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-400/50'

  return (
    <div className="rounded-xl border border-white/10 bg-white/4 p-5">
      <p className="mb-1 text-[10px] uppercase tracking-[0.3em] text-slate-400">
        {t('compare.badge')}
      </p>
      <h3 className="mb-4 text-base font-semibold text-white">{t('compare.title')}</h3>

      {/* Selectors */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select className={selectClass} value={idA} onChange={(e) => handleSelectA(e.target.value)}>
          <option value="">{t('compare.select_a')}</option>
          {residents.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <span className="text-slate-500">vs</span>
        <select className={selectClass} value={idB} onChange={(e) => handleSelectB(e.target.value)}>
          <option value="">{t('compare.select_b')}</option>
          {residents.filter((r) => r.id !== idA).map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleCompare}
          disabled={!idA || !idB || idA === idB || loading}
          className="rounded-full border border-cyan-300/30 bg-cyan-300/12 px-4 py-1.5 text-sm text-cyan-50 transition hover:bg-cyan-300/20 disabled:opacity-40"
        >
          {loading ? t('compare.comparing') : t('compare.compare')}
        </button>
      </div>

      {/* Results */}
      {dataA && dataB && (
        <div>
          {/* Header */}
          <div className="mb-2 grid grid-cols-[1fr_auto_1fr] gap-2 px-3">
            <div className="text-right text-sm font-semibold text-cyan-200">{dataA.name}</div>
            <div className="min-w-[6rem]" />
            <div className="text-left text-sm font-semibold text-amber-200">{dataB.name}</div>
          </div>

          {/* Rows */}
          <div className="grid gap-0.5">
            <CompareRow label={t('compare.mood')} a={`${moodEmoji(dataA.mood)} ${dataA.mood}`} b={`${moodEmoji(dataB.mood)} ${dataB.mood}`} />
            <CompareRow label={t('compare.occupation')} a={occupationLabel(dataA.occupation)} b={occupationLabel(dataB.occupation)} />
            <CompareRow label={t('compare.coins')} a={dataA.coins} b={dataB.coins} />
            <CompareRow label={t('compare.relationships')} a={dataA.relationshipCount} b={dataB.relationshipCount} />
            <CompareRow label={t('compare.achievements')} a={dataA.achievementCount} b={dataB.achievementCount} />
            <div className="mt-1 rounded-xl bg-white/4 px-3 py-2">
              <div className="mb-1 text-center text-[10px] uppercase tracking-widest text-slate-500">{t('compare.personality')}</div>
              <div className="grid grid-cols-2 gap-3">
                <p className="text-right text-xs leading-5 text-slate-300">{dataA.personality}</p>
                <p className="text-left text-xs leading-5 text-slate-300">{dataB.personality}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {!dataA && !dataB && (idA || idB) && (
        <p className="text-center text-sm text-slate-500">{t('compare.hint')}</p>
      )}
    </div>
  )
}
