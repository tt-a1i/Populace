import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  type EconomyStats,
  type MoodHistoryEntry,
  type NetworkAnalysisEntry,
  type OccupationDistEntry,
  type SimulationStats,
  type SocialIndicators,
  getEconomyStats,
  getMoodHistory,
  getNetworkAnalysis,
  getSimulationStats,
  getSocialIndicators,
} from '../../services/api'
import { useSimulationStore } from '../../stores/simulation'
import { PanelShell } from '../ui/PanelShell'

const RESIDENT_COLORS = [
  '#38bdf8','#f97316','#34d399','#f59e0b','#e879f9',
  '#fb7185','#a78bfa','#4ade80','#fbbf24','#60a5fa',
]
const PIE_COLORS = [
  '#38bdf8','#f97316','#34d399','#e879f9','#fb7185',
  '#a78bfa','#f59e0b','#4ade80','#60a5fa','#fbbf24',
]

const MOOD_SCORE: Record<string, number> = {
  ecstatic: 1.0, excited: 0.8, happy: 1.0, content: 0.3,
  neutral: 0.0, calm: 0.1, tired: -0.2, sad: -1.0, angry: -0.9, fearful: -0.7,
}

// ── KPI Card ─────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, accent }: { label: string; value: string; icon: string; accent?: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${accent ?? 'border-white/[0.06] bg-white/[0.03]'}`}>
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <span className="panel-section-label">{label}</span>
      </div>
      <p className="mt-1.5 font-display text-2xl text-white">{value}</p>
    </div>
  )
}

// ── Smooth bezier path helper ────────────────────────────────────────────
function smoothPath(points: [number, number][]): string {
  if (points.length < 2) return ''
  if (points.length === 2) return `M${points[0][0]},${points[0][1]}L${points[1][0]},${points[1][1]}`
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
    const t = 0.3
    d += ` C${(p1[0] + (p2[0] - p0[0]) * t).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) * t).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * t).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) * t).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

// ── Large Mood Trend Chart ───────────────────────────────────────────────
function LargeMoodChart({ history }: { history: MoodHistoryEntry[] }) {
  const W = 560, H = 200, PAD = { t: 12, r: 12, b: 24, l: 36 }
  const chartW = W - PAD.l - PAD.r, chartH = H - PAD.t - PAD.b

  const byResident = useMemo(() => {
    const map = new Map<string, { name: string; points: [number, number][] }>()
    for (const e of history) {
      if (!map.has(e.resident_id)) map.set(e.resident_id, { name: e.resident_name, points: [] })
      map.get(e.resident_id)!.points.push([e.tick, MOOD_SCORE[e.mood] ?? 0])
    }
    return Array.from(map.values())
  }, [history])

  const ticks = useMemo(() => [...new Set(history.map(e => e.tick))].sort((a, b) => a - b), [history])
  if (ticks.length < 2) return <p className="py-6 text-center text-xs text-slate-500">Waiting for data...</p>

  const minTick = ticks[0], maxTick = ticks[ticks.length - 1]
  const xScale = (t: number) => PAD.l + ((t - minTick) / (maxTick - minTick)) * chartW
  const yScale = (v: number) => PAD.t + ((1 - v) / 2) * chartH

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <defs>
        {byResident.map((_, i) => (
          <linearGradient key={i} id={`dg-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={RESIDENT_COLORS[i % RESIDENT_COLORS.length]} stopOpacity="0.2" />
            <stop offset="100%" stopColor={RESIDENT_COLORS[i % RESIDENT_COLORS.length]} stopOpacity="0.01" />
          </linearGradient>
        ))}
      </defs>
      {[-1, -0.5, 0, 0.5, 1].map(v => (
        <g key={v}>
          <line x1={PAD.l} y1={yScale(v)} x2={W - PAD.r} y2={yScale(v)} stroke="#1e293b" strokeWidth="1" />
          <text x={PAD.l - 6} y={yScale(v) + 3} textAnchor="end" fontSize="8" fill="#475569">{v}</text>
        </g>
      ))}
      {byResident.map(({ name, points }, i) => {
        const sorted = [...points].sort((a, b) => a[0] - b[0])
        const pts: [number, number][] = sorted.map(([t, v]) => [xScale(t), yScale(v)])
        const line = smoothPath(pts)
        const baseline = yScale(0)
        const area = line + ` L${pts[pts.length - 1][0].toFixed(1)},${baseline.toFixed(1)} L${pts[0][0].toFixed(1)},${baseline.toFixed(1)} Z`
        return (
          <g key={name}>
            <path d={area} fill={`url(#dg-${i})`} />
            <path d={line} fill="none" stroke={RESIDENT_COLORS[i % RESIDENT_COLORS.length]} strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
          </g>
        )
      })}
      {ticks.filter((_, i) => i % Math.max(1, Math.floor(ticks.length / 8)) === 0).map(t => (
        <text key={t} x={xScale(t)} y={H - 4} textAnchor="middle" fontSize="8" fill="#475569">{t}</text>
      ))}
    </svg>
  )
}

// ── Compact Pie Chart ────────────────────────────────────────────────────
function CompactPie({ data }: { data: OccupationDistEntry[] }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  const slices = useMemo(() => {
    if (total === 0) return []
    const R = 44, ir = 28, cx = 50, cy = 50
    let a = -Math.PI / 2
    return data.map((d, i) => {
      const sweep = (d.count / total) * Math.PI * 2
      const sa = a; a += sweep; const ea = a
      const la = sweep > Math.PI ? 1 : 0
      const path = [
        `M${(cx + R * Math.cos(sa)).toFixed(1)},${(cy + R * Math.sin(sa)).toFixed(1)}`,
        `A${R},${R} 0 ${la} 1 ${(cx + R * Math.cos(ea)).toFixed(1)},${(cy + R * Math.sin(ea)).toFixed(1)}`,
        `L${(cx + ir * Math.cos(ea)).toFixed(1)},${(cy + ir * Math.sin(ea)).toFixed(1)}`,
        `A${ir},${ir} 0 ${la} 0 ${(cx + ir * Math.cos(sa)).toFixed(1)},${(cy + ir * Math.sin(sa)).toFixed(1)}`,
        'Z',
      ].join(' ')
      return { path, color: PIE_COLORS[i % PIE_COLORS.length], label: d.occupation, count: d.count }
    })
  }, [data, total])

  if (!slices.length) return null
  return (
    <div className="flex items-center gap-3">
      <svg width="100" height="100" viewBox="0 0 100 100" className="shrink-0">
        {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} opacity="0.8" stroke="#0f172a" strokeWidth="1" />)}
      </svg>
      <div className="grid gap-0.5 text-[10px]">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="capitalize text-slate-300">{s.label}</span>
            <span className="text-slate-500">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Social Indicator Gauge ───────────────────────────────────────────────
function IndicatorBadge({ label, value, format, color }: { label: string; value: number; format?: string; color: string }) {
  const display = format === 'pct' ? `${(value * 100).toFixed(1)}%` : value.toFixed(3)
  return (
    <div className="rounded-lg bg-white/[0.03] px-3 py-2 text-center">
      <p className="text-lg font-semibold" style={{ color }}>{display}</p>
      <p className="mt-0.5 text-[9px] uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  )
}

// ── Main Dashboard ───────────────────────────────────────────────────────
export function DashboardView() {
  const { t } = useTranslation()
  const season = useSimulationStore((s) => s.season)
  const [stats, setStats] = useState<SimulationStats | null>(null)
  const [mood, setMood] = useState<MoodHistoryEntry[]>([])
  const [network, setNetwork] = useState<NetworkAnalysisEntry[]>([])
  const [economy, setEconomy] = useState<EconomyStats | null>(null)
  const [social, setSocial] = useState<SocialIndicators | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [s, m, n, e, si] = await Promise.all([
        getSimulationStats(),
        getMoodHistory().catch(() => [] as MoodHistoryEntry[]),
        getNetworkAnalysis().catch(() => [] as NetworkAnalysisEntry[]),
        getEconomyStats().catch(() => null),
        getSocialIndicators().catch(() => null),
      ])
      setStats(s); setMood(m); setNetwork(n); setEconomy(e); setSocial(si)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), 5000)
    return () => clearInterval(id)
  }, [load])

  const SEASON_EMOJI: Record<string, string> = { spring: '🌸', summer: '☀️', autumn: '🍂', winter: '❄️' }

  if (loading) {
    return (
      <PanelShell icon="📊" title={t('dashboard.title', { defaultValue: 'Dashboard' })} badge={t('dashboard.badge', { defaultValue: 'Overview' })}>
        <div className="py-8 text-center text-sm text-slate-500">{t('stats.loading', { defaultValue: 'Loading...' })}</div>
      </PanelShell>
    )
  }

  return (
    <PanelShell icon="📊" title={t('dashboard.title', { defaultValue: 'Dashboard' })} badge={t('dashboard.badge', { defaultValue: 'Overview' })}>
      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard icon="👥" label={t('dashboard.population', { defaultValue: 'Population' })} value={String(social?.population ?? stats?.total_ticks ?? 0)} />
        <KpiCard icon="😊" label={t('dashboard.avg_mood', { defaultValue: 'Avg Mood' })} value={(social?.avg_mood_score ?? 0).toFixed(2)} accent={`border-emerald-400/20 bg-emerald-400/8`} />
        <KpiCard icon="🪙" label={t('dashboard.total_coins', { defaultValue: 'Total Coins' })} value={String(social?.total_coins ?? economy?.total_coins ?? 0)} />
        <KpiCard icon="⚡" label={t('dashboard.active_events', { defaultValue: 'Events' })} value={String(stats?.active_events ?? 0)} />
        <KpiCard icon={SEASON_EMOJI[season] ?? '🌸'} label={t('dashboard.season', { defaultValue: 'Season' })} value={t(`app.season_${season}`, season)} />
      </div>

      {/* ── Social Indicators ── */}
      {social && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <p className="panel-section-label mb-3">{t('dashboard.social_indicators', { defaultValue: 'Social Indicators' })}</p>
          <div className="grid grid-cols-3 gap-3">
            <IndicatorBadge label={t('dashboard.gini', { defaultValue: 'Gini Coefficient' })} value={social.gini_coefficient} color={social.gini_coefficient > 0.4 ? '#f87171' : social.gini_coefficient > 0.3 ? '#fbbf24' : '#34d399'} />
            <IndicatorBadge label={t('dashboard.cohesion', { defaultValue: 'Social Cohesion' })} value={social.social_cohesion} color={social.social_cohesion > 0.5 ? '#34d399' : social.social_cohesion > 0.3 ? '#fbbf24' : '#f87171'} />
            <IndicatorBadge label={t('dashboard.happiness', { defaultValue: 'Happiness Index' })} value={social.happiness_index} format="pct" color={social.happiness_index > 0.6 ? '#34d399' : social.happiness_index > 0.4 ? '#fbbf24' : '#f87171'} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
            <div className="flex justify-between rounded-lg bg-white/[0.02] px-2 py-1">
              <span className="text-slate-500">{t('dashboard.avg_energy', { defaultValue: 'Avg Energy' })}</span>
              <span className="text-slate-300">{social.avg_energy}</span>
            </div>
            <div className="flex justify-between rounded-lg bg-white/[0.02] px-2 py-1">
              <span className="text-slate-500">{t('dashboard.total_rels', { defaultValue: 'Relationships' })}</span>
              <span className="text-slate-300">{social.total_relationships}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Charts: 2-column layout ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* Left: Mood Trend */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-4">
          <p className="panel-section-label mb-2">{t('stats.mood_trend_title', { defaultValue: 'Mood Trends' })}</p>
          <LargeMoodChart history={mood} />
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
            {[...new Map(mood.map(e => [e.resident_id, e.resident_name])).entries()].slice(0, 8).map(([id, name], i) => (
              <span key={id} className="flex items-center gap-1 text-[9px] text-slate-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: RESIDENT_COLORS[i % RESIDENT_COLORS.length] }} />
                {name}
              </span>
            ))}
          </div>
        </div>

        {/* Right: Network + Economy */}
        <div className="grid gap-3">
          {/* Network stats */}
          {network.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-4">
              <p className="panel-section-label mb-2">{t('stats.network_rank_title', { defaultValue: 'Influence Ranking' })}</p>
              <div className="space-y-1.5">
                {network.slice(0, 5).map((entry, i) => {
                  const maxScore = Math.max(...network.slice(0, 5).map(d => d.influence_score), 0.01)
                  const pct = (entry.influence_score / maxScore) * 100
                  return (
                    <div key={entry.resident_id} className="flex items-center gap-2 text-xs">
                      <span className="w-12 truncate text-right text-slate-400">{entry.name}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: RESIDENT_COLORS[i % RESIDENT_COLORS.length] }} />
                      </div>
                      <span className="w-8 text-right text-[10px] text-slate-500">{entry.influence_score.toFixed(1)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Economy pie */}
          {economy && economy.occupation_distribution.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-4">
              <p className="panel-section-label mb-2">{t('stats.occupation_dist', { defaultValue: 'Occupation Distribution' })}</p>
              <CompactPie data={economy.occupation_distribution} />
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom: Recent Timeline (compact) ── */}
      {stats && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
          <p className="panel-section-label mb-2">{t('dashboard.stats_summary', { defaultValue: 'Simulation Summary' })}</p>
          <div className="grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
            <div className="text-center"><p className="text-lg font-semibold text-white">{stats.total_ticks}</p><p className="text-[9px] text-slate-500">Ticks</p></div>
            <div className="text-center"><p className="text-lg font-semibold text-white">{stats.total_dialogues}</p><p className="text-[9px] text-slate-500">Dialogues</p></div>
            <div className="text-center"><p className="text-lg font-semibold text-white">{stats.total_relationship_changes}</p><p className="text-[9px] text-slate-500">Rel Changes</p></div>
            <div className="text-center"><p className="text-lg font-semibold text-white">{stats.active_events}</p><p className="text-[9px] text-slate-500">Events</p></div>
            <div className="text-center"><p className="text-lg font-semibold text-white">{(stats.average_mood_score).toFixed(2)}</p><p className="text-[9px] text-slate-500">Avg Mood</p></div>
            <div className="text-center"><p className="text-lg font-semibold text-white">{stats.total_memories}</p><p className="text-[9px] text-slate-500">Memories</p></div>
          </div>
        </div>
      )}
    </PanelShell>
  )
}
