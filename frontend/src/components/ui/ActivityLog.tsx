import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSimulationStore, type FeedMessage, type FeedMessageKind } from '../../stores/simulation'

type FilterKey = 'all' | 'dialogue' | 'event' | 'system'

const FILTERS: { key: FilterKey; labelKey: string; fallback: string }[] = [
  { key: 'all', labelKey: 'activity_log.filter_all', fallback: '\u5168\u90E8' },
  { key: 'dialogue', labelKey: 'activity_log.filter_dialogue', fallback: '\u5BF9\u8BDD' },
  { key: 'event', labelKey: 'activity_log.filter_event', fallback: '\u4E8B\u4EF6' },
  { key: 'system', labelKey: 'activity_log.filter_system', fallback: '\u7CFB\u7EDF' },
]

const KIND_STYLES: Record<FeedMessageKind, { dot: string; textClass: string }> = {
  dialogue: { dot: 'bg-amber-400/70', textClass: 'text-amber-100/90' },
  event: { dot: 'bg-cyan-400/80', textClass: 'text-cyan-100/90' },
  system: { dot: 'bg-slate-400/50', textClass: 'text-slate-400 italic' },
}

const MAX_LOG_ENTRIES = 200

export function ActivityLog() {
  const { t } = useTranslation()
  const messageFeed = useSimulationStore((state) => state.messageFeed)
  const [log, setLog] = useState<FeedMessage[]>([])
  const [filter, setFilter] = useState<FilterKey>('all')
  const [paused, setPaused] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevFeedRef = useRef<FeedMessage[]>([])

  // Accumulate messages into the full log
  useEffect(() => {
    if (paused) return

    const prevIds = new Set(prevFeedRef.current.map((m) => m.id))
    const newMessages = messageFeed.filter((m) => !prevIds.has(m.id))
    prevFeedRef.current = messageFeed

    if (newMessages.length > 0) {
      setLog((current) => [...current, ...newMessages].slice(-MAX_LOG_ENTRIES))
    }
  }, [messageFeed, paused])

  // Auto-scroll when not paused
  useEffect(() => {
    if (paused) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [log, paused])

  const filtered = filter === 'all' ? log : log.filter((m) => m.kind === filter)

  return (
    <div className="flex h-full flex-col" data-testid="activity-log">
      {/* Header: filter pills + pause button */}
      <div className="flex items-center justify-between gap-2 pb-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`btn-micro rounded-full px-2.5 py-1 text-[10px] font-medium transition duration-200 ${
                filter === f.key
                  ? 'theme-accent-button-active'
                  : 'border border-white/8 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {t(f.labelKey, f.fallback)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPaused((v) => !v)}
          className={`btn-micro rounded-full border px-2.5 py-1 text-[10px] font-medium transition duration-200 ${
            paused
              ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
              : 'border-white/8 bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
          title={paused ? t('activity_log.resume', '\u7EE7\u7EED') : t('activity_log.pause', '\u6682\u505C')}
        >
          {paused ? '\u25B6' : '\u23F8'}
          <span className="ml-1">
            {paused ? t('activity_log.resume', '\u7EE7\u7EED') : t('activity_log.pause', '\u6682\u505C')}
          </span>
        </button>
      </div>

      {/* Paused indicator */}
      {paused && (
        <div className="mb-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-1.5 text-center text-[10px] text-amber-200">
          {t('activity_log.paused_hint', '\u5DF2\u6682\u505C \u2014 \u65B0\u6D3B\u52A8\u5C06\u5728\u6062\u590D\u540E\u663E\u793A')}
        </div>
      )}

      {/* Log entries */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1"
      >
        {filtered.length > 0 ? (
          filtered.map((msg) => {
            const style = KIND_STYLES[msg.kind] ?? KIND_STYLES.system
            return (
              <div
                key={msg.id}
                className="flex items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-xs transition hover:bg-white/[0.03]"
              >
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`}
                />
                <span className={`leading-relaxed ${style.textClass}`}>{msg.text}</span>
              </div>
            )
          })
        ) : (
          <div className="flex h-20 items-center justify-center">
            <p className="text-xs text-slate-500">
              {t('activity_log.empty', '\u6682\u65E0\u6D3B\u52A8\u8BB0\u5F55')}
            </p>
          </div>
        )}
      </div>

      {/* Footer: entry count */}
      <div className="mt-2 flex items-center justify-between border-t border-white/6 pt-2 text-[10px] text-slate-500">
        <span>
          {t('activity_log.count', { count: filtered.length, defaultValue: `${filtered.length} \u6761\u8BB0\u5F55` })}
        </span>
        <span>
          {t('activity_log.total', { count: log.length, defaultValue: `\u5171 ${log.length} \u6761` })}
        </span>
      </div>
    </div>
  )
}
