import { useEffect, useState } from 'react'

import {
  getWorldDisasters,
  type DisasterListResponse,
  type DisasterRecord,
} from '../../services/api'
import { PanelShell } from '../ui/PanelShell'
import { PanelEmptyState, PanelSkeletonGrid, PanelSpinner } from '../ui/PanelStates'

const EMPTY_DISASTERS: DisasterListResponse = {
  current: [],
  history: [],
  summary: {
    active_count: 0,
    history_count: 0,
    affected_buildings: 0,
    total_casualties: 0,
    reserve_spent: 0,
    by_type: {},
  },
}

export function EmergencyPanel() {
  const [data, setData] = useState<DisasterListResponse>(EMPTY_DISASTERS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await getWorldDisasters())
    } catch {
      setData(EMPTY_DISASTERS)
      setError('应急数据加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <PanelShell icon="🚨" title="应急面板" badge="Emergency">
      <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">当前灾害</p>
          <p className="mt-2 text-3xl font-semibold text-white">{data.summary.active_count}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          aria-label="刷新应急"
        >
          刷新应急
        </button>
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {loading ? (
        <>
          <PanelSpinner title="应急数据加载中…" message="正在汇总灾害时间线、损失和重建成本。" />
          <PanelSkeletonGrid columns={4} />
        </>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard label="受灾建筑" value={String(data.summary.affected_buildings)} />
        <MetricCard label="伤亡人数" value={String(data.summary.total_casualties)} />
        <MetricCard label="历史灾害" value={String(data.summary.history_count)} />
        <MetricCard label="储备消耗" value={String(Math.round(data.summary.reserve_spent))} />
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.05fr,0.95fr]">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white">当前警报</h4>
            <span className="text-xs text-slate-400">{data.current.length} 条</span>
          </div>
          <div className="mt-3 grid gap-2">
            {data.current.length === 0 ? (
              <PanelEmptyState title="当前暂无灾害" message="应急系统正在持续巡检，小镇暂时保持稳定。" />
            ) : (
              data.current.map((disaster) => <DisasterCard key={`${disaster.type}-${disaster.tick_start}`} disaster={disaster} />)
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <h4 className="text-sm font-semibold text-white">类型统计</h4>
          <div className="mt-3 grid gap-2">
            {Object.keys(data.summary.by_type).length === 0 ? (
              <PanelEmptyState title="暂无灾害记录" message="尚未记录到需要归档的灾害事件。" />
            ) : (
              Object.entries(data.summary.by_type).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between rounded-lg bg-slate-900/40 px-3 py-2 text-sm text-slate-200">
                  <span>{type}</span>
                  <span>{count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">灾害时间线</h4>
          <span className="text-xs text-slate-400">{data.history.length} 条</span>
        </div>
        <div className="mt-3 grid gap-2">
          {data.history.length === 0 ? (
            <PanelEmptyState title="暂无历史灾害" message="历史时间线还没有收录任何应急事件。" />
          ) : (
            data.history.map((disaster) => (
              <article key={`${disaster.type}-${disaster.tick_start}`} className="rounded-lg bg-slate-900/40 px-3 py-3 text-sm text-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <span>{disaster.type}</span>
                  <span className="text-xs text-slate-400">Tick {disaster.tick_start}</span>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  受灾建筑 {disaster.affected_buildings.length} · 伤亡 {disaster.casualties} · 撤离 {disaster.evacuations ?? 0}
                </p>
                {disaster.memorial ? <p className="mt-2 text-xs text-amber-100/80">{disaster.memorial}</p> : null}
              </article>
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

function DisasterCard({ disaster }: { disaster: DisasterRecord }) {
  return (
    <article className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-3 text-sm text-rose-50">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{disaster.type}</span>
        <span className="text-xs text-rose-100/70">Severity {disaster.severity.toFixed(2)}</span>
      </div>
      <p className="mt-2 text-xs text-rose-100/75">
        受灾建筑 {disaster.affected_buildings.length} · 伤亡 {disaster.casualties} · 撤离 {disaster.evacuations ?? 0}
      </p>
    </article>
  )
}
