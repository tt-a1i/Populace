import { useEffect, useMemo, useState } from 'react'

import { getEmotionHeatmap, getEmotionHistory, type EmotionHeatmapApi } from '../../services/api'
import { PanelShell } from '../ui/PanelShell'

const MOOD_COLORS: Record<string, string> = {
  ecstatic: '#22c55e',
  excited: '#4ade80',
  happy: '#86efac',
  content: '#a7f3d0',
  calm: '#d1fae5',
  neutral: '#94a3b8',
  tired: '#fbbf24',
  sad: '#60a5fa',
  angry: '#f87171',
  fearful: '#a78bfa',
  depressed: '#475569',
}

const MOOD_LABELS: Record<string, string> = {
  ecstatic: '狂喜',
  excited: '兴奋',
  happy: '快乐',
  content: '满足',
  calm: '平静',
  neutral: '中性',
  tired: '疲倦',
  sad: '悲伤',
  angry: '愤怒',
  fearful: '恐惧',
  depressed: '沮丧',
}

function getHappinessColor(value: number): string {
  if (value >= 0.6) return 'from-emerald-500/20 to-emerald-600/20'
  if (value >= 0.3) return 'from-lime-500/20 to-lime-600/20'
  if (value >= 0) return 'from-yellow-500/20 to-yellow-600/20'
  if (value >= -0.3) return 'from-orange-500/20 to-orange-600/20'
  return 'from-red-500/20 to-red-600/20'
}

function getHappinessTextColor(value: number): string {
  if (value >= 0.6) return 'text-emerald-400'
  if (value >= 0.3) return 'text-lime-400'
  if (value >= 0) return 'text-yellow-400'
  if (value >= -0.3) return 'text-orange-400'
  return 'text-red-400'
}

export function EmotionPanel() {
  const [heatmapData, setHeatmapData] = useState<EmotionHeatmapApi | null>(null)
  const [historyData, setHistoryData] = useState<{ tick: number; avg_happiness: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [showHeatmap, setShowHeatmap] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [heatmap, history] = await Promise.all([
          getEmotionHeatmap().catch(() => null),
          getEmotionHistory().catch(() => ({ history: [] })),
        ])
        if (heatmap) setHeatmapData(heatmap)
        setHistoryData(history.history || [])
      } catch (err) {
        console.error('Failed to load emotion data:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const avgHappiness = useMemo(() => heatmapData?.avg_happiness ?? 0, [heatmapData])

  const moodDistribution = useMemo(() => {
    if (!heatmapData?.mood_distribution) return []
    const total = Object.values(heatmapData.mood_distribution).reduce((a, b) => a + b, 0)
    return Object.entries(heatmapData.mood_distribution)
      .map(([mood, count]) => ({
        mood,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        color: MOOD_COLORS[mood] || '#94a3b8',
        label: MOOD_LABELS[mood] || mood,
      }))
      .sort((a, b) => b.count - a.count)
  }, [heatmapData])

  if (loading) {
    return (
      <PanelShell icon="💭" title="情感热力图" badge="情绪">
        <div className="py-6 text-center text-sm text-slate-500">加载中...</div>
      </PanelShell>
    )
  }

  return (
    <PanelShell icon="💭" title="情感热力图" badge="情绪">
      {/* Happiness Gauge */}
      <div className={`mb-4 rounded-2xl border border-white/10 bg-gradient-to-br p-4 ${getHappinessColor(avgHappiness)}`}>
        <p className="text-xs uppercase tracking-wider text-slate-400">全镇幸福度</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className={`text-4xl font-bold ${getHappinessTextColor(avgHappiness)}`}>
            {(avgHappiness * 100).toFixed(0)}
          </span>
          <span className="text-sm text-slate-400">/ 100</span>
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all ${avgHappiness >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
            style={{ width: `${Math.max(0, Math.min(100, (avgHappiness + 1) * 50))}%` }}
          />
        </div>
      </div>

      {/* Heatmap Toggle */}
      <div className="mb-4 flex items-center justify-between">
        <p className="panel-section-label">情绪热点 ({heatmapData?.hotspots.length ?? 0})</p>
        <button
          type="button"
          onClick={() => setShowHeatmap(!showHeatmap)}
          className={`rounded-lg border px-2 py-1 text-xs transition ${
            showHeatmap
              ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
              : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
          }`}
        >
          {showHeatmap ? '隐藏热力图' : '显示热力图'}
        </button>
      </div>

      {/* Hotspots List */}
      <div className="mb-4 space-y-2">
        {heatmapData?.hotspots && heatmapData.hotspots.length > 0 ? (
          heatmapData.hotspots.map((spot, i) => (
            <div
              key={`${spot.x}-${spot.y}`}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                  #{i + 1}
                </span>
                <span className="text-sm text-slate-300">
                  位置 ({spot.x}, {spot.y})
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="rounded px-1.5 py-0.5 text-xs"
                  style={{ backgroundColor: `${MOOD_COLORS[spot.mood]}33`, color: MOOD_COLORS[spot.mood] }}
                >
                  {MOOD_LABELS[spot.mood] || spot.mood}
                </span>
                <span className="text-xs text-slate-400">{spot.resident_count}人</span>
              </div>
            </div>
          ))
        ) : (
          <p className="py-4 text-center text-sm text-slate-500">暂无情绪热点</p>
        )}
      </div>

      {/* Mood Distribution */}
      <div className="mb-4">
        <p className="panel-section-label mb-2">情绪分布</p>
        <div className="space-y-1.5">
          {moodDistribution.map((item) => (
            <div key={item.mood} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-slate-400">{item.label}</span>
              <div className="flex-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-xs text-slate-400">{item.percentage}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* History Chart (Simple Line) */}
      {historyData.length > 0 && (
        <div>
          <p className="panel-section-label mb-2">近 20 Tick 幸福度趋势</p>
          <div className="flex items-end gap-0.5 rounded-xl border border-white/10 bg-white/5 p-3">
            {historyData.map((entry) => {
              const height = Math.max(10, Math.min(100, ((entry.avg_happiness + 1) / 2) * 100))
              const color = entry.avg_happiness >= 0 ? 'bg-emerald-500/60' : 'bg-red-500/60'
              return (
                <div
                  key={entry.tick}
                  className={`flex-1 rounded-t ${color}`}
                  style={{ height: `${height}%` }}
                  title={`Tick ${entry.tick}: ${(entry.avg_happiness * 100).toFixed(0)}`}
                />
              )
            })}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-slate-500">
            <span>Tick {historyData[0]?.tick}</span>
            <span>Tick {historyData[historyData.length - 1]?.tick}</span>
          </div>
        </div>
      )}
    </PanelShell>
  )
}
