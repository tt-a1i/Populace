import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { injectEvent } from '../../services/api'

export function EventInjector() {
  const { t } = useTranslation()
  const [customEvent, setCustomEvent] = useState('')
  const [lastEvent, setLastEvent] = useState('')
  const [busy, setBusy] = useState(false)

  const presetEvents: string[] = t('event_injector.presets', { returnObjects: true }) as string[]
  const canSubmitCustom = useMemo(() => customEvent.trim().length > 0, [customEvent])

  const submitEvent = async (description: string) => {
    setBusy(true)
    try {
      await injectEvent({ description })
      setLastEvent(description)
      setCustomEvent('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 rounded-[24px] border border-white/10 bg-slate-950/70 p-4 text-slate-100 shadow-[0_18px_44px_rgba(15,23,42,0.35)]">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-200/70">{t('event_injector.badge')}</p>
        <h3 className="mt-2 font-display text-2xl text-white">{t('event_injector.title')}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t('event_injector.desc')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {presetEvents.map((eventName) => (
          <button
            key={eventName}
            type="button"
            disabled={busy}
            onClick={() => void submitEvent(eventName)}
            className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-50 transition hover:bg-cyan-300/20 disabled:opacity-60"
          >
            {eventName}
          </button>
        ))}
      </div>

      <label className="grid gap-2 text-sm text-slate-300">
        {t('event_injector.custom_label')}
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={customEvent}
            onChange={(event) => setCustomEvent(event.target.value)}
            placeholder={t('event_injector.custom_placeholder')}
            className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-50 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40 focus:bg-white/10"
          />
          <button
            type="button"
            disabled={!canSubmitCustom || busy}
            onClick={() => void submitEvent(customEvent.trim())}
            className="rounded-2xl border border-amber-300/30 bg-amber-300/15 px-5 py-3 text-sm font-medium text-amber-50 transition hover:bg-amber-300/25 disabled:opacity-50"
          >
            {t('event_injector.submit')}
          </button>
        </div>
      </label>

      <p className="text-xs uppercase tracking-[0.26em] text-slate-400">
        {lastEvent ? `Latest: ${lastEvent}` : t('event_injector.empty')}
      </p>
    </div>
  )
}
