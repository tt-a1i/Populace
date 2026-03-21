import { useState } from 'react'

import {
  getMoodHistory,
  getNetworkAnalysis,
  getResidents,
  getSimulationStats,
} from '../../services/api'
import { useRelationshipsStore } from '../../stores/relationships'
import { useSimulationStore } from '../../stores/simulation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function arrayToCSV(rows: Record<string, unknown>[], headers: string[]): string {
  const escape = (val: unknown) => {
    const s = String(val ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ]
  return lines.join('\n')
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob(['\uFEFF' + content], { type: mimeType }) // BOM for Excel UTF-8
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

// ---------------------------------------------------------------------------
// ExportPanel
// ---------------------------------------------------------------------------

type ExportKey = 'json' | 'residents_csv' | 'relationships_csv' | 'mood_csv' | 'network_csv'

export function ExportPanel() {
  const [busy, setBusy] = useState<ExportKey | null>(null)
  const [lastMsg, setLastMsg] = useState<string | null>(null)

  const residents = useSimulationStore((s) => s.residents)
  const tick = useSimulationStore((s) => s.tick)
  const relationships = useRelationshipsStore((s) => s.relationships)

  const run = async (key: ExportKey, fn: () => Promise<void>) => {
    setBusy(key)
    setLastMsg(null)
    try {
      await fn()
      setLastMsg('✓ 导出成功')
    } catch {
      setLastMsg('✗ 导出失败')
    } finally {
      setBusy(null)
    }
  }

  const exportJSON = () =>
    run('json', async () => {
      const [stats, moodHistory, networkAnalysis, backendResidents] = await Promise.all([
        getSimulationStats(),
        getMoodHistory(),
        getNetworkAnalysis(),
        getResidents(),
      ])
      const payload = {
        exported_at: new Date().toISOString(),
        tick,
        stats,
        residents: backendResidents,
        relationships,
        mood_history: moodHistory,
        network_analysis: networkAnalysis,
      }
      downloadFile(JSON.stringify(payload, null, 2), `populace-export-${nowStamp()}.json`, 'application/json')
    })

  const exportResidentsCSV = () =>
    run('residents_csv', async () => {
      const rows = residents.map((r) => ({
        id: r.id,
        name: r.name,
        mood: r.mood ?? '',
        personality: r.personality ?? '',
        x: r.targetX,
        y: r.targetY,
        building: r.currentBuildingId ?? '',
        status: r.status,
        goals: (r.goals ?? []).join('; '),
      }))
      const csv = arrayToCSV(rows as Record<string, unknown>[], [
        'id', 'name', 'mood', 'personality', 'x', 'y', 'building', 'status', 'goals',
      ])
      downloadFile(csv, `residents-${nowStamp()}.csv`, 'text/csv;charset=utf-8')
    })

  const exportRelationshipsCSV = () =>
    run('relationships_csv', async () => {
      const rows = relationships.map((r) => ({
        from_id: r.from_id,
        to_id: r.to_id,
        type: r.type,
        intensity: r.intensity.toFixed(3),
        reason: r.reason,
      }))
      const csv = arrayToCSV(rows as Record<string, unknown>[], [
        'from_id', 'to_id', 'type', 'intensity', 'reason',
      ])
      downloadFile(csv, `relationships-${nowStamp()}.csv`, 'text/csv;charset=utf-8')
    })

  const exportMoodCSV = () =>
    run('mood_csv', async () => {
      const history = await getMoodHistory()
      const rows = history.map((e) => ({
        tick: e.tick,
        resident_id: e.resident_id,
        resident_name: e.resident_name,
        mood: e.mood,
      }))
      const csv = arrayToCSV(rows as Record<string, unknown>[], [
        'tick', 'resident_id', 'resident_name', 'mood',
      ])
      downloadFile(csv, `mood-history-${nowStamp()}.csv`, 'text/csv;charset=utf-8')
    })

  const exportNetworkCSV = () =>
    run('network_csv', async () => {
      const analysis = await getNetworkAnalysis()
      const rows = analysis.map((e) => ({
        resident_id: e.resident_id,
        name: e.name,
        relationship_count: e.relationship_count,
        outgoing_count: e.outgoing_count,
        incoming_count: e.incoming_count,
        avg_intensity: e.avg_intensity.toFixed(3),
        influence_score: e.influence_score.toFixed(3),
      }))
      const csv = arrayToCSV(rows as Record<string, unknown>[], [
        'resident_id', 'name', 'relationship_count', 'outgoing_count',
        'incoming_count', 'avg_intensity', 'influence_score',
      ])
      downloadFile(csv, `network-analysis-${nowStamp()}.csv`, 'text/csv;charset=utf-8')
    })

  const buttons: Array<{
    key: ExportKey
    label: string
    sub: string
    tone: string
    onClick: () => void
  }> = [
    {
      key: 'json',
      label: '导出完整 JSON',
      sub: '含统计 + 居民 + 关系 + 情绪历史',
      tone: 'cyan',
      onClick: exportJSON,
    },
    {
      key: 'residents_csv',
      label: '导出居民 CSV',
      sub: '姓名、情绪、位置、状态、目标',
      tone: 'amber',
      onClick: exportResidentsCSV,
    },
    {
      key: 'relationships_csv',
      label: '导出关系 CSV',
      sub: 'from/to、类型、强度、原因',
      tone: 'rose',
      onClick: exportRelationshipsCSV,
    },
    {
      key: 'mood_csv',
      label: '导出情绪历史 CSV',
      sub: '每 tick 每居民情绪快照',
      tone: 'violet',
      onClick: exportMoodCSV,
    },
    {
      key: 'network_csv',
      label: '导出网络分析 CSV',
      sub: '影响力排名、关系数、平均强度',
      tone: 'emerald',
      onClick: exportNetworkCSV,
    },
  ]

  const toneClasses: Record<string, string> = {
    cyan: 'border-cyan-300/25 bg-cyan-300/8 text-cyan-200 hover:bg-cyan-300/18',
    amber: 'border-amber-300/25 bg-amber-300/8 text-amber-200 hover:bg-amber-300/18',
    rose: 'border-rose-300/25 bg-rose-300/8 text-rose-200 hover:bg-rose-300/18',
    violet: 'border-violet-300/25 bg-violet-300/8 text-violet-200 hover:bg-violet-300/18',
    emerald: 'border-emerald-300/25 bg-emerald-300/8 text-emerald-200 hover:bg-emerald-300/18',
  }

  return (
    <div className="rounded-[24px] border border-sky-300/20 bg-slate-950/70 p-5 text-slate-100 shadow-[0_18px_44px_rgba(15,23,42,0.35)]">
      <p className="text-[11px] uppercase tracking-[0.3em] text-sky-200/70">Export</p>
      <h3 className="mt-1 font-display text-2xl text-white">数据导出</h3>
      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
        将当前模拟数据导出为 JSON 或 CSV 文件，可用于外部分析、可视化或存档。
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {buttons.map((btn) => (
          <button
            key={btn.key}
            type="button"
            disabled={busy !== null}
            onClick={btn.onClick}
            className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition disabled:opacity-50 ${toneClasses[btn.tone]}`}
          >
            <span className="mt-0.5 text-lg leading-none">
              {busy === btn.key ? '⏳' : '⬇'}
            </span>
            <span>
              <span className="block text-sm font-semibold">
                {busy === btn.key ? '导出中…' : btn.label}
              </span>
              <span className="mt-0.5 block text-[11px] opacity-70">{btn.sub}</span>
            </span>
          </button>
        ))}
      </div>

      {lastMsg && (
        <p className={`mt-4 text-sm ${lastMsg.startsWith('✓') ? 'text-emerald-400' : 'text-rose-400'}`}>
          {lastMsg}
        </p>
      )}

      <p className="mt-4 text-[11px] text-slate-600">
        当前 Tick: {tick} · 居民 {residents.length} 人 · 关系 {relationships.length} 条
      </p>
    </div>
  )
}
