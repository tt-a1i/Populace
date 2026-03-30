import { useEffect, useState } from 'react'

import { getWorldHealth, type WorldHealthPayload } from '../../services/api'
import { PanelShell } from '../ui/PanelShell'
import { PanelEmptyState, PanelSkeletonGrid, PanelSpinner } from '../ui/PanelStates'
import { SparkLine } from '../ui/SparkLine'

const EMPTY_HEALTH: WorldHealthPayload = {
  active_cases: 0,
  contagious_cases: 0,
  hospitalized_count: 0,
  treatment_rate: 0,
  average_hp: 0,
  illness_counts: {},
  outbreak_hotspots: [],
}

export function HealthPanel() {
  const [data, setData] = useState<WorldHealthPayload>(EMPTY_HEALTH)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await getWorldHealth())
    } catch {
      setData(EMPTY_HEALTH)
      setError('健康数据加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const loadInitial = async () => {
      try {
        const nextData = await getWorldHealth()
        if (!cancelled) {
          setData(nextData)
        }
      } catch {
        if (!cancelled) {
          setData(EMPTY_HEALTH)
          setError('健康数据加载失败')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadInitial()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <PanelShell icon="🩺" title="健康面板" badge="Health">
      <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">疫情总览</p>
          <p className="mt-2 text-3xl font-semibold text-white">{data.active_cases}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          aria-label="刷新健康"
        >
          刷新健康
        </button>
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {loading ? (
        <>
          <PanelSpinner title="健康数据加载中…" message="正在统计病例、治疗率和风险热区。" />
          <PanelSkeletonGrid columns={4} />
        </>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard label="传染病例" value={String(data.contagious_cases)} />
        <MetricCard label="住院人数" value={String(data.hospitalized_count)} />
        <MetricCard label="治疗率" value={`${Math.round(data.treatment_rate * 100)}%`} />
        <MetricCard label="平均 HP" value={`${Math.round(data.average_hp * 100)}%`} />
      </section>

      {Object.values(data.illness_counts).length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <SparkLine
            data={Object.values(data.illness_counts).map(Number)}
            color="#f43f5e"
            label="Cases by Type"
            width={280}
            height={48}
          />
        </div>
      )}

      <section className="grid gap-3 lg:grid-cols-[1fr,1fr]">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <h4 className="text-sm font-semibold text-white">疾病类型</h4>
          <div className="mt-3 grid gap-2">
            {Object.entries(data.illness_counts).length === 0 ? (
              <PanelEmptyState title="暂无疾病记录" message="目前没有记录到任何疾病或伤病。" />
            ) : (
              Object.entries(data.illness_counts).map(([illness, count]) => (
                <div key={illness} className="flex items-center justify-between rounded-lg bg-slate-900/40 px-3 py-2 text-sm text-slate-200">
                  <span>{illness}</span>
                  <span>{count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <h4 className="text-sm font-semibold text-white">高风险区域</h4>
          <div className="mt-3 grid gap-2">
            {data.outbreak_hotspots.length === 0 ? (
              <PanelEmptyState title="暂无风险热区" message="目前没有需要重点关注的健康风险区域。" />
            ) : (
              data.outbreak_hotspots.map((spot) => (
                <div key={spot.location} className="rounded-lg bg-slate-900/40 px-3 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm text-white">
                    <span>{spot.location}</span>
                    <span>{spot.cases}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-900/60">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500"
                      style={{ width: `${Math.max(10, spot.intensity * 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </PanelShell>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  )
}
