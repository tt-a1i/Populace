import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getTownLevel, type TownLevelPayload } from '../../services/api'
import { PanelShell } from '../ui/PanelShell'
import { PanelSkeletonGrid, PanelSpinner } from '../ui/PanelStates'

const RATING_LABELS: Record<string, { label: string; icon: string }> = {
  population: { label: '人口', icon: '👥' },
  happiness: { label: '幸福', icon: '😊' },
  economy: { label: '经济', icon: '💰' },
  safety: { label: '治安', icon: '🛡️' },
  education: { label: '教育', icon: '📚' },
  culture: { label: '文化', icon: '🎨' },
}

export function MilestonePanel() {
  const { t } = useTranslation()
  const [data, setData] = useState<TownLevelPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void getTownLevel()
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setError(t('milestones.error', '里程碑数据加载失败')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [t])

  const achieved = data?.milestones.filter((m) => m.achieved) ?? []
  const pending = data?.milestones.filter((m) => !m.achieved) ?? []

  return (
    <PanelShell icon="🏅" title={t('milestones.title', '里程碑与城镇等级')} badge="Milestones">
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {loading ? (
        <>
          <PanelSpinner title={t('milestones.loading', '加载中…')} message={t('milestones.loading_msg', '正在计算城镇评级与里程碑进度。')} />
          <PanelSkeletonGrid columns={3} rows={1} />
        </>
      ) : null}

      {data && (
        <>
          {/* Level badge */}
          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-amber-400/40 bg-amber-400/10 text-xl font-bold text-amber-300">
                {data.level}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Lv.{data.level} {t('milestones.town', '小镇')}</p>
                <p className="text-[10px] text-slate-500">
                  {t('milestones.next_at', '下一级')} {Math.round(data.next_level_threshold * 100)}%
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-cyan-300">{Math.round(data.rating.composite * 100)}%</p>
              <p className="text-[10px] text-slate-500">{t('milestones.composite', '综合评分')}</p>
            </div>
          </div>

          {/* Rating breakdown */}
          <div className="grid gap-2 sm:grid-cols-3">
            {Object.entries(RATING_LABELS).map(([key, meta]) => {
              const value = (data.rating as unknown as Record<string, number>)[key] ?? 0
              return (
                <div key={key} className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{meta.icon}</span>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400">{meta.label}</p>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-cyan-400/60 transition-all duration-500"
                      style={{ width: `${Math.round(value * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-right text-[10px] text-slate-500">{Math.round(value * 100)}%</p>
                </div>
              )
            })}
          </div>

          {/* Achieved milestones */}
          {achieved.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="panel-section-label mb-2">{t('milestones.achieved', '已达成')}</p>
              <div className="grid gap-2">
                {achieved.map((ms) => (
                  <div key={ms.id} className="flex items-center gap-3 rounded-lg bg-emerald-400/5 border border-emerald-400/15 px-3 py-2">
                    <span className="text-lg">✅</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-emerald-200">{ms.name}</p>
                      <p className="text-[10px] text-slate-400">{ms.description}</p>
                    </div>
                    {ms.unlocks.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {ms.unlocks.map((u) => (
                          <span key={u} className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] text-emerald-300">{u}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending milestones */}
          {pending.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="panel-section-label mb-2">{t('milestones.pending', '待达成')}</p>
              <div className="grid gap-2">
                {pending.map((ms) => (
                  <div key={ms.id} className="flex items-center gap-3 rounded-lg bg-white/[0.02] border border-white/[0.06] px-3 py-2">
                    <span className="text-lg opacity-40">🔒</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-300">{ms.name}</p>
                      <p className="text-[10px] text-slate-500">{ms.description}</p>
                    </div>
                    {ms.unlocks.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {ms.unlocks.map((u) => (
                          <span key={u} className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] text-slate-500">{u}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unlocked content */}
          {data.unlocks.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="panel-section-label mb-2">{t('milestones.unlocked', '已解锁')}</p>
              <div className="flex flex-wrap gap-2">
                {data.unlocks.map((u) => (
                  <span key={u} className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-xs text-amber-200">{u}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </PanelShell>
  )
}
