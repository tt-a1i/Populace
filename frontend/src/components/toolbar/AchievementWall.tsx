import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type ResidentAchievement, getResidentAchievements } from '../../services/api'
import { useSimulationStore } from '../../stores/simulation'
import { PanelShell } from '../ui/PanelShell'

interface AchievementData {
  id: string
  name: string
  description: string
  icon: string
  unlocked: boolean
  residentName: string
  residentId: string
}

const ACHIEVEMENT_ICONS: Record<string, string> = {
  social_butterfly: '🦋',
  explorer: '🧭',
  wealthy: '💰',
  popular: '⭐',
  veteran: '🎖️',
  builder: '🏗️',
  lover: '💕',
  scholar: '📚',
}

export function AchievementWall() {
  const { t } = useTranslation()
  const residents = useSimulationStore((s) => s.residents)
  const [allAchievements, setAllAchievements] = useState<AchievementData[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    const results: AchievementData[] = []
    for (const r of residents) {
      const achs = await getResidentAchievements(r.id).catch((): ResidentAchievement[] => [])
      for (const a of achs) {
        results.push({
          id: `${r.id}:${a.id}`,
          name: a.name,
          description: a.description,
          icon: ACHIEVEMENT_ICONS[a.id] ?? a.icon ?? '🏅',
          unlocked: a.unlocked,
          residentName: r.name,
          residentId: r.id,
        })
      }
    }
    setAllAchievements(results)
    setLoading(false)
  }, [residents])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  const unlocked = useMemo(() => allAchievements.filter((a) => a.unlocked), [allAchievements])
  const locked = useMemo(() => allAchievements.filter((a) => !a.unlocked), [allAchievements])
  const totalUnique = useMemo(() => {
    const ids = new Set(allAchievements.map((a) => a.name))
    return ids.size
  }, [allAchievements])
  const unlockedUnique = useMemo(() => {
    const ids = new Set(unlocked.map((a) => a.name))
    return ids.size
  }, [unlocked])
  const unlockRate = totalUnique > 0 ? ((unlockedUnique / totalUnique) * 100).toFixed(0) : '0'

  // Recent unlocks (sorted by unique to show variety)
  const recentUnlocks = useMemo(() => {
    const seen = new Set<string>()
    const unique: AchievementData[] = []
    for (const a of unlocked) {
      if (!seen.has(a.id)) {
        seen.add(a.id)
        unique.push(a)
      }
    }
    return unique.slice(0, 10)
  }, [unlocked])

  return (
    <PanelShell
      icon="🏅"
      title={t('achievements.title', { defaultValue: 'Achievement Wall' })}
      badge={t('achievements.badge', { defaultValue: 'Achievements' })}
    >
      {loading ? (
        <div className="py-6 text-center text-sm text-slate-500">{t('stats.loading', { defaultValue: 'Loading...' })}</div>
      ) : (
        <>
          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-center">
              <p className="text-xl font-semibold text-white">{unlocked.length}</p>
              <p className="text-[9px] uppercase tracking-wider text-slate-500">{t('achievements.total_unlocked', { defaultValue: 'Unlocked' })}</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-center">
              <p className="text-xl font-semibold text-amber-400">{unlockRate}%</p>
              <p className="text-[9px] uppercase tracking-wider text-slate-500">{t('achievements.unlock_rate', { defaultValue: 'Unlock Rate' })}</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-center">
              <p className="text-xl font-semibold text-slate-300">{totalUnique}</p>
              <p className="text-[9px] uppercase tracking-wider text-slate-500">{t('achievements.total_types', { defaultValue: 'Types' })}</p>
            </div>
          </div>

          {/* Recent unlocks */}
          {recentUnlocks.length > 0 && (
            <div>
              <p className="panel-section-label mb-2">{t('achievements.recent', { defaultValue: 'Recent Unlocks' })}</p>
              <div className="space-y-1.5">
                {recentUnlocks.map((a) => (
                  <div key={a.id} className="flex items-center gap-2.5 rounded-lg bg-white/[0.03] px-3 py-2">
                    <span className="text-xl">{a.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{a.name}</p>
                      <p className="truncate text-[10px] text-slate-500">{a.residentName} — {a.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Achievement grid */}
          <div>
            <p className="panel-section-label mb-2">{t('achievements.all', { defaultValue: 'All Achievements' })}</p>
            <div className="grid max-h-[35vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-5">
              {/* Unlocked first */}
              {unlocked.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-col items-center gap-1 rounded-xl border border-amber-400/15 bg-amber-400/[0.05] px-2 py-2.5 text-center"
                  title={`${a.name} — ${a.residentName}\n${a.description}`}
                >
                  <span className="text-2xl">{a.icon}</span>
                  <span className="line-clamp-1 text-[9px] font-medium text-amber-200">{a.name}</span>
                  <span className="line-clamp-1 text-[8px] text-slate-500">{a.residentName}</span>
                </div>
              ))}
              {/* Locked */}
              {locked.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-col items-center gap-1 rounded-xl border border-white/[0.04] bg-white/[0.01] px-2 py-2.5 text-center opacity-40"
                  title={`${a.name} — ${a.residentName}\n${a.description}`}
                >
                  <span className="text-2xl grayscale">🔒</span>
                  <span className="line-clamp-1 text-[9px] font-medium text-slate-400">{a.name}</span>
                  <span className="line-clamp-1 text-[8px] text-slate-600">{a.residentName}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </PanelShell>
  )
}
