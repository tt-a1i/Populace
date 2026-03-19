import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useSimulationStore } from '../../stores/simulation'

export function MessageBar() {
  const { t } = useTranslation()
  const messages = useSimulationStore((state) => state.messageFeed)

  const marqueeItems = useMemo(() => {
    const source = messages.length > 0 ? messages : [t('message_bar.empty')]
    return [...source, ...source]
  }, [messages, t])

  return (
    <div className="overflow-hidden rounded-full border border-cyan-300/18 bg-slate-950/55 px-4 py-2">
      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.28em] text-cyan-100/70">
        <span className="shrink-0">{t('message_bar.label')}</span>
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="message-marquee flex min-w-max gap-6 whitespace-nowrap text-sm normal-case tracking-normal text-slate-200">
            {marqueeItems.map((message, index) => (
              <span key={`${message}-${index}`} className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300/70" />
                {message}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
