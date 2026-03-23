import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  type EconomyStats,
  type MoodHistoryEntry,
  type NetworkAnalysisEntry,
  type OccupationDistEntry,
  type SimulationStats,
  getEconomyStats,
  getMoodHistory,
  getNetworkAnalysis,
  getSimulationStats,
} from '../../services/api'
import { PanelShell } from '../ui/PanelShell'

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

const PIE_COLORS = [
  '#38bdf8','#f97316','#34d399','#e879f9','#fb7185',
  '#a78bfa','#f59e0b','#4ade80','#60a5fa','#fbbf24',
]

// ── Bezier helper: build smooth cubic bezier path through points ────────────
function smoothPath(points: [number, number][]): string {
  if (points.length < 2) return ''
  if (points.length === 2) return `M${points[0][0]},${points[0][1]}L${points[1][0]},${points[1][1]}`

  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
    const tension = 0.3
    const cp1x = p1[0] + (p2[0] - p0[0]) * tension
    const cp1y = p1[1] + (p2[1] - p0[1]) * tension
    const cp2x = p2[0] - (p3[0] - p1[0]) * tension
    const cp2y = p2[1] - (p3[1] - p1[1]) * tension
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

// ── Inline SVG mood trend chart (smooth bezier + gradient fill) ─────────────
function MoodTrendChart({ history, waitingLabel }: { history: MoodHistoryEntry[]; waitingLabel: string }) {
  const W = 480, H = 160, PAD = { t: 12, r: 12, b: 24, l: 32 }
  const chartW = W - PAD.l - PAD.r
  const chartH = H - PAD.t - PAD.b
  const [hoveredTick, setHoveredTick] = useState<number | null>(null)

  const byResident = useMemo(() => {
    const map = new Map<string, { name: string; points: [number, number][] }>()
    for (const entry of history) {
      if (!map.has(entry.resident_id)) map.set(entry.resident_id, { name: entry.resident_name, points: [] })
      map.get(entry.resident_id)!.points.push([entry.tick, MOOD_SCORE[entry.mood] ?? 0])
    }
    return Array.from(map.values())
  }, [history])

  const ticks = useMemo(() => [...new Set(history.map(e => e.tick))].sort((a, b) => a - b), [history])
  if (ticks.length < 2) return <p className="text-xs text-slate-500 py-4">{waitingLabel}</p>

  const minTick = ticks[0], maxTick = ticks[ticks.length - 1]
  const xScale = (t: number) => PAD.l + ((t - minTick) / (maxTick - minTick)) * chartW
  const yScale = (v: number) => PAD.t + ((1 - v) / 2) * chartH

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const tickX = ((x - PAD.l) / chartW) * (maxTick - minTick) + minTick
    const closest = ticks.reduce((prev, curr) => Math.abs(curr - tickX) < Math.abs(prev - tickX) ? curr : prev)
    setHoveredTick(closest)
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height: H }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredTick(null)}
    >
      <defs>
        {byResident.map((_, i) => (
          <linearGradient key={`grad-${i}`} id={`mood-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={RESIDENT_COLORS[i % RESIDENT_COLORS.length]} stopOpacity="0.25" />
            <stop offset="100%" stopColor={RESIDENT_COLORS[i % RESIDENT_COLORS.length]} stopOpacity="0.02" />
          </linearGradient>
        ))}
      </defs>

      {/* Grid lines */}
      {[-1, -0.5, 0, 0.5, 1].map(v => (
        <g key={v}>
          <line x1={PAD.l} y1={yScale(v)} x2={W - PAD.r} y2={yScale(v)} stroke="#1e293b" strokeWidth="1" />
          <text x={PAD.l - 6} y={yScale(v) + 3} textAnchor="end" fontSize="8" fill="#475569">{v}</text>
        </g>
      ))}

      {/* Area fills + smooth curves per resident */}
      {byResident.map(({ name, points }, i) => {
        const sorted = [...points].sort((a, b) => a[0] - b[0])
        const scaledPts: [number, number][] = sorted.map(([t, v]) => [xScale(t), yScale(v)])
        const linePath = smoothPath(scaledPts)
        const baseline = yScale(0)
        const areaPath = linePath +
          ` L${scaledPts[scaledPts.length - 1][0].toFixed(1)},${baseline.toFixed(1)}` +
          ` L${scaledPts[0][0].toFixed(1)},${baseline.toFixed(1)} Z`

        return (
          <g key={name}>
            <path d={areaPath} fill={`url(#mood-grad-${i})`} />
            <path d={linePath} fill="none" stroke={RESIDENT_COLORS[i % RESIDENT_COLORS.length]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
          </g>
        )
      })}

      {/* Hover tooltip line + data points */}
      {hoveredTick !== null && (
        <>
          <line x1={xScale(hoveredTick)} y1={PAD.t} x2={xScale(hoveredTick)} y2={H - PAD.b} stroke="#475569" strokeWidth="1" strokeDasharray="3,3" />
          {byResident.map(({ points }, i) => {
            const pt = points.find(([t]) => t === hoveredTick)
            if (!pt) return null
            return (
              <g key={i}>
                <circle cx={xScale(pt[0])} cy={yScale(pt[1])} r="4" fill={RESIDENT_COLORS[i % RESIDENT_COLORS.length]} stroke="#0f172a" strokeWidth="1.5" />
                <text x={xScale(pt[0]) + 6} y={yScale(pt[1]) - 6} fontSize="8" fill={RESIDENT_COLORS[i % RESIDENT_COLORS.length]}>
                  {pt[1].toFixed(1)}
                </text>
              </g>
            )
          })}
          <text x={xScale(hoveredTick)} y={H - 4} textAnchor="middle" fontSize="8" fill="#94a3b8" fontWeight="bold">
            tick {hoveredTick}
          </text>
        </>
      )}

      {/* X axis labels */}
      {hoveredTick === null && ticks.filter((_, i) => i % Math.max(1, Math.floor(ticks.length / 6)) === 0).map(t => (
        <text key={t} x={xScale(t)} y={H - 4} textAnchor="middle" fontSize="8" fill="#475569">{t}</text>
      ))}
    </svg>
  )
}

// ── Network influence bar chart (rounded + gradient) ────────────────────────
function NetworkRankChart({ data, relationshipsSuffix }: { data: NetworkAnalysisEntry[]; relationshipsSuffix: string }) {
  const top = data.slice(0, 8)
  const maxScore = Math.max(...top.map(d => d.influence_score), 0.01)
  const barH = 24, gap = 8, padL = 68, padR = 16
  const W = 480, H = top.length * (barH + gap)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <defs>
        {top.map((_, i) => (
          <linearGradient key={`bar-${i}`} id={`bar-grad-${i}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={RESIDENT_COLORS[i % RESIDENT_COLORS.length]} stopOpacity="0.9" />
            <stop offset="100%" stopColor={RESIDENT_COLORS[i % RESIDENT_COLORS.length]} stopOpacity="0.4" />
          </linearGradient>
        ))}
      </defs>
      {top.map((entry, i) => {
        const y = i * (barH + gap)
        const bw = Math.max(4, ((entry.influence_score / maxScore) * (W - padL - padR)))
        return (
          <g key={entry.resident_id}>
            {/* Background track */}
            <rect x={padL} y={y + 2} width={W - padL - padR} height={barH - 4} rx="6" fill="#1e293b" opacity="0.4" />
            {/* Gradient bar */}
            <rect x={padL} y={y + 2} width={bw} height={barH - 4} rx="6" fill={`url(#bar-grad-${i})`} />
            {/* Label */}
            <text x={padL - 8} y={y + barH / 2 + 4} textAnchor="end" fontSize="10" fill="#94a3b8" fontWeight="500">{entry.name}</text>
            {/* Score */}
            <text x={padL + bw + 6} y={y + barH / 2 + 4} fontSize="9" fill="#64748b">
              {entry.influence_score.toFixed(2)} · {entry.relationship_count} {relationshipsSuffix}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Occupation distribution pie chart ───────────────────────────────────────
function OccupationPieChart({ data }: { data: OccupationDistEntry[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const total = data.reduce((sum, d) => sum + d.count, 0)

  const slices = useMemo(() => {
    if (total === 0) return []
    const SIZE = 180
    const cx = SIZE / 2, cy = SIZE / 2, R = 68, innerR = 40
    let a = -Math.PI / 2

    return data.map((d, i) => {
      const sweep = (d.count / total) * Math.PI * 2
      const startAngle = a
      a += sweep
      const endAngle = a
      const largeArc = sweep > Math.PI ? 1 : 0

      const x1 = cx + R * Math.cos(startAngle)
      const y1 = cy + R * Math.sin(startAngle)
      const x2 = cx + R * Math.cos(endAngle)
      const y2 = cy + R * Math.sin(endAngle)
      const ix1 = cx + innerR * Math.cos(endAngle)
      const iy1 = cy + innerR * Math.sin(endAngle)
      const ix2 = cx + innerR * Math.cos(startAngle)
      const iy2 = cy + innerR * Math.sin(startAngle)

      const path = [
        `M${x1.toFixed(1)},${y1.toFixed(1)}`,
        `A${R},${R} 0 ${largeArc} 1 ${x2.toFixed(1)},${y2.toFixed(1)}`,
        `L${ix1.toFixed(1)},${iy1.toFixed(1)}`,
        `A${innerR},${innerR} 0 ${largeArc} 0 ${ix2.toFixed(1)},${iy2.toFixed(1)}`,
        'Z',
      ].join(' ')

      return { path, color: PIE_COLORS[i % PIE_COLORS.length], label: d.occupation, count: d.count, pct: ((d.count / total) * 100).toFixed(0) }
    })
  }, [data, total])

  if (slices.length === 0) return null

  const SIZE = 180

  return (
    <div className="flex items-center gap-4">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0">
        {slices.map((s, i) => (
          <path
            key={i}
            d={s.path}
            fill={s.color}
            opacity={hoveredIdx === null || hoveredIdx === i ? 0.85 : 0.3}
            stroke="#0f172a"
            strokeWidth="1.5"
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
          />
        ))}
        {hoveredIdx !== null && (
          <text x={SIZE / 2} y={SIZE / 2 + 4} textAnchor="middle" fontSize="12" fill="#e2e8f0" fontWeight="600">
            {slices[hoveredIdx].pct}%
          </text>
        )}
      </svg>
      <div className="grid gap-1">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-slate-300 capitalize">{s.label}</span>
            <span className="text-slate-500">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function StatsPanel() {
  const { t } = useTranslation()
  const [stats, setStats] = useState<SimulationStats | null>(null)
  const [moodHistory, setMoodHistory] = useState<MoodHistoryEntry[]>([])
  const [networkData, setNetworkData] = useState<NetworkAnalysisEntry[]>([])
  const [economy, setEconomy] = useState<EconomyStats | null>(null)
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
        const [nextStats, nextMood, nextNetwork, nextEconomy] = await Promise.all([
          getSimulationStats(),
          getMoodHistory().catch(() => [] as MoodHistoryEntry[]),
          getNetworkAnalysis().catch(() => [] as NetworkAnalysisEntry[]),
          getEconomyStats().catch(() => null as EconomyStats | null),
        ])
        if (requestSequenceRef.current !== requestSequence) {
          return
        }

        setStats(nextStats)
        setMoodHistory(nextMood)
        setNetworkData(nextNetwork)
        setEconomy(nextEconomy)
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
    <PanelShell
      icon="📊"
      title={t('stats.title')}
      badge={t('stats.badge')}
      headerRight={
        <button
          type="button"
          onClick={() => void loadStats('refresh')}
          disabled={loading || refreshing}
          aria-label={refreshing ? t('stats.refreshing') : t('stats.refresh')}
          className="btn-secondary rounded-xl px-3 py-1.5 text-xs font-medium transition duration-200 active:scale-95"
        >
          {refreshing ? t('stats.refreshing') : t('stats.refresh')}
        </button>
      }
    >
      <p className="text-sm leading-6 text-slate-300">{t('stats.desc')}</p>

      {loading ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-slate-300">
          {t('stats.loading')}
        </div>
      ) : error && !stats ? (
        <div className="rounded-xl border border-red-400/20 bg-red-400/8 px-4 py-6 text-sm text-red-200">
          {error}
        </div>
      ) : stats ? (
        <>
          {/* ── Metric number cards ── */}
          <div data-testid="stats-panel" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {metricCards.map((card) => (
              <article
                key={card.label}
                className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-4"
              >
                <p className="panel-section-label">{card.label}</p>
                <p className="mt-2 font-display text-3xl text-white">{card.value}</p>
              </article>
            ))}
          </div>

          {/* ── Resident highlight cards ── */}
          <div className="grid gap-3 lg:grid-cols-3">
            <article className="rounded-xl border border-emerald-300/16 bg-emerald-300/8 px-4 py-4">
              <p className="panel-section-label text-emerald-100/70">{t('stats.most_social_resident')}</p>
              <p className="mt-2 text-xl font-semibold text-white">
                {stats.most_social_resident?.name ?? t('stats.empty_value')}
              </p>
              <p className="mt-1.5 text-sm text-emerald-100/75">
                {stats.most_social_resident
                  ? t('stats.relationship_summary', {
                      count: stats.most_social_resident.relationship_count,
                      intensity: stats.most_social_resident.relationship_intensity.toFixed(2),
                    })
                  : t('stats.empty_desc')}
              </p>
            </article>

            <article className="rounded-xl border border-amber-300/16 bg-amber-300/8 px-4 py-4">
              <p className="panel-section-label text-amber-100/70">{t('stats.loneliest_resident')}</p>
              <p className="mt-2 text-xl font-semibold text-white">
                {stats.loneliest_resident?.name ?? t('stats.empty_value')}
              </p>
              <p className="mt-1.5 text-sm text-amber-100/75">
                {stats.loneliest_resident
                  ? t('stats.relationship_summary', {
                      count: stats.loneliest_resident.relationship_count,
                      intensity: stats.loneliest_resident.relationship_intensity.toFixed(2),
                    })
                  : t('stats.empty_desc')}
              </p>
            </article>

            <article className="rounded-xl border border-violet-300/16 bg-violet-300/8 px-4 py-4">
              <p className="panel-section-label text-violet-100/70">{t('stats.strongest_relationship')}</p>
              <p className="mt-2 text-xl font-semibold text-white">
                {stats.strongest_relationship
                  ? `${stats.strongest_relationship.from_name} ↔ ${stats.strongest_relationship.to_name}`
                  : t('stats.empty_value')}
              </p>
              <p className="mt-1.5 text-sm text-violet-100/75">
                {stats.strongest_relationship
                  ? `${stats.strongest_relationship.type} · ${stats.strongest_relationship.intensity.toFixed(2)}`
                  : t('stats.empty_desc')}
              </p>
            </article>
          </div>

          {/* ── Mood Trend Chart (smooth bezier + gradient fill) ── */}
          {moodHistory.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-4">
              <p className="panel-section-label mb-3">{t('stats.mood_trend_title')}</p>
              <MoodTrendChart history={moodHistory} waitingLabel={t('stats.waiting_ticks')} />
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

          {/* ── Network Influence Ranking (rounded bars + gradient) ── */}
          {networkData.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-4">
              <p className="panel-section-label mb-3">{t('stats.network_rank_title')}</p>
              <NetworkRankChart data={networkData} relationshipsSuffix={t('stats.relationships_suffix')} />
            </div>
          )}

          {/* ── Economy: Occupation Pie Chart ── */}
          {economy && economy.occupation_distribution.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-4">
              <p className="panel-section-label mb-3">{t('stats.occupation_dist', { defaultValue: 'Occupation Distribution' })}</p>
              <OccupationPieChart data={economy.occupation_distribution} />
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <span className="text-slate-500">{t('stats.total_coins', { defaultValue: 'Total Coins' })}</span>
                  <p className="mt-0.5 text-lg font-semibold text-white">{economy.total_coins}</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <span className="text-slate-500">{t('stats.avg_coins', { defaultValue: 'Avg Coins' })}</span>
                  <p className="mt-0.5 text-lg font-semibold text-white">{economy.avg_coins.toFixed(0)}</p>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </PanelShell>
  )
}
