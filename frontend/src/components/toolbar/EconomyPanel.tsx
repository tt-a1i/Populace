import { useEffect, useMemo, useState } from 'react'

import { getWorldEconomy, type WorldEconomyPayload } from '../../services/api'
import { PanelShell } from '../ui/PanelShell'
import { PanelEmptyState, PanelSkeletonGrid, PanelSpinner } from '../ui/PanelStates'

export function EconomyPanel() {
  const [data, setData] = useState<WorldEconomyPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const nextData = await getWorldEconomy()
        if (!cancelled) {
          setData(nextData)
        }
      } catch {
        if (!cancelled) {
          setData(null)
          setError('经济数据加载失败')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const latestGdpBars = useMemo(() => (data?.gdp_history ?? []).slice(-12), [data?.gdp_history])
  const employmentDistribution = useMemo(() => data?.employment_distribution ?? [], [data?.employment_distribution])
  const incomeDistribution = useMemo(() => data?.income_distribution ?? [], [data?.income_distribution])

  return (
    <PanelShell icon="💼" title="经济面板" badge="Economy">
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {loading ? (
        <>
          <PanelSpinner title="经济数据加载中…" message="正在汇总就业率、收入与 GDP 趋势。" />
          <PanelSkeletonGrid columns={3} rows={2} />
        </>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Employment</p>
          <p className="mt-1 text-lg font-semibold text-white">{Math.round((data?.employment_rate ?? 0) * 100)}%</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Avg Income</p>
          <p className="mt-1 text-lg font-semibold text-white">${Math.round(data?.average_income ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">GDP</p>
          <p className="mt-1 text-lg font-semibold text-white">${Math.round(data?.gdp ?? 0)}</p>
        </div>
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
        <p className="panel-section-label mb-2">就业结构</p>
        {employmentDistribution.length === 0 ? (
          <PanelEmptyState title="暂无就业结构数据" message="等待更多居民进入工作与消费循环后，这里会显示职业分布。" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {employmentDistribution.map((entry) => (
              <span key={entry.occupation} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200">
                {entry.occupation}: {entry.count}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
        <p className="panel-section-label mb-2">收入分布</p>
        {incomeDistribution.length === 0 ? (
          <PanelEmptyState title="暂无收入分布" message="等待居民开始领薪、购物和交易后，这里会显示收入分层。" />
        ) : (
          <div className="space-y-2">
            {incomeDistribution.map((entry) => (
              <div key={entry.bucket} className="flex items-center justify-between text-sm text-slate-200">
                <span>{entry.bucket}</span>
                <span>{entry.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
        <p className="panel-section-label mb-2">GDP 曲线</p>
        {latestGdpBars.length === 0 ? (
          <PanelEmptyState title="暂无 GDP 曲线" message="等待模拟运行几个 Tick 后，这里会出现经济曲线。" />
        ) : (
          <div className="flex items-end gap-1 overflow-x-auto">
            {latestGdpBars.map((point) => (
              <div
                key={point.tick}
                title={`tick ${point.tick}: ${point.gdp}`}
                className="w-4 shrink-0 rounded-t bg-emerald-400/70"
                style={{ height: `${Math.max(8, Number(point.gdp) * 2)}px` }}
              />
            ))}
          </div>
        )}
      </div>
    </PanelShell>
  )
}
