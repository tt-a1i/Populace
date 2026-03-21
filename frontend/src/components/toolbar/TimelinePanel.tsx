import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { TimelineEvent } from '../../services/api'
import { getTimeline } from '../../services/api'

const EVENT_TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  relationship_milestone: { icon: '💫', color: 'text-pink-300', label: '关系里程碑' },
  weather_change: { icon: '🌤', color: 'text-sky-300', label: '天气变化' },
  custom_event: { icon: '⚡', color: 'text-cyan-300', label: '自定义事件' },
  preset_event: { icon: '🎭', color: 'text-amber-300', label: '预设事件' },
  achievement: { icon: '🏆', color: 'text-yellow-300', label: '成就解锁' },
}

const ALL_TYPES = Object.keys(EVENT_TYPE_CONFIG)

function EventCard({ event }: { event: TimelineEvent }) {
  const cfg = EVENT_TYPE_CONFIG[event.event_type] ?? { icon: '📌', color: 'text-slate-300', label: event.event_type }
  return (
    <div className="flex gap-3 rounded-xl border border-white/6 bg-white/4 px-3 py-2.5">
      <div className="mt-0.5 text-base">{cfg.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
          <span className="text-[10px] text-slate-500">Tick {event.tick} · {event.time}</span>
        </div>
        <p className="mt-0.5 text-sm leading-5 text-slate-200">{event.description}</p>
      </div>
    </div>
  )
}

export function TimelinePanel() {
  const { t } = useTranslation()
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<string>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getTimeline()
      setEvents(data)
    } catch {
      // silently ignore if backend unavailable
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const displayed = filter === 'all' ? events : events.filter((e) => e.event_type === filter)

  return (
    <div className="rounded-xl border border-white/10 bg-white/4 p-5">
      <p className="mb-1 text-[10px] uppercase tracking-[0.3em] text-slate-400">
        {t('timeline.badge')}
      </p>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-white">{t('timeline.title')}</h3>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
        >
          {loading ? '…' : t('timeline.refresh')}
        </button>
      </div>

      {/* Filter chips */}
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`rounded-full border px-3 py-1 text-xs transition ${filter === 'all' ? 'border-white/20 bg-white/10 text-white' : 'border-white/8 text-slate-400 hover:bg-white/6'}`}
        >
          {t('timeline.all')}
        </button>
        {ALL_TYPES.map((type) => {
          const cfg = EVENT_TYPE_CONFIG[type]
          return (
            <button
              key={type}
              type="button"
              onClick={() => setFilter(type)}
              className={`rounded-full border px-3 py-1 text-xs transition ${filter === type ? 'border-white/20 bg-white/10 text-white' : 'border-white/8 text-slate-400 hover:bg-white/6'}`}
            >
              {cfg.icon} {cfg.label}
            </button>
          )
        })}
      </div>

      {/* Event list */}
      <div className="max-h-80 overflow-y-auto pr-1">
        {displayed.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">{t('timeline.empty')}</p>
        ) : (
          <div className="grid gap-2">
            {displayed.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        )}
      </div>
    </div>
  )
}
