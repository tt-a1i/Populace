import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSimulationStore } from '../../stores/simulation'

import {
  type EducationHistoryEntry,
  type Item,
  type Pet,
  type ResidentAchievement,
  type ResidentDiaryEntry,
  type ResidentHealthPayload,
  type ResidentJobPayload,
  type ResidentMemory,
  type ResidentMoodLogEntry,
  type ResidentRelationship,
  generateMemoir,
  getResidentAchievements,
  getResidentDiary,
  getResidentEducation,
  getResidentHealth,
  getResidentJob,
  getResidentMemories,
  getResidentMoodLog,
  getResidentPets,
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

const DIARY_TAG_CLASS = 'rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] text-amber-100'

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
  | 'education'
  | 'pets'
  | 'mood_log'
  | 'backpack'
  | 'family'
  | 'achievements'
  | 'schedule'

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
    pets?: Pet[]
    health?: {
      hp?: number
      illness?: {
        type: string
        contagious?: boolean
        severity?: number
      } | null
      recovery_tick?: number
    }
    energy?: number
    reputation?: number
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

function educationPolygonPoints(values: number[], radius: number, center: number): string {
  return values
    .map((value, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / values.length
      const distance = radius * value
      const x = center + Math.cos(angle) * distance
      const y = center + Math.sin(angle) * distance
      return `${x},${y}`
    })
    .join(' ')
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
  const [diaryEntries, setDiaryEntries] = useState<ResidentDiaryEntry[]>([])
  const [relationships, setRelationships] = useState<ResidentRelationship[]>([])
  const [skills, setSkills] = useState<Record<string, number>>({})
  const [knowledgeLevel, setKnowledgeLevel] = useState<Record<string, number>>({})
  const [courseHistory, setCourseHistory] = useState<EducationHistoryEntry[]>([])
  const [courses, setCourses] = useState<Array<{ subject: string; name: string; attendance_count?: number }>>([])
  const [moodLog, setMoodLog] = useState<ResidentMoodLogEntry[]>([])
  const [pets, setPets] = useState<Pet[]>([])
  const [achievements, setAchievements] = useState<ResidentAchievement[]>([])
  const [healthInfo, setHealthInfo] = useState<ResidentHealthPayload | null>(null)
  const [jobInfo, setJobInfo] = useState<ResidentJobPayload | null>(null)
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
      { key: 'education' as const, label: t('resident_panel.tab_education', '学业') },
      { key: 'pets' as const, label: t('resident_panel.tab_pets', '宠物') },
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

    void getResidentPets(residentId)
      .then((data) => {
        if (!cancelled) setPets(data)
      })
      .catch(() => {
        if (!cancelled) setPets(resident?.pets ?? [])
      })

    void getResidentDiary(residentId, { limit: 12 })
      .then((data) => {
        if (!cancelled) setDiaryEntries(data)
      })
      .catch(() => {
        if (!cancelled) setDiaryEntries([])
      })

    void getResidentAchievements(residentId)
      .then((data) => {
        if (!cancelled) setAchievements(data)
      })
      .catch(() => {
        if (!cancelled) setAchievements([])
      })

    void getResidentJob(residentId)
      .then((data) => {
        if (!cancelled) setJobInfo(data)
      })
      .catch(() => {
        if (!cancelled) setJobInfo(null)
      })

    void getResidentHealth(residentId)
      .then((data) => {
        if (!cancelled) setHealthInfo(data)
      })
      .catch(() => {
        if (!cancelled) setHealthInfo(null)
      })

    void getResidentEducation(residentId)
      .then((data) => {
        if (cancelled) return
        setKnowledgeLevel(data.education?.knowledge_level ?? {})
        setCourseHistory(data.education?.course_history ?? [])
        setCourses(data.education?.courses ?? [])
      })
      .catch(() => {
        if (cancelled) return
        setKnowledgeLevel({})
        setCourseHistory([])
        setCourses([])
      })

    return () => {
      cancelled = true
    }
  }, [residentId, resident?.pets, resident?.skills])

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
  const reputationValue = Math.max(-1, Math.min(1, resident.reputation ?? 0))
  const reputationPct = Math.round(((reputationValue + 1) / 2) * 100)
  const isTownCelebrity = reputationValue > 0.8
  const activeIllness = healthInfo?.health.illness ?? resident.health?.illness ?? null
  const healthHp = Math.round((healthInfo?.health.hp ?? resident.health?.hp ?? 1) * 100)

  const topRelationships = [...relationships]
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 8)
  const sortedSkills = Object.entries(skills)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
  const knowledgeEntries = Object.entries(knowledgeLevel)
  const radarValues = knowledgeEntries.map(([, value]) => Math.max(0.05, value))
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
                  {jobInfo?.job?.title ?? resident.occupation}
                </span>
              )}
              {resident.mood && (
                <span className="text-[11px] text-slate-400">{resident.mood}</span>
              )}
              {activeIllness ? (
                <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-2.5 py-0.5 text-[11px] text-rose-200">
                  {activeIllness.type} · HP {healthHp}%
                </span>
              ) : (
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] text-emerald-200">
                  健康 · HP {healthHp}%
                </span>
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
        <div className="flex items-center gap-1.5 text-emerald-200">
          <span className="text-[11px]">Wallet</span>
          <span className="text-sm tabular-nums font-medium">{Math.round(jobInfo?.wallet ?? 0)}</span>
        </div>
      </div>

      {jobInfo?.job ? (
        <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Job</p>
          <p className="mt-0.5 text-sm text-white">
            {jobInfo.job.title} · ${jobInfo.job.salary}/day · satisfaction {Math.round(jobInfo.job.satisfaction * 100)}%
          </p>
        </div>
      ) : null}

      <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">声望</span>
            {isTownCelebrity ? (
              <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] text-amber-100">
                镇上名人
              </span>
            ) : null}
          </div>
          <span className="text-sm font-medium tabular-nums text-white">{reputationValue.toFixed(2)}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-900/60">
          <div
            className="h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-300 to-emerald-300 transition-all duration-500"
            style={{ width: `${Math.max(6, reputationPct)}%` }}
          />
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
        {/* Memoir timeline */}
        <div className={activeTab === 'memories' ? '' : 'hidden'}>
          <div className="relative pl-5">
            <div className="absolute left-[7px] top-1 bottom-1 w-px bg-white/10" />
            {memories.length > 0 ? (
              <div className="space-y-3">
                {memories.map((mem) => (
                  <div key={mem.id} className="relative">
                    <div className="absolute -left-5 top-2.5 h-2 w-2 rounded-full border-2 border-slate-500 bg-slate-800" />
                    <div className="rounded-xl border border-white/6 bg-slate-900/50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-500">{mem.timestamp}</span>
                        <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] text-cyan-100">
                          {mem.type ?? 'memoir'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-slate-300">
                        {mem.content}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        {t('resident_panel.memory_weight', '情绪权重')} {Math.round((mem.emotional_weight ?? 0) * 100)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{t('resident_panel.no_memories', '暂无回忆')}</p>
            )}
          </div>
        </div>

        {/* Diary — placeholder */}
        <div className={activeTab === 'diary' ? '' : 'hidden'}>
          {diaryEntries.length > 0 ? (
            <div className="relative pl-5">
              <div className="absolute left-[7px] top-1 bottom-1 w-px bg-white/10" />
              <div className="space-y-3">
                {diaryEntries.map((entry) => (
                  <div key={entry.id} className="relative">
                    <div className="absolute -left-5 top-2.5 h-2 w-2 rounded-full border-2 border-amber-300/40 bg-slate-900" />
                    <div className="rounded-xl border border-white/6 bg-slate-900/50 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-500">
                          {entry.date} · #{entry.tick}
                        </span>
                        <span className="flex items-center gap-1 text-sm text-white">
                          <span>{MOOD_EMOJI[entry.mood_snapshot] ?? '📝'}</span>
                          <span>{entry.mood_snapshot}</span>
                        </span>
                      </div>
                      <p className={`mt-1 text-[13px] leading-relaxed ${entry.highlight ? 'font-semibold text-amber-50' : 'text-slate-300'}`}>
                        {entry.content}
                      </p>
                      {entry.tags.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {entry.tags.map((tag) => (
                            <span key={`${entry.id}-${tag}`} className={DIARY_TAG_CLASS}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center">
              <p className="text-sm text-slate-500">{t('resident_panel.no_diary', '暂无日记条目')}</p>
            </div>
          )}
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

        <div className={activeTab === 'education' ? '' : 'hidden'}>
          {knowledgeEntries.length > 0 ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/6 bg-slate-900/50 px-3 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                      {t('resident_panel.knowledge_radar', 'Knowledge Radar')}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {courses.map((course) => (
                        <span
                          key={`${course.subject}-${course.name}`}
                          className="rounded-full border border-fuchsia-300/20 bg-fuchsia-300/10 px-2 py-0.5 text-[10px] text-fuchsia-100"
                        >
                          {course.name} · {course.attendance_count ?? 0}
                        </span>
                      ))}
                    </div>
                  </div>
                  <svg viewBox="0 0 160 160" className="h-36 w-36 shrink-0" aria-label="education-radar">
                    <polygon
                      points={educationPolygonPoints(new Array(Math.max(radarValues.length, 3)).fill(1), 52, 80)}
                      fill="rgba(148,163,184,0.08)"
                      stroke="rgba(148,163,184,0.25)"
                    />
                    <polygon
                      points={educationPolygonPoints(radarValues, 52, 80)}
                      fill="rgba(34,211,238,0.22)"
                      stroke="rgba(45,212,191,0.8)"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {knowledgeEntries.map(([subject, value]) => (
                    <div key={subject} className="rounded-xl border border-white/6 bg-black/10 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm capitalize text-white">{subject}</span>
                        <span className="text-[10px] text-cyan-200">{Math.round(value * 100)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-white/6 bg-slate-900/50 px-3 py-3">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                  {t('resident_panel.course_history', 'Course History')}
                </p>
                {courseHistory.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {[...courseHistory].reverse().slice(0, 6).map((entry) => (
                      <div
                        key={`${entry.tick}-${entry.subject}-${entry.course_name}`}
                        className="rounded-xl border border-white/6 bg-black/10 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-white">{entry.course_name}</span>
                          <span className="text-[10px] text-slate-500">#{entry.tick}</span>
                        </div>
                        <p className="mt-1 text-xs capitalize text-slate-300">{entry.subject}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    {t('resident_panel.no_course_history', 'No course history yet')}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {t('resident_panel.no_education', 'No education data yet')}
            </p>
          )}
        </div>

        <div className={activeTab === 'pets' ? '' : 'hidden'}>
          {pets.length > 0 ? (
            <div className="space-y-2">
              {pets.map((pet) => (
                <div
                  key={pet.id}
                  className="rounded-xl border border-white/6 bg-slate-900/50 px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-white">{pet.name}</p>
                      <p className="text-xs capitalize text-slate-400">{pet.species}</p>
                    </div>
                    <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] text-amber-100">
                      {pet.mood ?? 'calm'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-300">
                    <span>Hunger</span>
                    <span>{Math.round((pet.hunger ?? 0) * 100)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-white/10">
                    <div
                      className="h-1.5 rounded-full bg-gradient-to-r from-amber-300 via-orange-300 to-rose-300 transition-all duration-500"
                      style={{ width: `${Math.round((pet.hunger ?? 0) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t('resident_panel.no_pets', 'No pets yet')}</p>
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
          {achievements.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {achievements.map((achievement) => (
                <div
                  key={achievement.id}
                  className={`flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center transition duration-300 ${
                    achievement.unlocked
                      ? 'border-amber-400/20 bg-amber-400/5'
                      : 'border-white/6 bg-white/[0.02] opacity-40 grayscale'
                  }`}
                  title={achievement.description}
                >
                  <span className="text-xl">{achievement.unlocked ? achievement.icon : '\u{1F512}'}</span>
                  <span
                    className={`text-[10px] font-medium ${achievement.unlocked ? 'text-amber-200' : 'text-slate-500'}`}
                  >
                    {achievement.name}
                  </span>
                  <span className="text-[9px] text-slate-500">
                    {achievement.unlocked && achievement.unlocked_at_tick != null
                      ? `#${achievement.unlocked_at_tick}`
                      : t('resident_panel.achievement_locked', 'Locked')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t('resident_panel.no_achievements', 'No achievements yet')}</p>
          )}
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
