import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSound } from '../../audio'
import {
  type ActiveEvent,
  type PresetEvent,
  getActiveEvents,
  getPresetEvents,
  injectEvent,
  injectPresetEvent,
} from '../../services/api'
import { useToast } from '../ui/ToastProvider'

// Static icon + colour map for known preset IDs
const PRESET_META: Record<string, { icon: string; color: string }> = {
  storm:             { icon: '⛈️',  color: 'border-blue-400/30 bg-blue-400/10 text-blue-100 hover:bg-blue-400/20' },
  lost_wallet:       { icon: '👛',  color: 'border-yellow-400/30 bg-yellow-400/10 text-yellow-100 hover:bg-yellow-400/20' },
  love_letter:       { icon: '💌',  color: 'border-pink-400/30 bg-pink-400/10 text-pink-100 hover:bg-pink-400/20' },
  free_cake:         { icon: '🎂',  color: 'border-orange-400/30 bg-orange-400/10 text-orange-100 hover:bg-orange-400/20' },
  stranger:          { icon: '🕵️', color: 'border-violet-400/30 bg-violet-400/10 text-violet-100 hover:bg-violet-400/20' },
  power_outage:      { icon: '⚡',  color: 'border-amber-400/30 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20' },
  street_performance:{ icon: '🎭',  color: 'border-teal-400/30 bg-teal-400/10 text-teal-100 hover:bg-teal-400/20' },
}

const DEFAULT_META = { icon: '⚡', color: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-50 hover:bg-cyan-300/20' }

export function EventInjector() {
  const { t } = useTranslation()
  const { pushToast } = useToast()
  const { play } = useSound()
  const [customEvent, setCustomEvent] = useState('')
  const [lastEvent, setLastEvent] = useState('')
  const [busy, setBusy] = useState(false)
  const [flashBorder, setFlashBorder] = useState(false)
  const [presets, setPresets] = useState<PresetEvent[]>([])
  const [activeEvents, setActiveEvents] = useState<ActiveEvent[]>([])

  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const canSubmitCustom = useMemo(() => customEvent.trim().length > 0, [customEvent])

  useEffect(() => {
    return () => { clearTimeout(flashTimerRef.current) }
  }, [])

  // Load presets once on mount
  useEffect(() => {
    getPresetEvents()
      .then((data) => setPresets(data as PresetEvent[]))
      .catch(() => {/* backend may not be running */})
  }, [])

  // Poll active events every 3 s
  useEffect(() => {
    const poll = () => {
      getActiveEvents()
        .then((data) => setActiveEvents(data as ActiveEvent[]))
        .catch(() => setActiveEvents([]))
    }
    poll()
    const id = setInterval(poll, 3000)
    return () => clearInterval(id)
  }, [])

  const handlePreset = async (presetId: string, presetName: string) => {
    setBusy(true)
    try {
      await injectPresetEvent(presetId)
      setLastEvent(presetName)
      setFlashBorder(true)
      clearTimeout(flashTimerRef.current)
      flashTimerRef.current = setTimeout(() => setFlashBorder(false), 600)
      play('event')
      pushToast({
        type: 'success',
        title: '事件已投放',
        description: `预设事件「${presetName}」已进入当前回合。`,
      })
    } finally {
      setBusy(false)
    }
  }

  const handleCustom = async () => {
    const desc = customEvent.trim()
    if (!desc) return
    setBusy(true)
    try {
      await injectEvent({ description: desc })
      setLastEvent(desc)
      setCustomEvent('')
      setFlashBorder(true)
      clearTimeout(flashTimerRef.current)
      flashTimerRef.current = setTimeout(() => setFlashBorder(false), 600)
      play('event')
      pushToast({
        type: 'success',
        title: '事件已投放',
        description: desc,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={[
      'grid gap-4 rounded-[24px] border p-4 text-slate-100 transition-all duration-300',
      flashBorder
        ? 'border-cyan-400/50 bg-slate-950/70 shadow-[0_0_24px_rgba(34,211,238,0.12),0_18px_44px_rgba(15,23,42,0.35)]'
        : 'border-white/10 bg-slate-950/70 shadow-[0_18px_44px_rgba(15,23,42,0.35)]',
    ].join(' ')}>
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-200/70">{t('event_injector.badge')}</p>
        <h3 className="mt-2 font-display text-2xl text-white">{t('event_injector.title')}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t('event_injector.desc')}</p>
      </div>

      {/* ── Preset event cards ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {presets.map((preset) => {
          const meta = PRESET_META[preset.id] ?? DEFAULT_META
          const isMultiTick = preset.duration > 1
          return (
            <button
              key={preset.id}
              type="button"
              disabled={busy}
              title={preset.description}
              onClick={() => void handlePreset(preset.id, preset.name)}
              className={[
                'group flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition disabled:opacity-60',
                meta.color,
              ].join(' ')}
            >
              <span className="text-xl">{meta.icon}</span>
              <span className="text-xs font-semibold leading-tight">{preset.name}</span>
              {isMultiTick && (
                <span className="rounded-full border border-white/15 bg-white/10 px-1.5 py-0.5 text-[9px] font-medium text-white/70">
                  {preset.duration} ticks
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Active events countdown ── */}
      {activeEvents.length > 0 && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/8 p-3">
          <p className="mb-2 text-[10px] uppercase tracking-[0.3em] text-amber-300/70">进行中的事件</p>
          <div className="flex flex-col gap-1.5">
            {activeEvents.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between gap-2">
                <span className="text-xs text-amber-100">{ev.name}</span>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-amber-900/40">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all"
                      style={{ width: `${Math.min(100, ev.remaining_ticks * 12.5)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-[10px] text-amber-300/60">
                    {ev.remaining_ticks} tick{ev.remaining_ticks !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Custom event input ── */}
      <label className="grid gap-2 text-sm text-slate-300">
        {t('event_injector.custom_label')}
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={customEvent}
            onChange={(e) => setCustomEvent(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleCustom()}
            placeholder={t('event_injector.custom_placeholder')}
            className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-50 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40 focus:bg-white/10"
          />
          <button
            type="button"
            disabled={!canSubmitCustom || busy}
            onClick={() => void handleCustom()}
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
