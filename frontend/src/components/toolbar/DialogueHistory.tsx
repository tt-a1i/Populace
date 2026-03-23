import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  getDialogueHistory,
  getResidents,
  type ApiResident,
  type DialogueHistoryEntry,
} from '../../services/api'

export function DialogueHistory() {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<DialogueHistoryEntry[]>([])
  const [residents, setResidents] = useState<ApiResident[]>([])
  const [selectedResidentId, setSelectedResidentId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [nextEntries, nextResidents] = await Promise.all([
          getDialogueHistory(),
          getResidents().catch(() => [] as ApiResident[]),
        ])

        if (cancelled) {
          return
        }

        setEntries(nextEntries)
        setResidents(nextResidents as ApiResident[])
        setError(null)
      } catch {
        if (!cancelled) {
          setEntries([])
          setError(t('dialogue_history.load_failed'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [t])

  const filteredEntries = useMemo(() => {
    const latestEntries = [...entries]
      .sort((left, right) => right.tick - left.tick)
      .slice(0, 50)

    if (!selectedResidentId) {
      return latestEntries
    }

    return latestEntries.filter(
      (entry) => entry.from_id === selectedResidentId || entry.to_id === selectedResidentId,
    )
  }, [entries, selectedResidentId])

  return (
    <div
      data-testid="dialogue-history-panel"
      className="grid gap-4 rounded-xl border border-white/10 bg-slate-950/70 p-5 text-slate-100"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-amber-100/70">
            {t('dialogue_history.badge')}
          </p>
          <h3 className="mt-2 font-display text-2xl text-white">{t('dialogue_history.title')}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            {t('dialogue_history.desc')}
          </p>
        </div>

        <label className="grid gap-2 text-sm text-slate-300">
          {t('dialogue_history.filter')}
          <select
            value={selectedResidentId}
            onChange={(event) => setSelectedResidentId(event.target.value)}
            aria-label={t('dialogue_history.filter')}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-50 outline-none focus:border-amber-300/40"
          >
            <option value="">{t('dialogue_history.filter_all')}</option>
            {residents.map((resident) => (
              <option key={resident.id} value={resident.id}>
                {resident.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-slate-300">
          {t('dialogue_history.loading')}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-400/20 bg-red-400/8 px-4 py-6 text-sm text-red-200">
          {error}
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-slate-400">
          {t('dialogue_history.empty')}
        </div>
      ) : (
        <div className="grid gap-2">
          {filteredEntries.map((entry) => (
            <article
              key={entry.id}
              data-testid="dialogue-history-item"
              className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span>{entry.time}</span>
                <span>{t('dialogue_history.tick', { tick: entry.tick })}</span>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-100">
                {entry.from_name} {'\u2192'} {entry.to_name}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-300">{entry.text}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
