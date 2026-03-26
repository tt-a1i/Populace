import { useEffect, useState } from 'react'

import { getReputationRankings, type ReputationRankingEntry } from '../../services/api'
import { PanelShell } from '../ui/PanelShell'
import { PanelEmptyState, PanelSkeletonGrid, PanelSpinner } from '../ui/PanelStates'

export function ReputationPanel() {
  const [rankings, setRankings] = useState<ReputationRankingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setRankings(await getReputationRankings())
    } catch {
      setError('声望数据加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <PanelShell icon="🌟" title="声望排行榜" badge="Reputation">
      <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">名望热点</p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {rankings.length > 0 ? `${rankings.length}` : '--'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          aria-label="刷新声望"
        >
          刷新声望
        </button>
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {loading ? (
        <>
          <PanelSpinner title="声望数据加载中…" message="正在整理居民名望波动和近期热点事件。" />
          <PanelSkeletonGrid columns={2} rows={2} />
        </>
      ) : null}

      <section className="grid gap-3">
        {rankings.length === 0 && !loading ? (
          <PanelEmptyState title="当前还没有声望记录" message="等居民积累更多社交事件后，这里会出现排行榜。" />
        ) : (
          rankings.map((entry, index) => (
            <article
              key={entry.resident_id}
              className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-amber-300/80">#{index + 1}</span>
                    <h4 className="text-base font-semibold text-white">{entry.resident_name}</h4>
                    {entry.title ? (
                      <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] text-amber-100">
                        {entry.title}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    最近事件：{entry.recent_events.length > 0 ? entry.recent_events.join('、') : '暂无'}
                  </p>
                </div>
                <span className="text-lg font-semibold tabular-nums text-white">
                  {entry.reputation.toFixed(2)}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-900/60">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-300 to-emerald-300"
                  style={{ width: `${Math.max(6, ((entry.reputation + 1) / 2) * 100)}%` }}
                />
              </div>
            </article>
          ))
        )}
      </section>
    </PanelShell>
  )
}
