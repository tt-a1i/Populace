import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  getMoodHistory,
  getNetworkAnalysis,
  getResidents,
  getSimulationStats,
} from '../../services/api'
import { useRelationshipsStore } from '../../stores/relationships'
import { useSimulationStore } from '../../stores/simulation'
import { resetTutorial } from '../ui/TutorialOverlay'

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
  const { t } = useTranslation()
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
      setLastMsg(t('export_panel.success'))
    } catch {
      setLastMsg(t('export_panel.fail'))
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
      label: t('export_panel.json_label'),
      sub: t('export_panel.json_sub'),
      tone: 'cyan',
      onClick: exportJSON,
    },
    {
      key: 'residents_csv',
      label: t('export_panel.residents_csv_label'),
      sub: t('export_panel.residents_csv_sub'),
      tone: 'amber',
      onClick: exportResidentsCSV,
    },
    {
      key: 'relationships_csv',
      label: t('export_panel.relationships_csv_label'),
      sub: t('export_panel.relationships_csv_sub'),
      tone: 'rose',
      onClick: exportRelationshipsCSV,
    },
    {
      key: 'mood_csv',
      label: t('export_panel.mood_csv_label'),
      sub: t('export_panel.mood_csv_sub'),
      tone: 'violet',
      onClick: exportMoodCSV,
    },
    {
      key: 'network_csv',
      label: t('export_panel.network_csv_label'),
      sub: t('export_panel.network_csv_sub'),
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
    <div className="rounded-xl border border-sky-300/20 bg-slate-950/70 p-5 text-slate-100 ">
      <p className="text-[11px] uppercase tracking-[0.3em] text-sky-200/70">{t('export_panel.badge')}</p>
      <h3 className="mt-1 font-display text-2xl text-white">{t('export_panel.title')}</h3>
      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
        {t('export_panel.desc')}
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
                {busy === btn.key ? t('export_panel.exporting') : btn.label}
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
        {t('export_panel.footer', { tick, residentCount: residents.length, relationshipCount: relationships.length })}
      </p>

      {/* ── Tutorial reset ── */}
      <div className="mt-5 border-t border-white/8 pt-4">
        <p className="mb-2 text-[11px] uppercase tracking-[0.28em] text-slate-600">{t('export_panel.settings_label')}</p>
        <button
          type="button"
          onClick={resetTutorial}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-400 transition hover:bg-white/10"
        >
          {t('export_panel.reset_tutorial')}
        </button>
      </div>
    </div>
  )
}
