import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  type MoodHistoryEntry,
  type NetworkAnalysisEntry,
  type SimulationStats,
  getMoodHistory,
  getNetworkAnalysis,
  getSimulationStats,
} from '../../services/api'

function formatMoodScore(score: number): string {
  return score.toFixed(2)
}

// ── Mood score mapping (mirrors backend _MOOD_SCORES) ──────────────────────
const MOOD_SCORE: Record<string, number> = {
  ecstatic: 1.0, excited: 0.8, happy: 1.0, content: 0.3,
  neutral: 0.0, calm: 0.1, tired: -0.2, sad: -1.0, angry: -0.9, fearful: -0.7,
}

const RESIDENT_COLORS = [
  '#38bdf8','#f97316','#34d399','#f59e0b','#e879f9',
  '#fb7185','#a78bfa','#4ade80','#fbbf24','#60a5fa',
]

// ── Inline SVG mood trend chart ─────────────────────────────────────────────
function MoodTrendChart({ history }: { history: MoodHistoryEntry[] }) {
  const W = 480, H = 140, PAD = { t: 8, r: 8, b: 20, l: 28 }
  const chartW = W - PAD.l - PAD.r
  const chartH = H - PAD.t - PAD.b

  // Group by resident; get unique ticks for x-axis
  const byResident = useMemo(() => {
    const map = new Map<string, { name: string; points: [number, number][] }>()
    for (const entry of history) {
      if (!map.has(entry.resident_id)) map.set(entry.resident_id, { name: entry.resident_name, points: [] })
      map.get(entry.resident_id)!.points.push([entry.tick, MOOD_SCORE[entry.mood] ?? 0])
    }
    return Array.from(map.values())
  }, [history])

  const ticks = useMemo(() => [...new Set(history.map(e => e.tick))].sort((a, b) => a - b), [history])
  if (ticks.length < 2) return <p className="text-xs text-slate-500 py-4">等待更多 tick 数据…</p>

  const minTick = ticks[0], maxTick = ticks[ticks.length - 1]
  const xScale = (t: number) => PAD.l + ((t - minTick) / (maxTick - minTick)) * chartW
  const yScale = (v: number) => PAD.t + ((1 - v) / 2) * chartH  // v in [-1,1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {/* Grid lines */}
      {[-1, -0.5, 0, 0.5, 1].map(v => (
        <g key={v}>
          <line x1={PAD.l} y1={yScale(v)} x2={W - PAD.r} y2={yScale(v)} stroke="#1e293b" strokeWidth="1" />
          <text x={PAD.l - 4} y={yScale(v) + 3} textAnchor="end" fontSize="8" fill="#475569">{v}</text>
        </g>
      ))}
      {/* Lines per resident */}
      {byResident.map(({ name, points }, i) => {
        const sorted = [...points].sort((a, b) => a[0] - b[0])
        const d = sorted.map(([t, v], idx) => `${idx === 0 ? 'M' : 'L'}${xScale(t).toFixed(1)},${yScale(v).toFixed(1)}`).join(' ')
        return (
          <g key={name}>
            <path d={d} fill="none" stroke={RESIDENT_COLORS[i % RESIDENT_COLORS.length]} strokeWidth="1.5" opacity="0.8" />
          </g>
        )
      })}
      {/* X axis labels */}
      {ticks.filter((_, i) => i % Math.max(1, Math.floor(ticks.length / 6)) === 0).map(t => (
        <text key={t} x={xScale(t)} y={H - 4} textAnchor="middle" fontSize="8" fill="#475569">{t}</text>
      ))}
    </svg>
  )
}

// ── Inline SVG influence bar chart ──────────────────────────────────────────
function NetworkRankChart({ data }: { data: NetworkAnalysisEntry[] }) {
  const top = data.slice(0, 8)
  const maxScore = Math.max(...top.map(d => d.influence_score), 0.01)
  const barH = 22, gap = 6, padL = 60, padR = 12
  const W = 480, H = top.length * (barH + gap)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {top.map((entry, i) => {
        const y = i * (barH + gap)
        const bw = Math.max(2, ((entry.influence_score / maxScore) * (W - padL - padR)))
        return (
          <g key={entry.resident_id}>
            <text x={padL - 6} y={y + barH / 2 + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{entry.name}</text>
            <rect x={padL} y={y} width={bw} height={barH} rx="4" fill={RESIDENT_COLORS[i % RESIDENT_COLORS.length]} opacity="0.75" />
            <text x={padL + bw + 4} y={y + barH / 2 + 4} fontSize="9" fill="#64748b">
              {entry.influence_score.toFixed(2)} · {entry.relationship_count}关系
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function StatsPanel() {
  const { t } = useTranslation()
  const [stats, setStats] = useState<SimulationStats | null>(null)
  const [moodHistory, setMoodHistory] = useState<MoodHistoryEntry[]>([])
  const [networkData, setNetworkData] = useState<NetworkAnalysisEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestSequenceRef = useRef(0)

  const loadStats = useCallback(
    async (mode: 'initial' | 'refresh' | 'poll') => {
      const requestSequence = requestSequenceRef.current + 1
      requestSequenceRef.current = requestSequence

      if (mode === 'initial') {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      try {
        const [nextStats, nextMood, nextNetwork] = await Promise.all([
          getSimulationStats(),
          getMoodHistory().catch(() => [] as MoodHistoryEntry[]),
          getNetworkAnalysis().catch(() => [] as NetworkAnalysisEntry[]),
        ])
        if (requestSequenceRef.current !== requestSequence) {
          return
        }

        setStats(nextStats)
        setMoodHistory(nextMood)
        setNetworkData(nextNetwork)
        setError(null)
      } catch {
        if (requestSequenceRef.current !== requestSequence) {
          return
        }

        setStats(null)
        setError(t('stats.load_failed'))
      } finally {
        if (requestSequenceRef.current === requestSequence) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [t],
  )

  useEffect(() => {
    void loadStats('initial')
    const intervalId = window.setInterval(() => {
      void loadStats('poll')
    }, 4000)

    return () => {
      requestSequenceRef.current += 1
      window.clearInterval(intervalId)
    }
  }, [loadStats])

  const metricCards = useMemo(() => {
    if (!stats) {
      return []
    }

    return [
      { label: t('stats.total_ticks'), value: String(stats.total_ticks) },
      { label: t('stats.total_dialogues'), value: String(stats.total_dialogues) },
      { label: t('stats.total_relationship_changes'), value: String(stats.total_relationship_changes) },
      { label: t('stats.active_events'), value: String(stats.active_events) },
      { label: t('stats.average_mood_score'), value: formatMoodScore(stats.average_mood_score) },
      { label: t('stats.total_memories'), value: String(stats.total_memories) },
    ]
  }, [stats, t])

  return (
    <div className="grid gap-4 rounded-xl border border-white/10 bg-slate-950/70 p-5 text-slate-100 ">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-200/70">{t('stats.badge')}</p>
          <h3 className="mt-2 font-display text-2xl text-white">{t('stats.title')}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{t('stats.desc')}</p>
        </div>
        <button
          type="button"
          onClick={() => void loadStats('refresh')}
          disabled={loading || refreshing}
          className="rounded-xl border border-cyan-300/30 bg-cyan-300/12 px-4 py-2 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/20 disabled:opacity-50"
        >
          {refreshing ? t('stats.refreshing') : t('stats.refresh')}
        </button>
      </div>

      {loading ? (
        <div className="rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-slate-300">
          {t('stats.loading')}
        </div>
      ) : error && !stats ? (
        <div className="rounded-[20px] border border-red-400/20 bg-red-400/8 px-4 py-6 text-sm text-red-200">
          {error}
        </div>
      ) : stats ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {metricCards.map((card) => (
              <article
                key={card.label}
                className="rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-4"
              >
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{card.label}</p>
                <p className="mt-3 font-display text-3xl text-white">{card.value}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <article className="rounded-[20px] border border-emerald-300/16 bg-emerald-300/8 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-100/70">{t('stats.most_social_resident')}</p>
              <p className="mt-3 text-xl font-semibold text-white">
                {stats.most_social_resident?.name ?? t('stats.empty_value')}
              </p>
              <p className="mt-2 text-sm text-emerald-100/75">
                {stats.most_social_resident
                  ? t('stats.relationship_summary', {
                      count: stats.most_social_resident.relationship_count,
                      intensity: stats.most_social_resident.relationship_intensity.toFixed(2),
                    })
                  : t('stats.empty_desc')}
              </p>
            </article>

            <article className="rounded-[20px] border border-amber-300/16 bg-amber-300/8 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.28em] text-amber-100/70">{t('stats.loneliest_resident')}</p>
              <p className="mt-3 text-xl font-semibold text-white">
                {stats.loneliest_resident?.name ?? t('stats.empty_value')}
              </p>
              <p className="mt-2 text-sm text-amber-100/75">
                {stats.loneliest_resident
                  ? t('stats.relationship_summary', {
                      count: stats.loneliest_resident.relationship_count,
                      intensity: stats.loneliest_resident.relationship_intensity.toFixed(2),
                    })
                  : t('stats.empty_desc')}
              </p>
            </article>

            <article className="rounded-[20px] border border-violet-300/16 bg-violet-300/8 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.28em] text-violet-100/70">{t('stats.strongest_relationship')}</p>
              <p className="mt-3 text-xl font-semibold text-white">
                {stats.strongest_relationship
                  ? `${stats.strongest_relationship.from_name} ↔ ${stats.strongest_relationship.to_name}`
                  : t('stats.empty_value')}
              </p>
              <p className="mt-2 text-sm text-violet-100/75">
                {stats.strongest_relationship
                  ? `${stats.strongest_relationship.type} · ${stats.strongest_relationship.intensity.toFixed(2)}`
                  : t('stats.empty_desc')}
              </p>
            </article>
          </div>

          {/* ── Mood Trend Chart ── */}
          {moodHistory.length > 0 && (
            <div className="rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500 mb-3">情绪趋势（最近 100 ticks）</p>
              <MoodTrendChart history={moodHistory} />
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {[...new Map(moodHistory.map(e => [e.resident_id, e.resident_name])).entries()].slice(0, 10).map(([id, name], i) => (
                  <span key={id} className="flex items-center gap-1 text-[10px] text-slate-400">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: RESIDENT_COLORS[i % RESIDENT_COLORS.length] }} />
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Network Influence Ranking ── */}
          {networkData.length > 0 && (
            <div className="rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500 mb-3">社会网络影响力排行</p>
              <NetworkRankChart data={networkData} />
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
