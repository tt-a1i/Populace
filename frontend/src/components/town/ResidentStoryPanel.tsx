import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSimulationStore } from '../../stores/simulation'

import {
  type Item,
  type ResidentMemory,
  type ResidentMoodLogEntry,
  type ResidentRelationship,
  generateMemoir,
  getResidentMemories,
  getResidentMoodLog,
  getResidentRelationships,
  getResidentSkills,
  injectResidentMemory,
  patchResidentAttributes,
  tradeResidentItem,
} from '../../services/api'
import { generateResidentAvatarDataUrl } from '../../lib/residentAvatar'
import { useToast } from '../ui/ToastProvider'
import { ChatPanel } from './ChatPanel'
import { FamilyTreePanel } from './FamilyTreePanel'
import { SchedulePanel } from './SchedulePanel'

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

const REL_BADGE_CLASS: Record<string, string> = {
  love: 'border-pink-400/30 bg-pink-400/10 text-pink-200',
  friendship: 'border-green-400/30 bg-green-400/10 text-green-200',
  rivalry: 'border-red-400/30 bg-red-400/10 text-red-200',
  knows: 'border-slate-400/30 bg-slate-400/10 text-slate-300',
  trust: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  fear: 'border-purple-400/30 bg-purple-400/10 text-purple-200',
  dislike: 'border-orange-400/30 bg-orange-400/10 text-orange-200',
}

const REL_BAR_COLOR: Record<string, string> = {
  love: '#f472b6',
  friendship: '#4ade80',
  rivalry: '#ef4444',
  knows: '#94a3b8',
  trust: '#38bdf8',
  fear: '#a78bfa',
  dislike: '#f97316',
}

type TabKey =
  | 'memories'
  | 'diary'
  | 'relations'
  | 'skills'
  | 'mood_log'
  | 'backpack'
  | 'family'
  | 'achievements'
  | 'schedule'

const MOCK_ACHIEVEMENTS = [
  { id: 'first_friend', icon: '\u{1F91D}', label: '\u521D\u8BC6', unlocked: true },
  { id: 'explorer', icon: '\u{1F9ED}', label: '\u63A2\u7D22\u8005', unlocked: true },
  { id: 'wealthy', icon: '\u{1F4B0}', label: '\u5BCC\u6709', unlocked: false },
  { id: 'beloved', icon: '\u{1F495}', label: '\u53D7\u7231\u6234', unlocked: false },
  { id: 'wise', icon: '\u{1F989}', label: '\u667A\u8005', unlocked: true },
  { id: 'storyteller', icon: '\u{1F4D6}', label: '\u8BB2\u8FF0\u8005', unlocked: false },
]

interface ResidentStoryPanelProps {
  residentId: string
  residents: Array<{
    id: string
    name: string
    mood?: string
    personality?: string
    occupation?: string
    coins?: number
    skills?: Record<string, number>
    inventory?: Item[]
    energy?: number
    currentGoal?: string | null
    currentBuildingId?: string | null
    skinColor?: string | null
    hairStyle?: string | null
    hairColor?: string | null
    outfitColor?: string | null
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

function skillLevelLabel(level: number, t: (key: string) => string): string {
  if (level >= 0.8) return t('resident_panel.skill_level_expert')
  if (level >= 0.55) return t('resident_panel.skill_level_skilled')
  if (level >= 0.3) return t('resident_panel.skill_level_learning')
  return t('resident_panel.skill_level_novice')
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
  const [skills, setSkills] = useState<Record<string, number>>({})
  const [moodLog, setMoodLog] = useState<ResidentMoodLogEntry[]>([])
  const [memoirBusy, setMemoirBusy] = useState(false)
  const [tradeBusy, setTradeBusy] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('memories')

  const resident = residents.find((r) => r.id === residentId)
  const tabs = useMemo(
    () => [
      { key: 'memories' as const, label: t('resident_panel.tab_memories') },
      { key: 'diary' as const, label: t('resident_panel.tab_diary') },
      { key: 'relations' as const, label: t('resident_panel.tab_relations') },
      { key: 'skills' as const, label: t('resident_panel.tab_skills') },
      { key: 'mood_log' as const, label: t('resident_panel.tab_mood_log', 'Mood Log') },
      { key: 'backpack' as const, label: t('resident_panel.tab_backpack', 'Backpack') },
      { key: 'schedule' as const, label: t('resident_panel.tab_schedule') },
      { key: 'family' as const, label: t('resident_panel.tab_family') },
      { key: 'achievements' as const, label: t('resident_panel.tab_achievements') },
    ],
    [t],
  )

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

    void getResidentSkills(residentId)
      .then((data) => {
        if (!cancelled) setSkills(data.skills ?? {})
      })
      .catch(() => {
        if (!cancelled) setSkills(resident?.skills ?? {})
      })

    void getResidentMoodLog(residentId)
      .then((data) => {
        if (!cancelled) setMoodLog(data)
      })
      .catch(() => {
        if (!cancelled) setMoodLog([])
      })

    return () => {
      cancelled = true
    }
  }, [residentId, resident?.skills])

  if (!resident) return null

  if (showChat) {
    return (
      <ChatPanel
        residentId={residentId}
        resident={resident}
        onClose={() => setShowChat(false)}
      />
    )
  }

  const moodEmoji = MOOD_EMOJI[resident.mood ?? ''] ?? ''
  const energyPct = Math.round((resident.energy ?? 1.0) * 100)

  const recentEvents = [...memories]
    .filter((m) => !isHeartbeat(m.content))
    .reverse()
    .slice(0, 8)

  const topRelationships = [...relationships]
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 8)
  const sortedSkills = Object.entries(skills)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
  const inventoryItems = resident.inventory ?? []

  const activity = describeActivity(resident.currentBuildingId, buildings, t)

  return (
    <div className="flex h-full flex-col overflow-y-auto" data-testid="resident-story-panel">
      {/* ---- Header: large avatar + name + badge + mood ---- */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <img
              src={generateResidentAvatarDataUrl(resident)}
              alt={`${resident.name} avatar`}
              className="h-16 w-16 rounded-2xl border-2 border-white/10 bg-slate-900/70 object-cover shadow-lg"
            />
            {moodEmoji && (
              <span className="absolute -bottom-1 -right-1 text-lg drop-shadow">{moodEmoji}</span>
            )}
          </div>
          <div className="pt-1">
            <h3 className="font-display text-2xl text-white">{resident.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {resident.occupation && (
                <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-200">
                  {resident.occupation}
                </span>
              )}
              {resident.mood && (
                <span className="text-[11px] text-slate-400">{resident.mood}</span>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('resident_panel.close')}
          className="btn-micro rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition duration-200 hover:bg-white/10 active:scale-95"
        >
          {t('resident_panel.close')}
        </button>
      </div>

      {/* ---- Status bars: energy + coins ---- */}
      <div className="mt-4 flex items-center gap-4">
        <div className="flex flex-1 items-center gap-2">
          <span className="text-xs text-lime-300/70">{t('resident_panel.energy')}</span>
          <div className="h-1.5 flex-1 rounded-full bg-white/10">
            <div
              className="h-1.5 rounded-full transition-all duration-500"
              style={{
                width: `${energyPct}%`,
                backgroundColor:
                  energyPct < 20 ? '#f59e0b' : energyPct < 50 ? '#84cc16' : '#4ade80',
              }}
              data-testid="story-energy-bar"
            />
          </div>
          <span className="text-[10px] tabular-nums text-lime-300/50">{energyPct}%</span>
        </div>
        <div className="flex items-center gap-1.5 text-amber-200">
          <span className="text-[11px]">{t('resident_panel.coins')}</span>
          <span className="text-sm tabular-nums font-medium">{resident.coins ?? 0}</span>
        </div>
      </div>

      {/* ---- Current activity ---- */}
      <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
        <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
          {t('resident_panel.now')}
        </p>
        <p className="mt-0.5 text-sm text-white">{activity}</p>
      </div>

      {/* ---- Current goal ---- */}
      {resident.currentGoal && (
        <p className="mt-2 text-xs text-slate-400">
          {t('resident_panel.goal')}: {resident.currentGoal}
        </p>
      )}

      {/* ---- Pill tabs ---- */}
      <div className="mt-4 flex gap-1.5" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`btn-micro rounded-full px-3 py-1 text-[11px] font-medium transition duration-200 ${
              activeTab === tab.key
                ? 'theme-accent-button-active'
                : 'border border-white/8 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ---- Tab content (all rendered, inactive hidden) ---- */}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {/* Memories — timeline style */}
        <div className={activeTab === 'memories' ? '' : 'hidden'}>
          <div className="relative pl-5">
            <div className="absolute left-[7px] top-1 bottom-1 w-px bg-white/10" />
            {recentEvents.length > 0 ? (
              <div className="space-y-3">
                {recentEvents.map((mem) => (
                  <div key={mem.id} className="relative">
                    <div className="absolute -left-5 top-2.5 h-2 w-2 rounded-full border-2 border-slate-500 bg-slate-800" />
                    <div className="rounded-xl border border-white/6 bg-slate-900/50 px-3 py-2">
                      <span className="text-[10px] text-slate-500">{mem.timestamp}</span>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-slate-300">
                        {mem.content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{t('resident_panel.no_recent')}</p>
            )}
          </div>
        </div>

        {/* Diary — placeholder */}
        <div className={activeTab === 'diary' ? '' : 'hidden'}>
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-slate-500">{'\u6682\u65E0\u65E5\u8BB0\u6761\u76EE'}</p>
          </div>
        </div>

        {/* Relations — colored badges + intensity bars */}
        <div className={activeTab === 'relations' ? '' : 'hidden'}>
          {topRelationships.length > 0 ? (
            <div className="space-y-2">
              {topRelationships.map((rel) => (
                <div
                  key={`${rel.from_id}-${rel.to_id}-${rel.type}`}
                  className="rounded-xl border border-white/6 bg-slate-900/50 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{REL_ICON[rel.type] ?? '\u{1F44B}'}</span>
                      <span className="text-sm font-medium text-white">
                        {rel.counterpart_name}
                      </span>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${REL_BADGE_CLASS[rel.type] ?? 'border-slate-400/30 bg-slate-400/10 text-slate-300'}`}
                    >
                      {rel.type}
                    </span>
                  </div>
                  <div className="mt-2 h-1 w-full rounded-full bg-white/10">
                    <div
                      className="h-1 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.round(rel.intensity * 100)}%`,
                        backgroundColor: REL_BAR_COLOR[rel.type] ?? '#94a3b8',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t('resident_panel.no_relationships')}</p>
          )}
        </div>

        <div className={activeTab === 'skills' ? '' : 'hidden'}>
          {sortedSkills.length > 0 ? (
            <div className="space-y-2">
              {sortedSkills.map(([skillName, value]) => {
                const pct = Math.round(value * 100)
                return (
                  <div
                    key={skillName}
                    className="rounded-xl border border-white/6 bg-slate-900/50 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium capitalize text-white">{skillName}</span>
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
                        {skillLevelLabel(value, t)}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-white/10">
                      <div
                        className="h-1.5 rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-lime-300 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] tabular-nums text-slate-400">{pct}%</p>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t('resident_panel.no_skills')}</p>
          )}
        </div>

        <div className={activeTab === 'mood_log' ? '' : 'hidden'}>
          {moodLog.length > 0 ? (
            <div className="space-y-2">
              {moodLog.map((entry) => (
                <div
                  key={`${entry.tick}-${entry.mood}-${entry.cause}`}
                  className="rounded-xl border border-white/6 bg-slate-900/50 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-white">{entry.mood}</span>
                    <span className="text-[10px] text-slate-500">#{entry.tick}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-300">{entry.cause}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t('resident_panel.no_mood_log', 'No mood log yet')}</p>
          )}
        </div>

        <div className={activeTab === 'backpack' ? '' : 'hidden'}>
          {inventoryItems.length > 0 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {inventoryItems.map((item) => (
                  <div
                    key={`${item.name}-${item.value}`}
                    className="rounded-xl border border-white/6 bg-slate-900/50 px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium capitalize text-white">{item.name}</span>
                      <span className="text-[10px] text-slate-400">x{item.quantity}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-amber-200">
                      {t('resident_panel.item_value', 'Value')}: {item.value}
                    </p>
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={tradeBusy}
                onClick={async () => {
                  const tradeItem = inventoryItems.find((item) => item.quantity > 0)
                  const buyer = residents.find((candidate) => candidate.id !== residentId)
                  if (!tradeItem || !buyer) {
                    pushToast({ type: 'error', title: t('resident_panel.trade_unavailable', 'Trade unavailable') })
                    return
                  }
                  setTradeBusy(true)
                  try {
                    const result = await tradeResidentItem(residentId, {
                      buyer_id: buyer.id,
                      item_name: tradeItem.name,
                      quantity: 1,
                    })
                    pushToast({
                      type: 'success',
                      title: t('resident_panel.trade_success', 'Trade completed'),
                      description: `${tradeItem.name} → ${buyer.name} (+${result.total_price})`,
                    })
                  } catch {
                    pushToast({ type: 'error', title: t('resident_panel.trade_failed', 'Trade failed') })
                  } finally {
                    setTradeBusy(false)
                  }
                }}
                className="btn-micro rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm font-medium text-emerald-200 transition duration-200 hover:bg-emerald-300/20 active:scale-95 disabled:opacity-40"
              >
                {t('resident_panel.trade', 'Trade')}
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t('resident_panel.no_inventory', 'Backpack is empty')}</p>
          )}
        </div>

        {/* Schedule */}
        <div className={activeTab === 'schedule' ? '' : 'hidden'}>
          <ScheduleTabContent
            residentId={residentId}
            residents={residents}
          />
        </div>

        {/* Family tree */}
        <div className={activeTab === 'family' ? '' : 'hidden'}>
          <FamilyTreePanel residentId={residentId} />
        </div>

        {/* Achievements — 2x3 grid */}
        <div className={activeTab === 'achievements' ? '' : 'hidden'}>
          <div className="grid grid-cols-3 gap-2">
            {MOCK_ACHIEVEMENTS.map((ach) => (
              <div
                key={ach.id}
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition duration-300 ${
                  ach.unlocked
                    ? 'border-amber-400/20 bg-amber-400/5'
                    : 'border-white/6 bg-white/[0.02] opacity-40'
                }`}
                style={
                  ach.unlocked
                    ? { animation: 'achievementShine 2s ease-in-out infinite' }
                    : undefined
                }
              >
                <span className="text-xl">{ach.unlocked ? ach.icon : '\u{1F512}'}</span>
                <span
                  className={`text-[10px] font-medium ${ach.unlocked ? 'text-amber-200' : 'text-slate-500'}`}
                >
                  {ach.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---- God actions: icon buttons with tooltips ---- */}
      <div className="mt-auto pt-4">
        <p className="mb-2 text-[11px] uppercase tracking-[0.28em] text-slate-500">
          {t('resident_panel.god_actions')}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            title={t('resident_panel.edit_mood')}
            aria-label={t('resident_panel.edit_mood')}
            onClick={async () => {
              const moods = ['happy', 'sad', 'angry', 'excited', 'calm']
              const current = resident.mood ?? 'neutral'
              const next = moods[(moods.indexOf(current) + 1) % moods.length]
              try {
                await patchResidentAttributes(residentId, { mood: next })
                pushToast({ type: 'success', title: `${resident.name} \u2192 ${next}` })
              } catch {
                pushToast({ type: 'error', title: t('resident_panel.memory_failed') })
              }
            }}
            className="btn-micro flex h-9 w-9 items-center justify-center rounded-xl border border-amber-300/30 bg-amber-300/10 text-amber-200 transition duration-200 hover:bg-amber-300/20 active:scale-95"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
            </svg>
          </button>
          <button
            type="button"
            title={t('resident_panel.inject_memory')}
            aria-label={t('resident_panel.inject_memory')}
            onClick={async () => {
              try {
                await injectResidentMemory(residentId, {
                  content: t('resident_panel.new_memory_text', { name: resident.name }),
                  importance: 0.8,
                  emotion: 'happy',
                })
                pushToast({
                  type: 'success',
                  title: t('resident_panel.inject_memory') + ' \u2713',
                })
              } catch {
                pushToast({ type: 'error', title: t('resident_panel.memory_failed') })
              }
            }}
            className="btn-micro flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-200 transition duration-200 hover:bg-cyan-300/20 active:scale-95"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
          </button>
          <button
            type="button"
            title={t('resident_panel.generate_memoir')}
            aria-label={t('resident_panel.generate_memoir')}
            disabled={memoirBusy}
            onClick={async () => {
              setMemoirBusy(true)
              try {
                const result = await generateMemoir(residentId)
                pushToast({
                  type: 'success',
                  title: `${resident.name} \u2014 ${t('resident_panel.generate_memoir')}`,
                  description: result.content.slice(0, 80) + '\u2026',
                })
              } catch {
                pushToast({
                  type: 'error',
                  title: t('resident_panel.generate_memoir') + ' \u2717',
                })
              } finally {
                setMemoirBusy(false)
              }
            }}
            className="btn-micro flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-300/10 text-emerald-200 transition duration-200 hover:bg-emerald-300/20 active:scale-95 disabled:opacity-40"
          >
            {memoirBusy ? (
              <span className="animate-spin text-sm">{'\u23F3'}</span>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path d="M10.75 16.82A7.462 7.462 0 0115 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0018 15.06v-11a.75.75 0 00-.546-.721A9.006 9.006 0 0015 3a8.999 8.999 0 00-4.25 1.065V16.82zM9.25 4.065A8.999 8.999 0 005 3c-.85 0-1.673.118-2.454.339A.75.75 0 002 4.06v11a.75.75 0 00.954.721A7.506 7.506 0 015 15.5c1.579 0 3.042.487 4.25 1.32V4.065z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            title={t('resident_panel.chat', '\u5BF9\u8BDD')}
            aria-label={t('resident_panel.chat', '\u5BF9\u8BDD')}
            onClick={() => setShowChat(true)}
            className="btn-micro flex h-9 w-9 items-center justify-center rounded-xl border border-violet-300/30 bg-violet-300/10 text-violet-200 transition duration-200 hover:bg-violet-300/20 active:scale-95"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path
                fillRule="evenodd"
                d="M3.43 2.524A41.29 41.29 0 0110 2c2.236 0 4.43.18 6.57.524 1.437.231 2.43 1.49 2.43 2.902v5.148c0 1.413-.993 2.67-2.43 2.902a41.202 41.202 0 01-5.183.501.78.78 0 00-.528.224l-3.579 3.58A.75.75 0 016 17.25v-3.443a41.033 41.033 0 01-2.57-.33C2.013 13.245 1 11.986 1 10.574V5.426c0-1.413.993-2.67 2.43-2.902z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Schedule tab wrapper (picks up store time + compare logic) ────────────

function ScheduleTabContent({
  residentId,
  residents,
}: {
  residentId: string
  residents: Array<{ id: string; name: string; personality?: string }>
}) {
  const time = useSimulationStore((s) => s.time)
  const resident = residents.find((r) => r.id === residentId)

  // Pick up to 2 other residents for comparison
  const compareResidents = useMemo(
    () =>
      residents
        .filter((r) => r.id !== residentId && r.personality)
        .slice(0, 2)
        .map((r) => ({ id: r.id, name: r.name, personality: r.personality ?? '' })),
    [residents, residentId],
  )

  if (!resident) return null

  return (
    <SchedulePanel
      residentId={residentId}
      personality={resident.personality ?? ''}
      name={resident.name}
      currentTime={time}
      compareResidents={compareResidents}
    />
  )
}
