import { useEffect, useState } from 'react'

import { getWorldReligion, type WorldReligionPayload } from '../../services/api'
import { PanelShell } from '../ui/PanelShell'
import { PanelEmptyState, PanelSkeletonGrid, PanelSpinner } from '../ui/PanelStates'

const EMPTY_RELIGION: WorldReligionPayload = {
  distribution: [],
  morality_index: 0,
  morality_history: [],
  events: [],
  leaders: [],
}

export function ReligionPanel() {
  const [data, setData] = useState<WorldReligionPayload>(EMPTY_RELIGION)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const nextData = await getWorldReligion()
        if (!cancelled) {
          setData(nextData)
        }
      } catch {
        if (!cancelled) {
          setData(EMPTY_RELIGION)
          setError('信仰数据加载失败')
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

  return (
    <PanelShell icon="🕯️" title="信仰面板" badge="Faith">
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {loading ? (
        <>
          <PanelSpinner title="信仰数据加载中…" message="正在汇总信仰分布、道德走势与宗教活动。" />
          <PanelSkeletonGrid columns={3} rows={2} />
        </>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard label="道德指数" value={`${Math.round(data.morality_index * 100)}%`} />
        <MetricCard label="宗教活动" value={String(data.events.length)} />
        <MetricCard label="宗教领袖" value={String(data.leaders.length)} />
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.05fr,0.95fr]">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white">信仰分布</h4>
            <span className="text-xs text-slate-400">{data.distribution.length} 类</span>
          </div>
          <div className="mt-3 grid gap-3">
            {data.distribution.length === 0 ? (
              <PanelEmptyState title="暂无信仰分布" message="等待居民形成稳定信仰后，这里会展示全镇结构。" />
            ) : (
              data.distribution.map((entry) => (
                <div key={entry.religion} className="grid gap-1">
                  <div className="flex items-center justify-between text-sm text-slate-200">
                    <span>{entry.label}</span>
                    <span>{entry.count} 人</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-900/60">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-rose-400"
                      style={{ width: `${Math.max(10, entry.share * 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <h4 className="text-sm font-semibold text-white">宗教领袖</h4>
          <div className="mt-3 grid gap-2">
            {data.leaders.length === 0 ? (
              <PanelEmptyState title="暂无神职人员" message="当居民虔诚度与声望足够高时，会在这里出现。" />
            ) : (
              data.leaders.map((leader, index) => (
                <div key={leader.resident_id} className="rounded-lg bg-slate-900/40 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-white">#{index + 1} {leader.resident_name}</p>
                    <span className="text-xs text-amber-300">{Math.round(leader.piety * 100)}%</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {leader.religion} · 声望 {Math.round(leader.reputation * 100)}%
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
        <h4 className="text-sm font-semibold text-white">道德走势</h4>
        {data.morality_history.length === 0 ? (
          <div className="mt-3">
            <PanelEmptyState title="暂无走势数据" message="宗教活动和居民选择积累后，这里会显示道德曲线。" />
          </div>
        ) : (
          <div className="mt-3 flex items-end gap-2 overflow-x-auto">
            {data.morality_history.map((point) => (
              <div key={point.tick} className="flex min-w-10 flex-col items-center gap-2">
                <div
                  className="w-6 rounded-t bg-emerald-400/75"
                  style={{ height: `${Math.max(10, point.morality_index * 80)}px` }}
                />
                <span className="text-[10px] text-slate-400">{point.tick}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">宗教事件</h4>
          <span className="text-xs text-slate-400">{data.events.length} 条</span>
        </div>
        <div className="mt-3 grid gap-2">
          {data.events.length === 0 ? (
            <PanelEmptyState title="暂无宗教事件" message="当礼拜、仪式或节庆出现后，这里会显示全镇记录。" />
          ) : (
            data.events.map((event) => (
              <article key={`${event.name}-${event.tick_start}`} className="rounded-lg bg-slate-900/40 px-3 py-3 text-sm text-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <span>{event.name}</span>
                  <span className="text-xs text-slate-400">Tick {event.tick_start}</span>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {event.event_type} · {event.religion} · {event.participants.length} 人 · 道德 +{Math.round(event.morality_boost * 100)}%
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
