import { useTranslation } from 'react-i18next'

import type { FeedMessage } from '../../stores/simulation'
import { useSimulationStore } from '../../stores/simulation'

const KIND_STYLES: Record<FeedMessage['kind'], { dot: string; bg: string; textClass: string }> = {
  dialogue: {
    dot: 'bg-amber-400/70',
    bg: 'bg-amber-400/6 rounded-xl rounded-bl-sm',
    textClass: 'text-amber-100/90',
  },
  event: {
    dot: 'bg-cyan-400/80',
    bg: 'bg-cyan-400/8 rounded-xl',
    textClass: 'text-cyan-100/90',
  },
  system: {
    dot: 'bg-slate-400/50',
    bg: '',
    textClass: 'text-slate-400 italic',
  },
}

export function MessageBar() {
  const { t } = useTranslation()
  const messages = useSimulationStore((state) => state.messageFeed)

  const isEmpty = messages.length === 0

  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-slate-950/50 px-4 py-2.5">
      <div className="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.26em] text-slate-500">
        <span>{t('message_bar.label')}</span>
        {!isEmpty && (
          <span className="ml-auto tabular-nums text-slate-600">{messages.length}</span>
        )}
      </div>
      <div className="flex flex-col gap-1" style={{ minHeight: '3.5rem' }}>
        {isEmpty ? (
          <p className="py-2 text-xs text-slate-500">{t('message_bar.empty')}</p>
        ) : (
          messages.map((msg) => {
            const style = KIND_STYLES[msg.kind] ?? KIND_STYLES.system
            return (
              <div
                key={msg.id}
                className={`feed-item-enter flex items-start gap-2 px-2.5 py-1.5 text-xs ${style.bg}`}
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
