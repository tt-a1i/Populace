import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { injectEvent } from '../../services/api'
import { useSound } from '../../audio'
import { useToast } from '../ui/ToastProvider'

const STORAGE_KEY = 'populace:custom-events'

export interface CustomEventPreset {
  id: string
  name: string
  description: string
  radius: number
  duration: number
  emotion: 'positive' | 'negative' | 'neutral'
  targetX: number | null
  targetY: number | null
}

function loadCustomPresets(): CustomEventPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CustomEventPreset[]) : []
  } catch {
    return []
  }
}

function saveCustomPresets(presets: CustomEventPreset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
}

const EMOTION_OPTIONS: Array<{ value: CustomEventPreset['emotion']; icon: string; labelKey: string }> = [
  { value: 'positive', icon: '\u2728', labelKey: 'event_creator.emotion_positive' },
  { value: 'neutral', icon: '\uD83D\uDE10', labelKey: 'event_creator.emotion_neutral' },
  { value: 'negative', icon: '\u26A0\uFE0F', labelKey: 'event_creator.emotion_negative' },
]

interface EventCreatorProps {
  /** When set, shows a preview radius on the map via TownRenderer.showEventRadii */
  onPreviewRadius?: (x: number, y: number, radius: number) => void
  onClearPreview?: () => void
}

export function EventCreator({ onPreviewRadius, onClearPreview }: EventCreatorProps) {
  const { t } = useTranslation()
  const { pushToast } = useToast()
  const { play } = useSound()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [radius, setRadius] = useState(5)
  const [duration, setDuration] = useState(5)
  const [emotion, setEmotion] = useState<CustomEventPreset['emotion']>('neutral')
  const [targetX, setTargetX] = useState<number | null>(null)
  const [targetY, setTargetY] = useState<number | null>(null)
  const [pickingTarget, setPickingTarget] = useState(false)
  const [busy, setBusy] = useState(false)
  const [savedPresets, setSavedPresets] = useState<CustomEventPreset[]>(loadCustomPresets)

  // Listen for map tile clicks when picking target
  useEffect(() => {
    if (!pickingTarget) return
    const handler = (e: Event) => {
      const { tileX, tileY } = (e as CustomEvent).detail
      setTargetX(tileX)
      setTargetY(tileY)
      setPickingTarget(false)
    }
    window.addEventListener('populace:tile-picked', handler)
    return () => window.removeEventListener('populace:tile-picked', handler)
  }, [pickingTarget])

  // Preview radius on map
  useEffect(() => {
    if (targetX !== null && targetY !== null) {
      onPreviewRadius?.(targetX, targetY, radius)
    }
    return () => onClearPreview?.()
  }, [targetX, targetY, radius, onPreviewRadius, onClearPreview])

  const buildDescription = useCallback(() => {
    const emotionTag = emotion === 'positive' ? '[positive effect]' : emotion === 'negative' ? '[negative effect]' : ''
    const locTag = targetX !== null && targetY !== null ? `at tile (${targetX}, ${targetY})` : ''
    const durTag = `lasting ${duration} ticks`
    const radiusTag = `within ${radius} tiles`
    return `${description} ${emotionTag} ${locTag} ${radiusTag} ${durTag}`.trim()
  }, [description, emotion, targetX, targetY, radius, duration])

  const handleInject = async () => {
    const desc = buildDescription()
    if (!desc) return
    setBusy(true)
    try {
      await injectEvent({ description: desc })
      play('event')
      pushToast({
        type: 'success',
        title: t('director.toast_event_injected'),
        description: name || desc.slice(0, 60),
      })
    } finally {
      setBusy(false)
    }
  }

  const handleSavePreset = () => {
    if (!name.trim() || !description.trim()) return
    const preset: CustomEventPreset = {
      id: `custom_${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      radius,
      duration,
      emotion,
      targetX,
      targetY,
    }
    const updated = [...savedPresets, preset]
    setSavedPresets(updated)
    saveCustomPresets(updated)
    pushToast({ type: 'success', title: t('event_creator.saved'), description: name })
  }

  const handleDeletePreset = (id: string) => {
    const updated = savedPresets.filter((p) => p.id !== id)
    setSavedPresets(updated)
    saveCustomPresets(updated)
  }

  const handleLoadPreset = (preset: CustomEventPreset) => {
    setName(preset.name)
    setDescription(preset.description)
    setRadius(preset.radius)
    setDuration(preset.duration)
    setEmotion(preset.emotion)
    setTargetX(preset.targetX)
    setTargetY(preset.targetY)
  }

  return (
    <div className="grid gap-3">
      {/* Name */}
      <label className="grid gap-1 text-xs text-slate-400">
        {t('event_creator.name')}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('event_creator.name_placeholder')}
          className="panel-input"
        />
      </label>

      {/* Description */}
      <label className="grid gap-1 text-xs text-slate-400">
        {t('event_creator.description')}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('event_creator.desc_placeholder')}
          rows={2}
          className="panel-input resize-none"
        />
      </label>

      {/* Radius + Duration sliders */}
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-xs text-slate-400">
          {t('event_creator.radius')} ({radius})
          <input
            type="range"
            min={1}
            max={10}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="accent-cyan-400"
          />
        </label>
        <label className="grid gap-1 text-xs text-slate-400">
          {t('event_creator.duration')} ({duration} ticks)
          <input
            type="range"
            min={1}
            max={50}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="accent-cyan-400"
          />
        </label>
      </div>

      {/* Target position */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-400">{t('event_creator.target')}:</span>
        {targetX !== null && targetY !== null ? (
          <span className="rounded-md border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-cyan-200">
            ({targetX}, {targetY})
          </span>
        ) : (
          <span className="text-slate-500">{t('event_creator.no_target')}</span>
        )}
        <button
          type="button"
          onClick={() => setPickingTarget(!pickingTarget)}
          className={`rounded-md border px-2 py-0.5 text-[10px] font-medium transition active:scale-95 ${
            pickingTarget
              ? 'border-amber-400/30 bg-amber-400/15 text-amber-200 animate-pulse'
              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          {pickingTarget ? t('event_creator.picking') : t('event_creator.pick_on_map')}
        </button>
      </div>

      {/* Emotion type */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">{t('event_creator.emotion')}:</span>
        {EMOTION_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setEmotion(opt.value)}
            className={`rounded-lg border px-2.5 py-1 text-xs transition active:scale-95 ${
              emotion === opt.value
                ? 'border-cyan-400/30 bg-cyan-400/15 text-cyan-100'
                : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
            }`}
          >
            {opt.icon} {t(opt.labelKey)}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy || !description.trim()}
          onClick={() => void handleInject()}
          className="btn-primary flex-1 rounded-xl px-4 py-2 text-xs font-semibold transition active:scale-95 disabled:opacity-50"
        >
          {busy ? t('event_creator.injecting') : t('event_creator.inject')}
        </button>
        <button
          type="button"
          disabled={!name.trim() || !description.trim()}
          onClick={handleSavePreset}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/10 active:scale-95 disabled:opacity-40"
        >
          {t('event_creator.save_preset')}
        </button>
      </div>

      {/* Saved custom presets */}
      {savedPresets.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
            {t('event_creator.custom_presets')} ({savedPresets.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {savedPresets.map((p) => (
              <div
                key={p.id}
                className="group flex items-center gap-1 rounded-lg border border-violet-400/20 bg-violet-400/8 px-2 py-1"
              >
                <button
                  type="button"
                  onClick={() => handleLoadPreset(p)}
                  className="text-xs text-violet-200 transition hover:text-white"
                  title={p.description}
                >
                  {p.name}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeletePreset(p.id)}
                  className="text-[10px] text-violet-400/50 opacity-0 transition hover:text-rose-300 group-hover:opacity-100"
                  title={t('event_creator.delete')}
                >
                  {'\u2715'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
