import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import type { FeedMessage } from '../../stores/simulation'
import { useSimulationStore } from '../../stores/simulation'

const KIND_STYLES: Record<FeedMessage['kind'], { dot: string; bg: string; textClass: string; border: string }> = {
  dialogue: {
    dot: 'bg-amber-400/70',
    bg: 'bg-amber-400/[0.06]',
    textClass: 'text-amber-100/90',
    border: 'border-l-2 border-amber-400/30',
  },
  event: {
    dot: 'bg-cyan-400/80',
    bg: 'bg-cyan-400/[0.06]',
    textClass: 'text-cyan-100/90',
    border: 'border-l-2 border-cyan-400/30',
  },
  system: {
    dot: 'bg-slate-400/50',
    bg: '',
    textClass: 'text-slate-400 italic',
    border: '',
  },
}

export function MessageBar() {
  const { t } = useTranslation()
  const messageFeed = useSimulationStore((state) => state.messageFeed)
  const messages = useMemo(() => messageFeed ?? [], [messageFeed])
  const scrollRef = useRef<HTMLDivElement>(null)

  const isEmpty = messages.length === 0

  // Auto-scroll to latest message
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-slate-950/70 px-4 py-2.5 backdrop-blur-sm">
      <div className="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.26em] text-slate-500">
        <span>{t('message_bar.label')}</span>
      </div>
      <div ref={scrollRef} className="flex max-h-32 flex-col gap-1.5 overflow-y-auto" style={{ minHeight: '3.5rem' }}>
        {isEmpty ? (
          <p className="py-2 text-xs text-slate-500">{t('message_bar.empty')}</p>
        ) : (
          messages.map((msg) => {
            const style = KIND_STYLES[msg.kind] ?? KIND_STYLES.system
            return (
              <div
                key={msg.id}
                className={`feed-item-enter flex items-start gap-2.5 rounded-xl px-3 py-2 text-xs ${style.bg} ${style.border}`}
              >
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                <span className={`leading-relaxed ${style.textClass}`}>{msg.text}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
