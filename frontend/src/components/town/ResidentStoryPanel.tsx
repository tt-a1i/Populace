import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  type ResidentMemory,
  type ResidentRelationship,
  generateMemoir,
  getResidentMemories,
  getResidentRelationships,
  injectResidentMemory,
  patchResidentAttributes,
} from '../../services/api'
import { useToast } from '../ui/ToastProvider'

const MOOD_EMOJI: Record<string, string> = {
  happy: '\u{1F60A}',
  excited: '\u{1F60A}',
  ecstatic: '\u{1F929}',
  sad: '\u{1F622}',
  angry: '\u{1F620}',
  fearful: '\u{1F628}',
  tired: '\u{1F634}',
}

const REL_ICON: Record<string, string> = {
  love: '\u{1F495}',
  friendship: '\u{1F91D}',
  rivalry: '\u2694\uFE0F',
  knows: '\u{1F44B}',
  trust: '\u{1F91D}',
  fear: '\u{1F628}',
  dislike: '\u{1F44E}',
}

interface ResidentStoryPanelProps {
  residentId: string
  residents: Array<{
    id: string
    name: string
    mood?: string
    occupation?: string
    coins?: number
    energy?: number
    currentGoal?: string | null
    currentBuildingId?: string | null
  }>
  buildings: Array<{ id: string; name: string; type: string }>
  onClose: () => void
}

function isHeartbeat(content: string): boolean {
  return content.startsWith('Tick ') || content.includes('mood=')
}

function describeActivity(
  currentBuildingId: string | null | undefined,
  buildings: Array<{ id: string; name: string; type: string }>,
  t: (key: string) => string,
): string {
  if (!currentBuildingId) return t('resident_panel.wandering')
  const building = buildings.find((b) => b.id === currentBuildingId)
  if (!building) return t('resident_panel.wandering')
  if (building.type === 'home' || building.type === 'house' || building.type === 'residence')
    return t('resident_panel.at_home')
  return `${t('resident_panel.at_work')} @ ${building.name}`
}

export function ResidentStoryPanel({
  residentId,
  residents,
  buildings,
  onClose,
}: ResidentStoryPanelProps) {
  const { t } = useTranslation()
  const { pushToast } = useToast()

  const [memories, setMemories] = useState<ResidentMemory[]>([])
  const [relationships, setRelationships] = useState<ResidentRelationship[]>([])
  const [memoirBusy, setMemoirBusy] = useState(false)

  const resident = residents.find((r) => r.id === residentId)

  useEffect(() => {
    let cancelled = false

    void getResidentMemories(residentId)
      .then((data) => {
        if (!cancelled) setMemories(data)
      })
      .catch(() => {
        if (!cancelled) setMemories([])
      })

    void getResidentRelationships(residentId)
      .then((data) => {
        if (!cancelled) setRelationships(data)
      })
      .catch(() => {
        if (!cancelled) setRelationships([])
      })

    return () => {
      cancelled = true
    }
  }, [residentId])

  if (!resident) return null

  const moodEmoji = MOOD_EMOJI[resident.mood ?? ''] ?? ''
  const energyPct = Math.round((resident.energy ?? 1.0) * 100)

  const recentEvents = [...memories]
    .filter((m) => !isHeartbeat(m.content))
    .reverse()
    .slice(0, 5)

  const topRelationships = [...relationships]
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 5)

  const activity = describeActivity(resident.currentBuildingId, buildings, t)

  return (
    <div className="flex h-full flex-col overflow-y-auto" data-testid="resident-story-panel">
      {/* ---- Header ---- */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl text-white">
            {resident.name} {moodEmoji}
          </h3>
          {resident.mood && (
            <p className="mt-0.5 text-xs text-slate-400">{resident.mood}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10"
        >
          {t('resident_panel.close')}
        </button>
      </div>

      {/* ---- Status line: occupation + coins + energy ---- */}
      <div className="mt-4 flex items-center gap-3 text-sm text-slate-300">
        {resident.occupation && (
          <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-0.5 text-xs text-sky-200">
            {resident.occupation}
          </span>
        )}
        <span className="text-amber-200">
          {t('resident_panel.coins')}: {resident.coins ?? 0}
        </span>
        <div className="flex flex-1 items-center gap-2">
          <span className="text-xs text-lime-300/70">{t('resident_panel.energy')}</span>
          <div className="h-1.5 flex-1 rounded-full bg-white/10">
            <div
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: `${energyPct}%`,
                backgroundColor:
                  energyPct < 20 ? '#f59e0b' : energyPct < 50 ? '#84cc16' : '#4ade80',
              }}
              data-testid="story-energy-bar"
            />
          </div>
          <span className="text-[10px] text-lime-300/50">{energyPct}%</span>
        </div>
      </div>

      {/* ---- Current goal ---- */}
      {resident.currentGoal && (
        <p className="mt-2 text-xs text-slate-400">
          {t('resident_panel.goal')}: {resident.currentGoal}
        </p>
      )}

      {/* ---- Current activity ---- */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
          {t('resident_panel.now')}
        </p>
        <p className="mt-1 text-sm text-white">{activity}</p>
      </div>

      {/* ---- Recent events ---- */}
      <div className="mt-5">
        <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
          {t('resident_panel.recent')}
        </p>
        <div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
          {recentEvents.length > 0 ? (
            recentEvents.map((mem) => (
              <div
                key={mem.id}
                className="rounded-2xl border border-white/6 bg-slate-900/60 px-3 py-2"
              >
                <span className="text-[10px] text-slate-500">{mem.timestamp}</span>
                <p className="mt-0.5 text-sm leading-relaxed text-slate-300">{mem.content}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">{t('resident_panel.no_recent')}</p>
          )}
        </div>
      </div>

      {/* ---- Relationships ---- */}
      <div className="mt-5">
        <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
          {t('resident_panel.relationships')}
        </p>
        <div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
          {topRelationships.length > 0 ? (
            topRelationships.map((rel) => (
              <div
                key={`${rel.from_id}-${rel.to_id}-${rel.type}`}
                className="flex items-center gap-3 rounded-2xl border border-white/6 bg-slate-900/60 px-3 py-2"
              >
                <span className="text-base">{REL_ICON[rel.type] ?? '\u{1F44B}'}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">
                      {rel.counterpart_name}
                    </span>
                    <span className="text-[10px] text-slate-500">{rel.type}</span>
                  </div>
                  <div className="mt-1 h-1 w-full rounded-full bg-white/10">
                    <div
                      className="h-1 rounded-full bg-cyan-400/70 transition-all duration-300"
                      style={{ width: `${Math.round(rel.intensity * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">{t('resident_panel.no_relationships')}</p>
          )}
        </div>
      </div>

      {/* ---- God actions ---- */}
      <div className="mt-auto pt-5">
        <p className="mb-2 text-[11px] uppercase tracking-[0.28em] text-slate-500">
          {t('resident_panel.god_actions')}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={async () => {
              const moods = ['happy', 'sad', 'angry', 'excited', 'calm']
              const current = resident.mood ?? 'neutral'
              const next = moods[(moods.indexOf(current) + 1) % moods.length]
              try {
                await patchResidentAttributes(residentId, { mood: next })
                pushToast({ type: 'success', title: `${resident.name} → ${next}` })
              } catch { pushToast({ type: 'error', title: 'Failed' }) }
            }}
            className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[11px] font-medium text-amber-200 transition hover:bg-amber-300/20"
          >
            {t('resident_panel.edit_mood')}
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await injectResidentMemory(residentId, { content: `${resident.name}有了一段新的深刻记忆`, importance: 0.8, emotion: 'happy' })
                pushToast({ type: 'success', title: t('resident_panel.inject_memory') + ' \u2713' })
              } catch { pushToast({ type: 'error', title: 'Failed' }) }
            }}
            className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-[11px] font-medium text-cyan-200 transition hover:bg-cyan-300/20"
          >
            {t('resident_panel.inject_memory')}
          </button>
          <button
            type="button"
            disabled={memoirBusy}
            onClick={async () => {
              setMemoirBusy(true)
              try {
                const result = await generateMemoir(residentId)
                pushToast({ type: 'success', title: `${resident.name} — ${t('resident_panel.generate_memoir')}`, description: result.content.slice(0, 80) + '…' })
              } catch { pushToast({ type: 'error', title: t('resident_panel.generate_memoir') + ' \u2717' }) }
              finally { setMemoirBusy(false) }
            }}
            className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-300/20 disabled:opacity-40"
          >
            {memoirBusy ? '...' : t('resident_panel.generate_memoir')}
          </button>
        </div>
      </div>
    </div>
  )
}
