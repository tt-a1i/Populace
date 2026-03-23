import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type PerformanceMetrics, getPerformanceMetrics } from '../../services/api'

function GaugeMeter({ value, max, label, unit, warnAt, dangerAt }: {
  value: number
  max: number
  label: string
  unit: string
  warnAt?: number
  dangerAt?: number
}) {
  const pct = Math.min(value / max, 1)
  const angle = pct * 180 // 0-180 degrees arc
  const r = 40
  const cx = 50, cy = 50

  // Color based on thresholds
  let color = '#34d399' // emerald
  if (dangerAt !== undefined && value >= dangerAt) {
    color = '#f87171' // red
  } else if (warnAt !== undefined && value >= warnAt) {
    color = '#fbbf24' // amber
  }

  // SVG arc path
  const startAngle = Math.PI
  const endAngle = Math.PI + (angle * Math.PI) / 180
  const x1 = cx + r * Math.cos(startAngle)
  const y1 = cy + r * Math.sin(startAngle)
  const x2 = cx + r * Math.cos(endAngle)
  const y2 = cy + r * Math.sin(endAngle)
  const largeArc = angle > 180 ? 1 : 0
  const arcPath = `M${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2.toFixed(1)},${y2.toFixed(1)}`

  return (
    <div className="flex flex-col items-center">
      <svg width="100" height="60" viewBox="0 0 100 60">
        {/* Background arc */}
        <path
          d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`}
          fill="none"
          stroke="#1e293b"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* Value arc */}
        {pct > 0 && (
          <path
            d={arcPath}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            style={{ transition: 'stroke 0.3s, d 0.3s' }}
          />
        )}
        {/* Value text */}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="14" fontWeight="700" fill={color}>
          {value < 100 ? value.toFixed(1) : Math.round(value)}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize="8" fill="#64748b">
          {unit}
        </text>
      </svg>
      <span className="mt-0.5 text-[10px] text-slate-400">{label}</span>
    </div>
  )
}

function MiniSparkline({ data, warnAt, dangerAt }: { data: number[]; warnAt?: number; dangerAt?: number }) {
  if (data.length < 2) return null
  const W = 120, H = 32, pad = 2
  const maxVal = Math.max(...data, 1)
  const step = (W - pad * 2) / (data.length - 1)

  const points = data.map((v, i) => [pad + i * step, H - pad - ((v / maxVal) * (H - pad * 2))] as [number, number])
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

  return (
    <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`}>
      {/* Warn/danger thresholds */}
      {warnAt !== undefined && (
        <line x1={pad} y1={H - pad - (warnAt / maxVal) * (H - pad * 2)} x2={W - pad} y2={H - pad - (warnAt / maxVal) * (H - pad * 2)} stroke="#fbbf24" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.4" />
      )}
      {dangerAt !== undefined && (
        <line x1={pad} y1={H - pad - (dangerAt / maxVal) * (H - pad * 2)} x2={W - pad} y2={H - pad - (dangerAt / maxVal) * (H - pad * 2)} stroke="#f87171" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.4" />
      )}
      <path d={d} fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
      {/* Latest point */}
      {points.length > 0 && (
        <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="2.5" fill="#38bdf8" />
      )}
    </svg>
  )
}

export function PerformancePanel() {
  const { t } = useTranslation()
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [error, setError] = useState(false)

  const fetchMetrics = useCallback(async () => {
    try {
      const data = await getPerformanceMetrics()
      setMetrics(data)
      setError(false)
    } catch {
      setError(true)
    }
  }, [])

  useEffect(() => {
    void fetchMetrics()
    const id = setInterval(() => void fetchMetrics(), 3000)
    return () => clearInterval(id)
  }, [fetchMetrics])

  if (error || !metrics) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <p className="panel-section-label mb-2 flex items-center gap-1.5">
          <span>📈</span> {t('settings.performance', { defaultValue: 'Performance' })}
        </p>
        <p className="text-xs text-slate-500">{error ? t('stats.load_failed', { defaultValue: 'Failed to load' }) : t('stats.loading', { defaultValue: 'Loading...' })}</p>
      </div>
    )
  }

  const tickStatus = metrics.avg_tick_duration_ms >= 500 ? 'danger' : metrics.avg_tick_duration_ms >= 200 ? 'warn' : 'ok'
  const statusColors = { ok: 'text-emerald-400', warn: 'text-amber-400', danger: 'text-red-400' }
  const statusLabels = { ok: 'Healthy', warn: 'Slow', danger: 'Critical' }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="panel-section-label flex items-center gap-1.5">
          <span>📈</span> {t('settings.performance', { defaultValue: 'Performance' })}
        </p>
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${statusColors[tickStatus]}`}>
          {statusLabels[tickStatus]}
          {metrics.adaptive_throttle_active && ' · Throttled'}
        </span>
      </div>

      {/* Gauge meters */}
      <div className="grid grid-cols-3 gap-1">
        <GaugeMeter
          value={metrics.avg_tick_duration_ms}
          max={1000}
          label={t('perf.tick_duration', { defaultValue: 'Tick Avg' })}
          unit="ms"
          warnAt={200}
          dangerAt={500}
        />
        <GaugeMeter
          value={metrics.memory_usage_mb}
          max={1024}
          label={t('perf.memory', { defaultValue: 'Memory' })}
          unit="MB"
          warnAt={512}
          dangerAt={768}
        />
        <GaugeMeter
          value={metrics.active_agents_count}
          max={50}
          label={t('perf.agents', { defaultValue: 'Agents' })}
          unit=""
          warnAt={20}
          dangerAt={35}
        />
      </div>

      {/* Tick duration sparkline */}
      {metrics.tick_history.length > 1 && (
        <div className="mt-2">
          <p className="mb-1 text-[9px] text-slate-500">{t('perf.tick_history', { defaultValue: 'Tick Duration History (ms)' })}</p>
          <MiniSparkline data={metrics.tick_history} warnAt={200} dangerAt={500} />
        </div>
      )}

      {/* Metrics summary */}
      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
        <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2 py-1.5">
          <span className="text-slate-500">{t('perf.pending_llm', { defaultValue: 'LLM Queue' })}</span>
          <span className="font-medium text-slate-300">{metrics.pending_llm_calls}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2 py-1.5">
          <span className="text-slate-500">{t('perf.ws_conns', { defaultValue: 'WS Conns' })}</span>
          <span className="font-medium text-slate-300">{metrics.websocket_connections}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2 py-1.5">
          <span className="text-slate-500">{t('perf.max_tick', { defaultValue: 'Max Tick' })}</span>
          <span className="font-medium text-slate-300">{metrics.max_tick_duration_ms.toFixed(0)}ms</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2 py-1.5">
          <span className="text-slate-500">{t('perf.throttle', { defaultValue: 'Throttle' })}</span>
          <span className={`font-medium ${metrics.adaptive_throttle_active ? 'text-amber-400' : 'text-emerald-400'}`}>
            {metrics.adaptive_throttle_active ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>
    </div>
  )
}
