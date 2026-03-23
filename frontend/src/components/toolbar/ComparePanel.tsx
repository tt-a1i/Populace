import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ResidentAchievement, ResidentRelationship } from '../../services/api'
import { getResidentAchievements, getResidentRelationships } from '../../services/api'
import { generateResidentAvatarDataUrl } from '../../lib/residentAvatar'
import { useSimulationStore } from '../../stores/simulation'
import { EmptyState } from '../ui/EmptyState'
import { PanelShell } from '../ui/PanelShell'

interface CompareData {
  name: string
  mood: string
  personality: string
  coins: number
  occupation: string
  relationshipCount: number
  achievementCount: number
  avatarUrl: string
}

function moodEmoji(mood: string): string {
  const map: Record<string, string> = {
    happy: '😄', sad: '😢', angry: '😠', neutral: '😐', excited: '🤩', anxious: '😰',
  }
  return map[mood] ?? '😐'
}

function occupationLabel(occ: string): string {
  return occ.charAt(0).toUpperCase() + occ.slice(1)
}

function CompareRow({ label, a, b }: { label: string; a: string | number; b: string | number }) {
  const diff = typeof a === 'number' && typeof b === 'number' && a !== b
  const aHigher = diff && (a as number) > (b as number)
  const bHigher = diff && (b as number) > (a as number)
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg px-3 py-2 even:bg-white/[0.03]">
      <div className={`text-right text-sm ${aHigher ? 'font-semibold text-cyan-300' : 'text-slate-200'}`}>
        {aHigher && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-cyan-400" />}
        {a}
      </div>
      <div className="min-w-[6rem] text-center text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`text-left text-sm ${bHigher ? 'font-semibold text-amber-300' : 'text-slate-200'}`}>
        {b}
        {bHigher && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />}
      </div>
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
      avatarUrl: generateResidentAvatarDataUrl(r),
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

  return (
    <PanelShell
      icon="⚖️"
      title={t('compare.title')}
      badge={t('compare.badge')}
    >
      {/* ── Selectors (side-by-side) ── */}
      <div className="flex flex-wrap items-center gap-3">
        <select className="panel-select flex-1 min-w-[120px]" value={idA} onChange={(e) => handleSelectA(e.target.value)}>
          <option value="">{t('compare.select_a')}</option>
          {residents.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <span className="text-sm font-semibold text-slate-500">vs</span>
        <select className="panel-select flex-1 min-w-[120px]" value={idB} onChange={(e) => handleSelectB(e.target.value)}>
          <option value="">{t('compare.select_b')}</option>
          {residents.filter((r) => r.id !== idA).map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleCompare}
          disabled={!idA || !idB || idA === idB || loading}
          className="btn-primary rounded-xl px-4 py-2 text-sm font-medium transition duration-200 active:scale-95"
        >
          {loading ? t('compare.comparing') : t('compare.compare')}
        </button>
      </div>

      {/* ── Results (dual-column cards) ── */}
      {dataA && dataB ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          {/* Header with avatars */}
          <div className="mb-3 grid grid-cols-[1fr_auto_1fr] gap-2 px-3">
            <div className="flex items-center justify-end gap-2 text-right">
              <img src={dataA.avatarUrl} alt={`${dataA.name} avatar`} className="h-10 w-10 rounded-xl border border-white/10 object-cover" />
              <span className="text-sm font-semibold text-cyan-300">{dataA.name}</span>
            </div>
            <div className="min-w-[6rem]" />
            <div className="flex items-center gap-2 text-left">
              <img src={dataB.avatarUrl} alt={`${dataB.name} avatar`} className="h-10 w-10 rounded-xl border border-white/10 object-cover" />
              <span className="text-sm font-semibold text-amber-300">{dataB.name}</span>
            </div>
          </div>

          {/* Comparison rows */}
          <div className="grid gap-0.5">
            <CompareRow label={t('compare.mood')} a={`${moodEmoji(dataA.mood)} ${dataA.mood}`} b={`${moodEmoji(dataB.mood)} ${dataB.mood}`} />
            <CompareRow label={t('compare.occupation')} a={occupationLabel(dataA.occupation)} b={occupationLabel(dataB.occupation)} />
            <CompareRow label={t('compare.coins')} a={dataA.coins} b={dataB.coins} />
            <CompareRow label={t('compare.relationships')} a={dataA.relationshipCount} b={dataB.relationshipCount} />
            <CompareRow label={t('compare.achievements')} a={dataA.achievementCount} b={dataB.achievementCount} />
            <div className="mt-1 rounded-xl bg-white/[0.03] px-3 py-2">
              <div className="mb-1 text-center text-[10px] uppercase tracking-widest text-slate-500">{t('compare.personality')}</div>
              <div className="grid grid-cols-2 gap-3">
                <p className="text-right text-xs leading-5 text-slate-300">{dataA.personality}</p>
                <p className="text-left text-xs leading-5 text-slate-300">{dataB.personality}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          icon="⚖️"
          message={t('compare.hint')}
          hint={idA || idB ? undefined : t('compare.badge')}
        />
      )}
    </PanelShell>
  )
}
