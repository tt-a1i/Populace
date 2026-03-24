import { useEffect, useState } from 'react'

import { getCrimeLog, getSafetyStats, type CrimeLogEntry, type SafetyStats } from '../../services/api'
import { PanelShell } from '../ui/PanelShell'

const EMPTY_STATS: SafetyStats = {
  safety_index: 1,
  average_safety_feeling: 1,
  total_crimes: 0,
  unresolved_crimes: 0,
  crimes_by_type: {},
  hotspots: [],
  flagged_residents: [],
  patrol_zones: [],
}

function formatScore(value: number) {
  return value.toFixed(2)
}

export function SecurityPanel() {
  const [stats, setStats] = useState<SafetyStats>(EMPTY_STATS)
  const [events, setEvents] = useState<CrimeLogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextStats, nextEvents] = await Promise.all([getSafetyStats(), getCrimeLog()])
      setStats(nextStats)
      setEvents(nextEvents)
    } catch {
      setError('治安数据加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <PanelShell icon="🛡️" title="治安面板" badge="Safety">
      <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">安全指数</p>
          <p className="mt-2 text-3xl font-semibold text-white">{formatScore(stats.safety_index)}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          aria-label="刷新治安"
        >
          刷新治安
        </button>
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-400">治安数据加载中…</p> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard label="平均安全感" value={formatScore(stats.average_safety_feeling)} />
        <MetricCard label="累计案件" value={String(stats.total_crimes)} />
        <MetricCard label="未结案件" value={String(stats.unresolved_crimes)} />
        <MetricCard label="重点人员" value={String(stats.flagged_residents.length)} />
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.1fr,0.9fr]">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white">犯罪热力图</h4>
            <span className="text-xs text-slate-400">{stats.hotspots.length} 个热区</span>
          </div>
          <div className="mt-3 grid gap-3">
            {stats.hotspots.length === 0 ? (
              <p className="text-sm text-slate-500">当前没有犯罪热区。</p>
            ) : (
              stats.hotspots.map((spot) => (
                <div key={spot.location} className="grid gap-1">
                  <div className="flex items-center justify-between text-sm text-slate-200">
                    <span>{spot.location}</span>
                    <span>{spot.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-900/60">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500"
                      style={{ width: `${Math.max(8, spot.intensity * 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <h4 className="text-sm font-semibold text-white">类型统计</h4>
          <div className="mt-3 grid gap-2">
            {Object.keys(stats.crimes_by_type).length === 0 ? (
              <p className="text-sm text-slate-500">暂无案件记录。</p>
            ) : (
              Object.entries(stats.crimes_by_type).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between rounded-lg bg-slate-900/40 px-3 py-2 text-sm text-slate-200">
                  <span>{type}</span>
                  <span>{count}</span>
                </div>
              ))
            )}
          </div>
          <div className="mt-4 grid gap-2 text-xs text-slate-400">
            <p>巡逻区域：{stats.patrol_zones.length > 0 ? stats.patrol_zones.join('、') : '暂无'}</p>
            <p>重点人员：{stats.flagged_residents.length > 0 ? stats.flagged_residents.join('、') : '暂无'}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">事件列表</h4>
          <span className="text-xs text-slate-400">{events.length} 条</span>
        </div>
        <div className="mt-3 grid gap-2">
          {events.length === 0 ? (
            <p className="text-sm text-slate-500">当前没有犯罪记录。</p>
          ) : (
            events.map((event, index) => (
              <article key={`${event.tick}-${event.perpetrator}-${index}`} className="rounded-lg bg-slate-900/40 px-3 py-3 text-sm text-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <span>{event.type}</span>
                  <span className="text-xs text-slate-400">Tick {event.tick}</span>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {event.perpetrator} → {event.victim ?? '公共设施'} · {event.location} · {event.resolved ? '已干预' : '未结案'}
                </p>
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
