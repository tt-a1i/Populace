import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSound } from '../../audio'
import {
  type ActiveEvent,
  type ApiResident,
  type PresetEvent,
  forceEncounter,
  getActiveEvents,
  getPresetEvents,
  getResidents,
  injectEmotion,
  injectEvent,
  injectPresetEvent,
  spreadRumor,
  triggerJealousy,
} from '../../services/api'
import { useToast } from '../ui/ToastProvider'

// ── Preset meta (reused from EventInjector) ─────────────────────────────
const PRESET_META: Record<string, { icon: string; color: string }> = {
  storm: { icon: '\u26C8\uFE0F', color: 'border-blue-400/30 bg-blue-400/10 text-blue-100 hover:bg-blue-400/20' },
  lost_wallet: { icon: '\uD83D\uDC5B', color: 'border-yellow-400/30 bg-yellow-400/10 text-yellow-100 hover:bg-yellow-400/20' },
  love_letter: { icon: '\uD83D\uDC8C', color: 'border-pink-400/30 bg-pink-400/10 text-pink-100 hover:bg-pink-400/20' },
  free_cake: { icon: '\uD83C\uDF82', color: 'border-orange-400/30 bg-orange-400/10 text-orange-100 hover:bg-orange-400/20' },
  stranger: { icon: '\uD83D\uDD75\uFE0F', color: 'border-violet-400/30 bg-violet-400/10 text-violet-100 hover:bg-violet-400/20' },
  power_outage: { icon: '\u26A1', color: 'border-amber-400/30 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20' },
  street_performance: { icon: '\uD83C\uDFAD', color: 'border-teal-400/30 bg-teal-400/10 text-teal-100 hover:bg-teal-400/20' },
}
const DEFAULT_META = { icon: '\u26A1', color: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-50 hover:bg-cyan-300/20' }

type TabKey = 'scene' | 'emotion' | 'relationship' | 'events'

const EMOTIONS: Array<{ key: string; icon: string; label: string }> = [
  { key: 'happy', icon: '\uD83D\uDE0A', label: '\u5F00\u5FC3' },
  { key: 'sad', icon: '\uD83D\uDE22', label: '\u96BE\u8FC7' },
  { key: 'angry', icon: '\uD83D\uDE20', label: '\u6124\u6012' },
  { key: 'fearful', icon: '\uD83D\uDE28', label: '\u6050\u60E7' },
  { key: 'excited', icon: '\uD83E\uDD29', label: '\u5174\u596B' },
]

export function DirectorConsole() {
  const { t } = useTranslation()
  const { pushToast } = useToast()
  const { play } = useSound()

  const [activeTab, setActiveTab] = useState<TabKey>('scene')
  const [busy, setBusy] = useState(false)

  // ── Shared state ───────────────────────────────────────────────────────
  const [residents, setResidents] = useState<ApiResident[]>([])

  // ── Scene tab state ────────────────────────────────────────────────────
  const [customEvent, setCustomEvent] = useState('')
  const [lastEvent, setLastEvent] = useState('')
  const [flashBorder, setFlashBorder] = useState(false)
  const [presets, setPresets] = useState<PresetEvent[]>([])
  const [activeEvents, setActiveEvents] = useState<ActiveEvent[]>([])
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // ── Emotion tab state ──────────────────────────────────────────────────
  const [emotionResidentId, setEmotionResidentId] = useState('')
  const [selectedEmotion, setSelectedEmotion] = useState('')
  const [emotionReason, setEmotionReason] = useState('')

  // ── Relationship tab state ─────────────────────────────────────────────
  const [residentAId, setResidentAId] = useState('')
  const [residentBId, setResidentBId] = useState('')
  const [rumorContent, setRumorContent] = useState('')
  const [rumorPositive, setRumorPositive] = useState(false)
  const [relationAction, setRelationAction] = useState<'encounter' | 'rumor' | 'jealousy' | null>(null)

  const canSubmitCustom = useMemo(() => customEvent.trim().length > 0, [customEvent])

  // ── Load residents ─────────────────────────────────────────────────────
  useEffect(() => {
    getResidents()
      .then((data) => setResidents(data as ApiResident[]))
      .catch(() => {})
  }, [])

  // ── Load presets ───────────────────────────────────────────────────────
  useEffect(() => {
    getPresetEvents()
      .then((data) => setPresets(data as PresetEvent[]))
      .catch(() => {})
  }, [])

  // ── Poll active events ─────────────────────────────────────────────────
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

  useEffect(() => {
    return () => { clearTimeout(flashTimerRef.current) }
  }, [])

  // ── Scene tab handlers ─────────────────────────────────────────────────
  const flashSuccess = () => {
    setFlashBorder(true)
    clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlashBorder(false), 600)
    play('event')
  }

  const handlePreset = async (presetId: string, presetName: string) => {
    setBusy(true)
    try {
      await injectPresetEvent(presetId)
      setLastEvent(presetName)
      flashSuccess()
      pushToast({ type: 'success', title: '\u4E8B\u4EF6\u5DF2\u6295\u653E', description: `\u9884\u8BBE\u4E8B\u4EF6\u300C${presetName}\u300D\u5DF2\u8FDB\u5165\u5F53\u524D\u56DE\u5408\u3002` })
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
      flashSuccess()
      pushToast({ type: 'success', title: '\u4E8B\u4EF6\u5DF2\u6295\u653E', description: desc })
    } finally {
      setBusy(false)
    }
  }

  // ── Emotion tab handler ────────────────────────────────────────────────
  const handleInjectEmotion = async () => {
    if (!emotionResidentId || !selectedEmotion) return
    setBusy(true)
    try {
      const result = await injectEmotion(emotionResidentId, selectedEmotion, emotionReason)
      flashSuccess()
      const emotionLabel = EMOTIONS.find((e) => e.key === selectedEmotion)?.label ?? selectedEmotion
      pushToast({
        type: 'success',
        title: '\u2713 ' + t('director.feedback_emotion', { name: result.name, emotion: emotionLabel }),
        description: '',
      })
      setEmotionReason('')
    } finally {
      setBusy(false)
    }
  }

  // ── Relationship tab handlers ──────────────────────────────────────────
  const handleForceEncounter = async () => {
    if (!residentAId || !residentBId) return
    setBusy(true)
    try {
      const result = await forceEncounter(residentAId, residentBId)
      flashSuccess()
      const nameA = residents.find((r) => r.id === residentAId)?.name ?? ''
      const nameB = residents.find((r) => r.id === residentBId)?.name ?? ''
      pushToast({
        type: 'success',
        title: '\u2713 ' + t('director.feedback_encounter', { a: nameA, b: nameB, location: result.location }),
        description: '',
      })
    } finally {
      setBusy(false)
    }
  }

  const handleSpreadRumor = async () => {
    if (!residentAId || !residentBId || !rumorContent.trim()) return
    setBusy(true)
    try {
      await spreadRumor(residentAId, residentBId, rumorContent.trim(), rumorPositive)
      flashSuccess()
      const targetName = residents.find((r) => r.id === residentAId)?.name ?? ''
      pushToast({
        type: 'success',
        title: '\u2713 ' + t('director.feedback_rumor', { name: targetName }),
        description: '',
      })
      setRumorContent('')
    } finally {
      setBusy(false)
    }
  }

  const handleTriggerJealousy = async () => {
    if (!residentAId || !residentBId) return
    setBusy(true)
    try {
      await triggerJealousy(residentAId, residentBId)
      flashSuccess()
      const name = residents.find((r) => r.id === residentAId)?.name ?? ''
      const rivalName = residents.find((r) => r.id === residentBId)?.name ?? ''
      pushToast({
        type: 'success',
        title: '\u2713 ' + t('director.feedback_jealousy', { name, rival: rivalName }),
        description: '',
      })
    } finally {
      setBusy(false)
    }
  }

  // ── Tab definitions ────────────────────────────────────────────────────
  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'scene', label: t('director.tab_scene') },
    { key: 'emotion', label: t('director.tab_emotion') },
    { key: 'relationship', label: t('director.tab_relationship') },
    { key: 'events', label: t('director.tab_events') },
  ]

  // ── Resident selector helper ───────────────────────────────────────────
  const ResidentSelect = ({
    value,
    onChange,
    label,
    excludeId,
  }: {
    value: string
    onChange: (v: string) => void
    label: string
    excludeId?: string
  }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300/40"
    >
      <option value="">{label}</option>
      {residents
        .filter((r) => r.id !== excludeId)
        .map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
    </select>
  )

  return (
    <div
      className={[
        'grid gap-4 rounded-xl border p-4 text-slate-100 transition-all duration-300',
        flashBorder
          ? 'border-cyan-400/50 bg-slate-950/70 shadow-[0_0_24px_rgba(34,211,238,0.12),0_18px_44px_rgba(15,23,42,0.35)]'
          : 'border-white/10 bg-slate-950/70 ',
      ].join(' ')}
    >
      {/* ── Header ── */}
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-200/70">{t('director.badge')}</p>
        <h3 className="mt-2 font-display text-2xl text-white">
          {'\uD83C\uDFAC'} {t('director.title')}
        </h3>
        <p className="mt-1 text-sm leading-6 text-slate-400">{t('director.subtitle')}</p>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={[
              'flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition',
              activeTab === tab.key
                ? 'bg-cyan-400/15 text-cyan-50'
                : 'text-slate-400 hover:text-slate-200',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Scene ── */}
      {activeTab === 'scene' && (
        <div className="grid gap-4">
          {/* Preset event cards */}
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

          {/* Active events countdown */}
          {activeEvents.length > 0 && (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/8 p-3">
              <p className="mb-2 text-[10px] uppercase tracking-[0.3em] text-amber-300/70">{'\u8FDB\u884C\u4E2D\u7684\u4E8B\u4EF6'}</p>
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

          {/* Custom event input */}
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
      )}

      {/* ── Tab: Emotion ── */}
      {activeTab === 'emotion' && (
        <div className="grid gap-4">
          <ResidentSelect
            value={emotionResidentId}
            onChange={setEmotionResidentId}
            label={t('director.select_resident')}
          />

          {/* Emotion button grid */}
          <div className="grid grid-cols-5 gap-2">
            {EMOTIONS.map((em) => (
              <button
                key={em.key}
                type="button"
                onClick={() => setSelectedEmotion(em.key)}
                className={[
                  'flex flex-col items-center gap-1 rounded-xl border p-3 transition',
                  selectedEmotion === em.key
                    ? 'border-cyan-300/40 bg-cyan-300/15 text-cyan-50'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
                ].join(' ')}
              >
                <span className="text-2xl">{em.icon}</span>
                <span className="text-[11px] font-medium">{em.label}</span>
              </button>
            ))}
          </div>

          {/* Optional reason */}
          <input
            value={emotionReason}
            onChange={(e) => setEmotionReason(e.target.value)}
            placeholder={t('director.reason_placeholder')}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40"
          />

          <button
            type="button"
            disabled={!emotionResidentId || !selectedEmotion || busy}
            onClick={() => void handleInjectEmotion()}
            className="rounded-2xl border border-cyan-300/30 bg-cyan-300/15 px-5 py-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/25 disabled:opacity-50"
          >
            {t('director.inject_emotion')}
          </button>
        </div>
      )}

      {/* ── Tab: Relationship ── */}
      {activeTab === 'relationship' && (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2">
            <ResidentSelect
              value={residentAId}
              onChange={setResidentAId}
              label={t('director.select_resident_a')}
              excludeId={residentBId}
            />
            <ResidentSelect
              value={residentBId}
              onChange={setResidentBId}
              label={t('director.select_resident_b')}
              excludeId={residentAId}
            />
          </div>

          {/* Action cards */}
          <div className="grid gap-2 sm:grid-cols-3">
            {/* Arrange Encounter */}
            <button
              type="button"
              onClick={() => setRelationAction('encounter')}
              className={[
                'flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition',
                relationAction === 'encounter'
                  ? 'border-pink-300/40 bg-pink-300/15 text-pink-50'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
              ].join(' ')}
            >
              <span className="text-xl">{'\uD83D\uDC95'}</span>
              <span className="text-xs font-semibold">{t('director.arrange_encounter')}</span>
              <span className="text-[10px] text-slate-400">{t('director.arrange_encounter_desc')}</span>
            </button>

            {/* Spread Rumor */}
            <button
              type="button"
              onClick={() => setRelationAction('rumor')}
              className={[
                'flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition',
                relationAction === 'rumor'
                  ? 'border-amber-300/40 bg-amber-300/15 text-amber-50'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
              ].join(' ')}
            >
              <span className="text-xl">{'\uD83D\uDDE3\uFE0F'}</span>
              <span className="text-xs font-semibold">{t('director.spread_rumor')}</span>
              <span className="text-[10px] text-slate-400">{t('director.spread_rumor_desc')}</span>
            </button>

            {/* Trigger Jealousy */}
            <button
              type="button"
              onClick={() => setRelationAction('jealousy')}
              className={[
                'flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition',
                relationAction === 'jealousy'
                  ? 'border-red-300/40 bg-red-300/15 text-red-50'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
              ].join(' ')}
            >
              <span className="text-xl">{'\uD83D\uDE24'}</span>
              <span className="text-xs font-semibold">{t('director.trigger_jealousy')}</span>
              <span className="text-[10px] text-slate-400">{t('director.trigger_jealousy_desc')}</span>
            </button>
          </div>

          {/* Action-specific UI */}
          {relationAction === 'encounter' && (
            <button
              type="button"
              disabled={!residentAId || !residentBId || busy}
              onClick={() => void handleForceEncounter()}
              className="rounded-2xl border border-pink-300/30 bg-pink-300/15 px-5 py-3 text-sm font-medium text-pink-50 transition hover:bg-pink-300/25 disabled:opacity-50"
            >
              {t('director.arrange_encounter')}
            </button>
          )}

          {relationAction === 'rumor' && (
            <div className="grid gap-2">
              <input
                value={rumorContent}
                onChange={(e) => setRumorContent(e.target.value)}
                placeholder={t('director.rumor_placeholder')}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40"
              />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-300">
                  <input
                    type="radio"
                    name="rumor-tone"
                    checked={rumorPositive}
                    onChange={() => setRumorPositive(true)}
                    className="accent-emerald-400"
                  />
                  {t('director.rumor_positive')}
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-300">
                  <input
                    type="radio"
                    name="rumor-tone"
                    checked={!rumorPositive}
                    onChange={() => setRumorPositive(false)}
                    className="accent-red-400"
                  />
                  {t('director.rumor_negative')}
                </label>
              </div>
              <button
                type="button"
                disabled={!residentAId || !residentBId || !rumorContent.trim() || busy}
                onClick={() => void handleSpreadRumor()}
                className="rounded-2xl border border-amber-300/30 bg-amber-300/15 px-5 py-3 text-sm font-medium text-amber-50 transition hover:bg-amber-300/25 disabled:opacity-50"
              >
                {t('director.spread_rumor')}
              </button>
            </div>
          )}

          {relationAction === 'jealousy' && (
            <button
              type="button"
              disabled={!residentAId || !residentBId || busy}
              onClick={() => void handleTriggerJealousy()}
              className="rounded-2xl border border-red-300/30 bg-red-300/15 px-5 py-3 text-sm font-medium text-red-50 transition hover:bg-red-300/25 disabled:opacity-50"
            >
              {t('director.trigger_jealousy')}
            </button>
          )}
        </div>
      )}

      {/* ── Tab: Events (condensed preset grid) ── */}
      {activeTab === 'events' && (
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
      )}
    </div>
  )
}
