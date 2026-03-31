import { useEffect, useState } from 'react'

import {
  getWorldDreamStats,
  type WorldDreamStatsPayload,
} from '../../services/api'
import { PanelShell } from '../ui/PanelShell'

const DREAM_EMOJI: Record<string, string> = {
  成为富翁: '💰',
  找到真爱: '💖',
  建立家族: '🏡',
  成为名人: '🌟',
  环游世界: '🌍',
  成为匠人: '🔨',
  保卫家园: '🛡️',
  留下传说: '📜',
}

const EMPTY: WorldDreamStatsPayload = {
  dreams_fulfilled_total: 0,
  top_dreams: [],
  avg_progress: 0,
  recent_fulfillments: [],
}

export function DreamPanel() {
  const [data, setData] = useState<WorldDreamStatsPayload>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await getWorldDreamStats())
    } catch {
      setData(EMPTY)
      setError('梦想数据加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const loadInitial = async () => {
      try {
        const nextData = await getWorldDreamStats()
        if (!cancelled) setData(nextData)
      } catch {
        if (!cancelled) {
          setData(EMPTY)
          setError('梦想数据加载失败')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadInitial()
    return () => { cancelled = true }
  }, [])

  return (
    <PanelShell icon="✨" title="梦想面板" badge="Dreams">
      {/* Header stats */}
      <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">已实现梦想</p>
          <p
            className="mt-2 text-3xl font-semibold text-white"
            aria-label={`dreams fulfilled total: ${data.dreams_fulfilled_total}`}
          >
            {data.dreams_fulfilled_total}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            平均进度 {Math.round(data.avg_progress * 100)}%
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
          aria-label="刷新梦想面板"
        >
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {/* Top 3 dreams ranking */}
      {data.top_dreams.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs uppercase tracking-widest text-slate-400">最受欢迎梦想 TOP 3</h3>
          <div className="space-y-2">
            {data.top_dreams.slice(0, 3).map((entry, idx) => (
              <div
                key={entry.dream}
                className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2"
              >
                <span className="w-5 text-center text-xs font-bold text-slate-400">
                  #{idx + 1}
                </span>
                <span className="text-lg">{DREAM_EMOJI[entry.dream] ?? '🌙'}</span>
                <span className="flex-1 text-sm text-slate-200">{entry.dream}</span>
                <span className="text-xs text-slate-400">{entry.count} 人</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent fulfillment events */}
      {data.recent_fulfillments.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs uppercase tracking-widest text-slate-400">最近实现</h3>
          <ul className="space-y-1.5">
            {data.recent_fulfillments.map((ev) => (
              <li
                key={`${ev.resident_id}-${ev.tick}`}
                className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm"
              >
                <span className="text-base">{DREAM_EMOJI[ev.dream] ?? '🌙'}</span>
                <span className="font-medium text-slate-200">{ev.resident_name}</span>
                <span className="text-slate-400">实现了</span>
                <span className="text-violet-300">「{ev.dream}」</span>
                <span className="ml-auto text-xs text-slate-500">T{ev.tick}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!loading && data.top_dreams.length === 0 && data.recent_fulfillments.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">居民们正在追逐梦想，耐心等待…</p>
      )}
    </PanelShell>
  )
}
