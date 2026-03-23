import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getBuildingDetails, type BuildingDetailData } from '../../services/api'

const TYPE_ICON: Record<string, string> = {
  cafe: '\u2615',
  park: '\uD83C\uDF33',
  school: '\uD83C\uDFEB',
  shop: '\uD83D\uDED2',
  home: '\uD83C\uDFE0',
  gym: '\uD83C\uDFCB',
  library: '\uD83D\uDCDA',
  hospital: '\uD83C\uDFE5',
}

const STATUS_ICON: Record<string, string> = {
  chatting: '\uD83D\uDCAC',
  idle: '\uD83D\uDCA4',
}

const MOOD_EMOJI: Record<string, string> = {
  happy: '\uD83D\uDE0A',
  content: '\uD83D\uDE42',
  sad: '\uD83D\uDE22',
  angry: '\uD83D\uDE20',
  neutral: '\uD83D\uDE10',
  excited: '\uD83E\uDD29',
  fearful: '\uD83D\uDE28',
  calm: '\uD83D\uDE0C',
  tired: '\uD83D\uDE34',
}

interface BuildingDetailPanelProps {
  buildingId: string
  onClose: () => void
}

export function BuildingDetailPanel({ buildingId, onClose }: BuildingDetailPanelProps) {
  const { t } = useTranslation()
  const [data, setData] = useState<BuildingDetailData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDetails = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getBuildingDetails(buildingId)
      setData(result)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [buildingId])

  useEffect(() => {
    void fetchDetails()
    const interval = setInterval(() => void fetchDetails(), 5000)
    return () => clearInterval(interval)
  }, [fetchDetails])

  if (loading && !data) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300/60 border-t-transparent" />
          {t('building_detail.loading')}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
        {t('building_detail.not_found')}
      </div>
    )
  }

  const icon = TYPE_ICON[data.type] ?? '\uD83C\uDFE2'
  const capacityLabel = data.type === 'park' ? '\u221E' : String(data.capacity)

  return (
    <div className="grid gap-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <div>
            <h3 className="text-sm font-bold text-white">{data.name}</h3>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{data.type}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400 transition hover:bg-white/10 active:scale-95"
        >
          {'\u2715'}
        </button>
      </div>

      {/* Capacity bar */}
      <div className="rounded-lg border border-white/6 bg-white/[0.03] px-3 py-2">
        <div className="mb-1.5 flex items-center justify-between text-[10px] text-slate-400">
          <span>{t('building_detail.capacity')}</span>
          <span className="tabular-nums text-slate-300">
            {data.occupants} / {capacityLabel}
          </span>
        </div>
        {data.type !== 'park' && (
          <div className="h-1.5 rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-cyan-400/70 transition-all duration-500"
              style={{ width: `${Math.min(100, (data.occupants / data.capacity) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Current residents */}
      <div>
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
          {t('building_detail.residents_inside')} ({data.current_residents.length})
        </p>
        {data.current_residents.length === 0 ? (
          <p className="text-xs text-slate-500 italic">{t('building_detail.empty')}</p>
        ) : (
          <div className="space-y-1">
            {data.current_residents.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-white/6 bg-white/[0.03] px-2.5 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs">{MOOD_EMOJI[r.mood] ?? '\uD83D\uDE10'}</span>
                  <div>
                    <span className="text-xs font-medium text-slate-200">{r.name}</span>
                    <span className="ml-1.5 text-[10px] text-slate-500">{r.occupation}</span>
                  </div>
                </div>
                <span className="text-[10px] text-slate-500" title={r.status}>
                  {STATUS_ICON[r.status] ?? STATUS_ICON.idle} {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent visits */}
      {data.recent_visits.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
            {t('building_detail.recent_visits')}
          </p>
          <div className="max-h-32 space-y-0.5 overflow-y-auto">
            {data.recent_visits.map((v, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-[10px] text-slate-400"
              >
                <span>
                  {v.action === 'enter' ? '\u2192' : '\u2190'} {v.resident_name}
                </span>
                <span className="tabular-nums text-slate-600">tick {v.tick}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
