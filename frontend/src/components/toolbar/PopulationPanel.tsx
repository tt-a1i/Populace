import { useEffect, useState } from 'react'

import { getWorldDemographics, type WorldDemographicsPayload } from '../../services/api'
import { PanelShell } from '../ui/PanelShell'
import { PanelEmptyState, PanelSkeletonGrid, PanelSpinner } from '../ui/PanelStates'

const EMPTY_DEMOGRAPHICS: WorldDemographicsPayload = {
  age_distribution: { child: 0, adult: 0, elder: 0 },
  aging_index: 0,
  average_age: 0,
  retired_count: 0,
  recent_deaths: 0,
  generational_timeline: [],
}

const AGE_TONES: Record<string, string> = {
  child: 'from-sky-400 via-cyan-400 to-blue-500',
  adult: 'from-emerald-400 via-teal-400 to-green-500',
  elder: 'from-amber-300 via-orange-400 to-rose-400',
}

export function PopulationPanel() {
  const [data, setData] = useState<WorldDemographicsPayload>(EMPTY_DEMOGRAPHICS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await getWorldDemographics())
    } catch {
      setData(EMPTY_DEMOGRAPHICS)
      setError('人口统计加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const loadInitial = async () => {
      try {
        const nextData = await getWorldDemographics()
        if (!cancelled) {
          setData(nextData)
        }
      } catch {
        if (!cancelled) {
          setData(EMPTY_DEMOGRAPHICS)
          setError('人口统计加载失败')
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

  const maxCount = Math.max(1, ...Object.values(data.age_distribution))

  return (
    <PanelShell icon="🧓" title="人口面板" badge="Demographics">
      <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">老龄化指数</p>
          <p className="mt-2 text-3xl font-semibold text-white">{data.aging_index.toFixed(2)}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          aria-label="刷新人口统计"
        >
          刷新人口统计
        </button>
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {loading ? (
        <>
          <PanelSpinner title="人口数据加载中…" message="正在整理年龄结构、退休人数和代际事件。" />
          <PanelSkeletonGrid columns={4} />
        </>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard label="平均年龄" value={`${Math.round(data.average_age)} tick`} />
        <MetricCard label="退休人数" value={String(data.retired_count)} />
        <MetricCard label="近期离世" value={String(data.recent_deaths)} />
        <MetricCard
          label="总人口"
          value={String(Object.values(data.age_distribution).reduce((sum, count) => sum + count, 0))}
        />
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-white">年龄金字塔</h4>
            <p className="mt-1 text-xs text-slate-400">child / adult / elder 三段人口结构</p>
          </div>
          <span className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1 text-xs text-slate-300">
            Population
          </span>
        </div>
        <div className="mt-4 grid gap-3">
          {Object.entries(data.age_distribution).map(([stage, count]) => (
            <div key={stage} className="grid gap-2">
              <div className="flex items-center justify-between text-sm text-slate-200">
                <span>{stage}</span>
                <span>{count}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-950/60">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${AGE_TONES[stage] ?? AGE_TONES.adult}`}
                  style={{ width: `${Math.max(8, (count / maxCount) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
        <h4 className="text-sm font-semibold text-white">历代居民时间线</h4>
        <div className="mt-3 grid gap-2">
          {data.generational_timeline.length === 0 ? (
            <PanelEmptyState title="暂无代际事件" message="继续模拟后，这里会出现出生、退休与离世记录。" />
          ) : (
            data.generational_timeline.map((entry) => (
              <div
                key={`${entry.tick}-${entry.type}-${entry.resident_name}`}
                className="rounded-lg border border-white/6 bg-slate-950/40 px-3 py-3"
              >
                <div className="flex items-center justify-between gap-3 text-sm text-white">
                  <span>{entry.summary}</span>
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Tick {entry.tick}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {entry.resident_name} · {entry.type}
                </p>
              </div>
            ))
          )}
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
