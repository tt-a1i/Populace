import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type SimulationStats, getSimulationStats } from '../../services/api'

function formatMoodScore(score: number): string {
  return score.toFixed(2)
}

export function StatsPanel() {
  const { t } = useTranslation()
  const [stats, setStats] = useState<SimulationStats | null>(null)
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
        const nextStats = await getSimulationStats()
        if (requestSequenceRef.current !== requestSequence) {
          return
        }

        setStats(nextStats)
        setError(null)
      } catch {
        if (requestSequenceRef.current !== requestSequence) {
          return
        }

        setStats(null)
        setError(t('stats.load_failed'))
      } finally {
        if (requestSequenceRef.current !== requestSequence) {
          return
        }

        setLoading(false)
        setRefreshing(false)
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
    <div className="grid gap-4 rounded-[24px] border border-white/10 bg-slate-950/70 p-5 text-slate-100 shadow-[0_18px_44px_rgba(15,23,42,0.35)]">
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
        </>
      ) : null}
    </div>
  )
}
