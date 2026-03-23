import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getResidentRelationships, getResidentAchievements } from '../../services/api'
import { generateResidentAvatarDataUrl } from '../../lib/residentAvatar'
import { useSimulationStore } from '../../stores/simulation'
import { PanelShell } from '../ui/PanelShell'

type SortKey = 'coins' | 'relationships' | 'achievements' | 'energy'

interface LeaderboardEntry {
  id: string
  name: string
  avatarUrl: string
  coins: number
  relationships: number
  achievements: number
  energy: number
}

const MEDAL_COLORS = ['#fbbf24', '#94a3b8', '#d97706'] // gold, silver, bronze
const MEDAL_ICONS = ['🥇', '🥈', '🥉']

const SORT_CONFIG: Record<SortKey, { icon: string; labelKey: string; unit: string }> = {
  coins: { icon: '🪙', labelKey: 'leaderboard.sort_coins', unit: '' },
  relationships: { icon: '🤝', labelKey: 'leaderboard.sort_relationships', unit: '' },
  achievements: { icon: '🏆', labelKey: 'leaderboard.sort_achievements', unit: '' },
  energy: { icon: '⚡', labelKey: 'leaderboard.sort_energy', unit: '' },
}

export function LeaderboardPanel() {
  const { t } = useTranslation()
  const residents = useSimulationStore((s) => s.residents)
  const [sortKey, setSortKey] = useState<SortKey>('coins')
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const results: LeaderboardEntry[] = []
    for (const r of residents) {
      const [rels, achs] = await Promise.all([
        getResidentRelationships(r.id).catch(() => []),
        getResidentAchievements(r.id).catch(() => []),
      ])
      results.push({
        id: r.id,
        name: r.name,
        avatarUrl: generateResidentAvatarDataUrl(r),
        coins: r.coins ?? 100,
        relationships: rels.length,
        achievements: achs.filter((a) => a.unlocked).length,
        energy: r.energy ?? 50,
      })
    }
    setEntries(results)
    setLoading(false)
  }, [residents])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchData()
    }, 0)
    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [fetchData])

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => b[sortKey] - a[sortKey])
  }, [entries, sortKey])

  return (
    <PanelShell
      icon="🏆"
      title={t('leaderboard.title', { defaultValue: 'Leaderboard' })}
      badge={t('leaderboard.badge', { defaultValue: 'Rankings' })}
    >
      {/* Sort tabs */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(SORT_CONFIG) as SortKey[]).map((key) => {
          const cfg = SORT_CONFIG[key]
          const active = sortKey === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSortKey(key)}
              className={[
                'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition duration-200 active:scale-95',
                active
                  ? 'theme-accent-button-active'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
              ].join(' ')}
            >
              <span>{cfg.icon}</span>
              {t(cfg.labelKey, { defaultValue: key.charAt(0).toUpperCase() + key.slice(1) })}
            </button>
          )
        })}
      </div>

      {/* Leaderboard list */}
      {loading ? (
        <div className="py-6 text-center text-sm text-slate-500">{t('stats.loading', { defaultValue: 'Loading...' })}</div>
      ) : (
        <div className="max-h-[45vh] space-y-1.5 overflow-y-auto">
          {sorted.map((entry, i) => {
            const rank = i + 1
            const isTop3 = rank <= 3
            const value = entry[sortKey]
            return (
              <div
                key={entry.id}
                className={[
                  'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition duration-150',
                  isTop3
                    ? 'border-white/[0.08] bg-white/[0.04]'
                    : 'border-transparent hover:bg-white/[0.02]',
                ].join(' ')}
              >
                {/* Rank */}
                <div className="w-7 shrink-0 text-center">
                  {isTop3 ? (
                    <span className="text-base">{MEDAL_ICONS[i]}</span>
                  ) : (
                    <span className="text-xs font-semibold text-slate-500">#{rank}</span>
                  )}
                </div>

                {/* Avatar */}
                <img
                  src={entry.avatarUrl}
                  alt={entry.name}
                  className="h-8 w-8 shrink-0 rounded-lg border object-cover"
                  style={{ borderColor: isTop3 ? MEDAL_COLORS[i] + '55' : 'rgba(255,255,255,0.06)' }}
                />

                {/* Name */}
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm ${isTop3 ? 'font-semibold text-white' : 'text-slate-200'}`}>
                    {entry.name}
                  </p>
                </div>

                {/* Value */}
                <span
                  className="shrink-0 text-sm font-semibold tabular-nums"
                  style={{ color: isTop3 ? MEDAL_COLORS[i] : '#94a3b8' }}
                >
                  {sortKey === 'energy' ? value.toFixed(0) : value}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </PanelShell>
  )
}
