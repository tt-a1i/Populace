import { useEffect, useState } from 'react'

import { getWorldCulture, type WorldCulturePayload } from '../../services/api'
import { PanelShell } from '../ui/PanelShell'
import { PanelEmptyState, PanelSkeletonGrid, PanelSpinner } from '../ui/PanelStates'

const EMPTY_CULTURE: WorldCulturePayload = {
  events: [],
  prosperity_index: 0,
  prosperity_history: [],
  talent_rankings: [],
}

export function CulturePanel() {
  const [data, setData] = useState<WorldCulturePayload>(EMPTY_CULTURE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const nextData = await getWorldCulture()
        if (!cancelled) {
          setData(nextData)
        }
      } catch {
        if (!cancelled) {
          setData(EMPTY_CULTURE)
          setError('文化数据加载失败')
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
    <PanelShell icon="🎭" title="文化面板" badge="Culture">
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {loading ? (
        <>
          <PanelSpinner title="文化数据加载中…" message="正在整理活动、繁荣度与艺术人才榜。" />
          <PanelSkeletonGrid columns={3} rows={2} />
        </>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="文化繁荣度" value={`${Math.round(data.prosperity_index * 100)}%`} />
        <MetricCard label="活动数量" value={String(data.events.length)} />
        <MetricCard label="人才榜人数" value={String(data.talent_rankings.length)} />
      </div>

      <section className="grid gap-3 lg:grid-cols-[1fr,1fr]">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <h4 className="text-sm font-semibold text-white">文化活动</h4>
          <div className="mt-3 grid gap-2">
            {data.events.length === 0 ? (
              <PanelEmptyState title="暂无文化活动" message="等居民组织起演出、聚会或展览后，这里会展示文化脉搏。" />
            ) : (
              data.events.map((event) => (
                <article key={`${event.name}-${event.tick_start}`} className="rounded-lg bg-slate-900/40 px-3 py-3">
                  <p className="text-sm font-medium text-white">{event.name}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {event.type} · {event.participants.length} 人 · Tick {event.tick_start}
                  </p>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <h4 className="text-sm font-semibold text-white">艺术人才榜</h4>
          <div className="mt-3 grid gap-2">
            {data.talent_rankings.length === 0 ? (
              <PanelEmptyState title="暂无人才榜" message="当居民积累更多艺术技能与知识后，这里会出现排行。" />
            ) : (
              data.talent_rankings.map((entry, index) => (
                <div key={entry.resident_id} className="rounded-lg bg-slate-900/40 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-white">#{index + 1} {entry.resident_name}</p>
                    <span className="text-xs text-amber-300">{Math.round(entry.artistic_talent * 100)}%</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
        <h4 className="text-sm font-semibold text-white">繁荣度走势</h4>
        {data.prosperity_history.length === 0 ? (
          <div className="mt-3">
            <PanelEmptyState title="暂无走势数据" message="等待更多文化活动积累后，这里会显示繁荣曲线。" />
          </div>
        ) : (
          <div className="mt-3 flex items-end gap-2 overflow-x-auto">
            {data.prosperity_history.map((point) => (
              <div key={point.tick} className="flex min-w-10 flex-col items-center gap-2">
                <div
                  className="w-6 rounded-t bg-fuchsia-400/70"
                  style={{ height: `${Math.max(10, point.prosperity_index * 80)}px` }}
                />
                <span className="text-[10px] text-slate-400">{point.tick}</span>
              </div>
            ))}
          </div>
        )}
      </div>
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
