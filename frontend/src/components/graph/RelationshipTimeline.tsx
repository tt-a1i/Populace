import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type RelationshipHistory, getRelationshipHistory } from '../../services/api'

interface RelationshipTimelineProps {
  fromId: string
  toId: string
  onClose: () => void
}

const REL_COLOR: Record<string, string> = {
  love: '#f472b6',
  friendship: '#4ade80',
  rivalry: '#ef4444',
  knows: '#94a3b8',
  trust: '#38bdf8',
  fear: '#a78bfa',
  dislike: '#f97316',
  none: '#475569',
}

export function RelationshipTimeline({ fromId, toId, onClose }: RelationshipTimelineProps) {
  const { t } = useTranslation()
  const [data, setData] = useState<RelationshipHistory | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getRelationshipHistory(fromId, toId)
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [fromId, toId])

  // Generate prediction points (linear extrapolation of last 10 points)
  const prediction = useMemo(() => {
    if (!data || data.points.length < 3) return []
    const recent = data.points.slice(-10)
    if (recent.length < 2) return []

    // Simple linear regression on intensity
    const n = recent.length
    const sumX = recent.reduce((s, _, i) => s + i, 0)
    const sumY = recent.reduce((s, p) => s + p.intensity, 0)
    const sumXY = recent.reduce((s, p, i) => s + i * p.intensity, 0)
    const sumX2 = recent.reduce((s, _, i) => s + i * i, 0)
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    const lastTick = recent[recent.length - 1].tick
    const tickStep = recent.length > 1 ? (recent[recent.length - 1].tick - recent[0].tick) / (recent.length - 1) : 1

    const points: Array<{ tick: number; intensity: number }> = []
    for (let i = 1; i <= 50; i++) {
      const predicted = intercept + slope * (n - 1 + i)
      points.push({
        tick: Math.round(lastTick + tickStep * i),
        intensity: Math.max(0, Math.min(1, predicted)),
      })
    }
    return points
  }, [data])

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
      </div>
    )
  }

  if (!data || data.points.length === 0) {
    return (
      <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">{t('rel_timeline.empty')}</p>
          <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-white">✕</button>
        </div>
      </div>
    )
  }

  const allPoints = data.points
  const allTicks = [...allPoints.map((p) => p.tick), ...prediction.map((p) => p.tick)]
  const minTick = Math.min(...allTicks)
  const maxTick = Math.max(...allTicks)
  const tickRange = maxTick - minTick || 1

  const W = 420
  const H = 140
  const PX = 32
  const PY = 16

  const toX = (tick: number) => PX + ((tick - minTick) / tickRange) * (W - PX * 2)
  const toY = (intensity: number) => H - PY - intensity * (H - PY * 2)

  // Build SVG path for actual data
  const actualPath = allPoints.map((p, i) => {
    const x = toX(p.tick).toFixed(1)
    const y = toY(p.intensity).toFixed(1)
    return i === 0 ? `M${x},${y}` : `L${x},${y}`
  }).join(' ')

  // Build SVG path for prediction (dashed)
  const predPath = prediction.length > 0 ? (() => {
    const lastActual = allPoints[allPoints.length - 1]
    const startX = toX(lastActual.tick).toFixed(1)
    const startY = toY(lastActual.intensity).toFixed(1)
    const segments = prediction.map((p) => {
      return `L${toX(p.tick).toFixed(1)},${toY(p.intensity).toFixed(1)}`
    })
    return `M${startX},${startY} ${segments.join(' ')}`
  })() : ''

  // Find milestone points (type changes or dialogues)
  const milestones = allPoints.filter((p) => p.dialogue)

  const latestType = allPoints[allPoints.length - 1]?.rel_type ?? 'knows'
  const lineColor = REL_COLOR[latestType] ?? REL_COLOR.knows

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{t('rel_timeline.badge')}</span>
          <span className="text-sm font-medium text-white">{data.from_name}</span>
          <span className="text-xs text-slate-500">⟷</span>
          <span className="text-sm font-medium text-white">{data.to_name}</span>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-white transition-colors">✕</button>
      </div>

      {/* Chart */}
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" style={{ maxHeight: 160 }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <line key={v} x1={PX} y1={toY(v)} x2={W - PX} y2={toY(v)} stroke="#334155" strokeWidth="0.5" strokeDasharray="2,3" />
        ))}
        {/* Y-axis labels */}
        <text x={PX - 4} y={toY(0) + 3} textAnchor="end" fontSize="8" fill="#64748b">0</text>
        <text x={PX - 4} y={toY(1) + 3} textAnchor="end" fontSize="8" fill="#64748b">1</text>

        {/* Actual intensity line */}
        <path d={actualPath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Prediction dashed line */}
        {predPath && (
          <path d={predPath} fill="none" stroke={lineColor} strokeWidth="1.5" strokeDasharray="4,3" opacity="0.5" />
        )}

        {/* Milestone dots */}
        {milestones.map((p, i) => (
          <circle key={i} cx={toX(p.tick)} cy={toY(p.intensity)} r="3.5" fill={lineColor} stroke="#0f172a" strokeWidth="1.5" />
        ))}

        {/* Data point dots */}
        {allPoints.map((p, i) => (
          <circle key={i} cx={toX(p.tick)} cy={toY(p.intensity)} r="1.5" fill={lineColor} opacity="0.6" />
        ))}
      </svg>

      {/* Legend */}
      <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: lineColor }} />
          {t('rel_timeline.actual')}
        </span>
        {prediction.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 rounded border-t border-dashed" style={{ borderColor: lineColor }} />
            {t('rel_timeline.predicted')}
          </span>
        )}
        <span className="ml-auto">{data.points.length} {t('rel_timeline.data_points')}</span>
      </div>

      {/* Dialogue milestones list */}
      {milestones.length > 0 && (
        <div className="mt-3 max-h-24 space-y-1 overflow-y-auto">
          {milestones.slice(-5).map((p, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px]">
              <span className="shrink-0 tabular-nums text-slate-600">T{p.tick}</span>
              <span className="text-slate-300">{p.dialogue}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
