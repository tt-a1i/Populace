import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { GraphRelationship } from '../../stores/relationships'
import type { ResidentPosition } from '../../stores/simulation'
import {
  type ResidentAchievement,
  type ResidentDiaryEntry,
  type ResidentMemory,
  type ResidentReflection,
  type ResidentRelationship,
  getResidentAchievements,
  getResidentDiary,
  getResidentMemories,
  getResidentReflections,
  getResidentRelationships,
  injectResidentMemory,
  patchResidentAttributes,
  teleportResident,
} from '../../services/api'
import type { Building } from '../../types'
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  formatTileKind,
  getBuildingFootprint,
  type PlaceholderBuilding,
  type TileInspectionDetails,
  type TileKind,
} from './townMap'

export interface TownContextMenuState {
  screenX: number
  screenY: number
  tileX: number
  tileY: number
  tileKind: TileKind
  nearbyResidentId?: string   // set when right-clicking on/near a resident
}

export type TownPlaceholder = PlaceholderBuilding
export type TownInspectionState = TileInspectionDetails

interface TownChromeProps {
  residents: ResidentPosition[]
  buildings: Array<Building & { occupants?: number }>
  relationships: GraphRelationship[]
  selectedResidentId: string | null
  currentTime: string
  messageFeed: string[]
  contextMenu: TownContextMenuState | null
  inspection: TownInspectionState | null
  placeholders: TownPlaceholder[]
  onCloseContextMenu: () => void
  onInjectEvent: () => void
  onInspectTile: () => void
  onPlacePlaceholder: () => void
  onClearResidentSelection: () => void
  onDismissInspection: () => void
}

interface RelationshipEntry {
  id: string
  name: string
  type: string
  intensity: number
  reason: string
}

function formatMood(mood: string | undefined): string {
  return mood?.trim() || 'neutral'
}

function buildMemorySummary(
  resident: ResidentPosition,
  messageFeed: string[],
  currentTime: string,
): string[] {
  const relatedFeed = messageFeed.filter((message) => message.includes(resident.name)).slice(-2).reverse()
  const summary = [
    resident.dialogueText ? `刚刚说过：${resident.dialogueText}` : null,
    ...relatedFeed,
    resident.currentBuildingId
      ? `当前停留在 ${resident.currentBuildingId}，记录时间 ${currentTime}`
      : `当前在地图 (${resident.targetX}, ${resident.targetY})，记录时间 ${currentTime}`,
  ].filter((entry): entry is string => Boolean(entry))

  return summary.slice(0, 3)
}

function buildRelationshipEntries(
  selectedResidentId: string,
  residents: ResidentPosition[],
  relationships: GraphRelationship[],
): RelationshipEntry[] {
  const residentNameById = new Map(residents.map((resident) => [resident.id, resident.name]))

  return relationships
    .filter(
      (relationship) =>
        relationship.from_id === selectedResidentId || relationship.to_id === selectedResidentId,
    )
    .map((relationship) => {
      const counterpartId =
        relationship.from_id === selectedResidentId ? relationship.to_id : relationship.from_id

      return {
        id: `${relationship.from_id}-${relationship.to_id}-${relationship.type}`,
        name: residentNameById.get(counterpartId) ?? counterpartId,
        type: relationship.type,
        intensity: relationship.intensity,
        reason: relationship.reason,
      }
    })
    .sort((left, right) => right.intensity - left.intensity)
}

export function TownChrome({
  residents,
  buildings,
  relationships,
  selectedResidentId,
  currentTime,
  messageFeed,
  contextMenu,
  inspection,
  placeholders,
  onCloseContextMenu,
  onInjectEvent,
  onInspectTile,
  onPlacePlaceholder,
  onClearResidentSelection,
  onDismissInspection,
}: TownChromeProps) {
  const selectedResident = useMemo(
    () => residents.find((resident) => resident.id === selectedResidentId) ?? null,
    [residents, selectedResidentId],
  )

  // Sidebar tabs: memories | diary | relationships | achievements
  const [sidebarTab, setSidebarTab] = useState<'memories' | 'diary' | 'relationships' | 'achievements'>('memories')

  // Real data from API (fetched when a resident is selected)
  const [liveMemories, setLiveMemories] = useState<ResidentMemory[] | null>(null)
  const [liveRelationships, setLiveRelationships] = useState<ResidentRelationship[] | null>(null)
  const [liveReflections, setLiveReflections] = useState<ResidentReflection[] | null>(null)
  const [liveDiary, setLiveDiary] = useState<ResidentDiaryEntry[] | null>(null)
  const [liveAchievements, setLiveAchievements] = useState<ResidentAchievement[] | null>(null)
  const requestSequenceRef = useRef(0)

  // God-mode: edit panel state
  const [editMode, setEditMode] = useState(false)
  const [editMood, setEditMood] = useState('')
  const [editPersonality, setEditPersonality] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  // God-mode: inject memory panel state
  const [injectOpen, setInjectOpen] = useState(false)
  const [injectContent, setInjectContent] = useState('')
  const [injectImportance, setInjectImportance] = useState(0.7)
  const [injectEmotion, setInjectEmotion] = useState('neutral')
  const [injectBusy, setInjectBusy] = useState(false)
  const [injectResult, setInjectResult] = useState<string | null>(null)

  const handleOpenEdit = () => {
    if (!selectedResident) return
    setEditMood(selectedResident.mood ?? 'neutral')
    setEditPersonality(selectedResident.personality ?? '')
    setEditMode(true)
  }

  const handleSaveEdit = async () => {
    if (!selectedResidentId) return
    setEditBusy(true)
    try {
      await patchResidentAttributes(selectedResidentId, {
        mood: editMood || undefined,
        personality: editPersonality || undefined,
      })
      setEditMode(false)
    } catch { /* silently ignore */ }
    finally { setEditBusy(false) }
  }

  const handleInjectMemory = async () => {
    if (!selectedResidentId || !injectContent.trim()) return
    setInjectBusy(true)
    setInjectResult(null)
    try {
      await injectResidentMemory(selectedResidentId, {
        content: injectContent.trim(),
        importance: injectImportance,
        emotion: injectEmotion,
      })
      setInjectResult('✓ 记忆已注入')
      setInjectContent('')
    } catch { setInjectResult('✗ 注入失败') }
    finally { setInjectBusy(false) }
  }

  const handleTeleport = async (x: number, y: number, rid?: string) => {
    const targetId = rid ?? selectedResidentId
    if (!targetId) return
    try { await teleportResident(targetId, x, y) }
    catch { /* silently ignore */ }
  }

  useLayoutEffect(() => {
    requestSequenceRef.current += 1
    setLiveMemories(null)
    setLiveRelationships(null)
    setLiveReflections(null)
    setLiveDiary(null)
    setLiveAchievements(null)
  }, [selectedResidentId])

  useEffect(() => {
    if (!selectedResidentId) {
      return undefined
    }

    const requestSequence = requestSequenceRef.current
    let disposed = false

    const applyIfCurrent = <T,>(setter: (value: T | null) => void) => (value: T | null) => {
      if (disposed || requestSequenceRef.current !== requestSequence) {
        return
      }

      setter(value)
    }

    const setMemories = applyIfCurrent(setLiveMemories)
    const setRelationships = applyIfCurrent(setLiveRelationships)
    const setAchievements = applyIfCurrent(setLiveAchievements)
    const setReflections = applyIfCurrent(setLiveReflections)
    const setDiary = applyIfCurrent(setLiveDiary)

    void getResidentMemories(selectedResidentId).then(setMemories).catch(() => setMemories(null))
    void getResidentRelationships(selectedResidentId)
      .then(setRelationships)
      .catch(() => setRelationships(null))
    void getResidentReflections(selectedResidentId)
      .then(setReflections)
      .catch(() => setReflections(null))
    void getResidentDiary(selectedResidentId).then(setDiary).catch(() => setDiary(null))
    void getResidentAchievements(selectedResidentId)
      .then(setAchievements)
      .catch(() => setAchievements(null))

    return () => {
      disposed = true
    }
  }, [selectedResidentId])

  // Fallback: synthesised summary when live data is empty
  const memorySummary = useMemo(
    () =>
      selectedResident ? buildMemorySummary(selectedResident, messageFeed, currentTime) : [],
    [currentTime, messageFeed, selectedResident],
  )
  const relationshipEntries = useMemo(
    () =>
      selectedResident ? buildRelationshipEntries(selectedResident.id, residents, relationships) : [],
    [relationships, residents, selectedResident],
  )

  return (
    <>
      {inspection && (
        <section
          data-testid="town-inspection"
          className="absolute left-4 top-4 z-20 w-[16rem] rounded-[22px] border border-cyan-200/20 bg-slate-950/88 px-4 py-4 text-slate-100 shadow-[0_18px_44px_rgba(8,15,31,0.38)] backdrop-blur"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-100/70">查看位置</p>
              <h3 className="mt-2 font-mono text-lg font-bold text-white">Tile {inspection.tileX}, {inspection.tileY}</h3>
            </div>
            <button
              type="button"
              onClick={onDismissInspection}
              className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 transition hover:bg-white/10"
            >
              关闭
            </button>
          </div>
          <dl className="mt-4 grid gap-3 text-sm text-slate-300">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">地形</dt>
              <dd>{formatTileKind(inspection.tileKind)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">建筑</dt>
              <dd>{inspection.buildingName ?? '暂无'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">角色数</dt>
              <dd>{inspection.residentCount}</dd>
            </div>
          </dl>
        </section>
      )}

      {selectedResident && (
        <aside
          data-testid="resident-sidebar"
          className="absolute bottom-4 right-4 top-4 z-30 flex w-[min(22rem,calc(100%-2rem))] flex-col rounded-[26px] border border-cyan-300/18 bg-slate-950/92 p-5 text-slate-100 shadow-[0_28px_80px_rgba(8,15,31,0.44)] backdrop-blur"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-100/70">Resident Focus</p>
              <h3 className="mt-2 font-display text-3xl text-white">{selectedResident.name}</h3>
              <p className="mt-1 text-sm text-slate-400">{selectedResident.personality ?? '暂无性格描述'}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <button
                type="button"
                onClick={onClearResidentSelection}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10"
              >
                收起
              </button>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={handleOpenEdit}
                  className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[11px] font-medium text-amber-200 transition hover:bg-amber-300/20"
                >
                  ✏️ 编辑
                </button>
                <button
                  type="button"
                  onClick={() => { setInjectOpen(true); setInjectResult(null) }}
                  className="rounded-full border border-violet-300/30 bg-violet-300/10 px-2.5 py-1 text-[11px] font-medium text-violet-200 transition hover:bg-violet-300/20"
                >
                  💉 记忆
                </button>
              </div>
            </div>
          </div>

          {/* ── God-mode: Edit attributes panel ── */}
          {editMode && (
            <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/8 p-4">
              <p className="mb-3 text-[11px] uppercase tracking-[0.28em] text-amber-300/70">上帝模式 · 编辑属性</p>
              <label className="grid gap-1 text-xs text-slate-300">
                心情 Mood
                <select
                  value={editMood}
                  onChange={e => setEditMood(e.target.value)}
                  className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none"
                >
                  {['happy','neutral','sad','angry','excited','calm','tired','fearful'].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="mt-2 grid gap-1 text-xs text-slate-300">
                性格 Personality
                <input
                  value={editPersonality}
                  onChange={e => setEditPersonality(e.target.value)}
                  className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none"
                />
              </label>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={editBusy}
                  onClick={() => void handleSaveEdit()}
                  className="flex-1 rounded-xl bg-amber-500/80 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-400 disabled:opacity-50"
                >
                  {editBusy ? '保存中…' : '保存'}
                </button>
                <button type="button" onClick={() => setEditMode(false)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 hover:bg-white/10">
                  取消
                </button>
              </div>
            </div>
          )}

          {/* ── God-mode: Inject memory panel ── */}
          {injectOpen && (
            <div className="mt-3 rounded-2xl border border-violet-400/20 bg-violet-400/8 p-4">
              <p className="mb-3 text-[11px] uppercase tracking-[0.28em] text-violet-300/70">上帝模式 · 注入记忆</p>
              <label className="grid gap-1 text-xs text-slate-300">
                记忆内容
                <input
                  value={injectContent}
                  onChange={e => setInjectContent(e.target.value)}
                  placeholder="描述一段记忆…"
                  className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none placeholder-slate-600"
                />
              </label>
              <label className="mt-2 grid gap-1 text-xs text-slate-300">
                重要度 {(injectImportance * 100).toFixed(0)}%
                <input type="range" min={0} max={1} step={0.05}
                  value={injectImportance}
                  onChange={e => setInjectImportance(Number(e.target.value))}
                  className="w-full accent-violet-400" />
              </label>
              <label className="mt-2 grid gap-1 text-xs text-slate-300">
                情绪
                <select value={injectEmotion} onChange={e => setInjectEmotion(e.target.value)}
                  className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none">
                  {['neutral','happy','sad','angry','surprised','fearful'].map(em => (
                    <option key={em} value={em}>{em}</option>
                  ))}
                </select>
              </label>
              {injectResult && <p className="mt-2 text-xs text-violet-300">{injectResult}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={injectBusy || !injectContent.trim()}
                  onClick={() => void handleInjectMemory()}
                  className="flex-1 rounded-xl bg-violet-500/80 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
                >
                  {injectBusy ? '注入中…' : '注入记忆'}
                </button>
                <button type="button" onClick={() => setInjectOpen(false)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 hover:bg-white/10">
                  关闭
                </button>
              </div>
            </div>
          )}

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Mood</p>
              <p className="mt-2 text-lg font-semibold text-white">{formatMood(selectedResident.mood)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Position</p>
              <p className="mt-2 text-lg font-semibold text-white">{selectedResident.targetX}, {selectedResident.targetY}</p>
            </div>
            <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-amber-400/70">Coins</p>
              <p className="mt-2 text-lg font-semibold text-amber-200">🪙 {selectedResident.coins ?? 100}</p>
            </div>
          </div>

          {/* ── Tab switcher: memories / diary / relationships / achievements ── */}
          <div className="mt-5 inline-flex flex-wrap gap-1 rounded-full border border-white/10 bg-white/5 p-1">
            {(['memories', 'diary', 'relationships', 'achievements'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setSidebarTab(tab)}
                className={[
                  'rounded-full px-3 py-1 text-xs font-medium transition',
                  sidebarTab === tab ? 'bg-cyan-300/16 text-cyan-50' : 'text-slate-400',
                ].join(' ')}
              >
                {tab === 'memories' ? '记忆' : tab === 'diary' ? '日记' : tab === 'relationships' ? '关系' : '成就'}
              </button>
            ))}
          </div>

          {/* ── Memories ── */}
          {sidebarTab === 'memories' && (
            <section className="mt-3 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                  记忆
                  {liveMemories && liveMemories.length > 0 && (
                    <span className="ml-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-1.5 py-0.5 text-[9px] text-cyan-300/70">
                      {liveMemories.length}
                    </span>
                  )}
                </p>
                <span className="text-xs text-slate-500">{currentTime}</span>
              </div>
              <div className="mt-3 max-h-40 space-y-2 overflow-y-auto text-sm leading-6 text-slate-300 pr-1">
                {liveMemories && liveMemories.length > 0 ? (
                  [...liveMemories].reverse().slice(0, 8).map((mem) => (
                    <div key={mem.id} className="rounded-2xl border border-white/6 bg-slate-900/60 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-500">{mem.timestamp}</span>
                        <span className="text-[10px] text-slate-500">重要度 {(mem.importance * 100).toFixed(0)}%</span>
                      </div>
                      <p className="mt-1">{mem.content}</p>
                    </div>
                  ))
                ) : (
                  memorySummary.map((entry) => (
                    <p key={entry} className="rounded-2xl border border-white/6 bg-slate-900/60 px-3 py-2">
                      {entry}
                    </p>
                  ))
                )}
              </div>
              {liveReflections && liveReflections.length > 0 && (
                <div className="mt-3 border-t border-white/8 pt-3">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-violet-300/70">
                    反思 · {liveReflections.length}
                  </p>
                  <div className="mt-2 max-h-24 space-y-2 overflow-y-auto pr-1">
                    {[...liveReflections].reverse().slice(0, 3).map((rf) => (
                      <div key={rf.id} className="rounded-2xl border border-violet-400/15 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
                        <p className="text-[10px] text-slate-500 mb-1">{rf.timestamp}</p>
                        <p>{rf.summary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ── Diary ── */}
          {sidebarTab === 'diary' && (
            <section
              data-testid="resident-diary"
              className="mt-3 flex-1 rounded-[22px] border border-emerald-400/15 bg-emerald-400/[0.04] p-4"
            >
              <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/70">
                日记
                {liveDiary && liveDiary.length > 0 && (
                  <span className="ml-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] text-emerald-300/70">
                    {liveDiary.length}
                  </span>
                )}
              </p>
              <div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">
                {liveDiary && liveDiary.length > 0 ? (
                  [...liveDiary].reverse().map((entry) => (
                    <article key={entry.id} className="rounded-2xl border border-emerald-400/15 bg-slate-900/60 px-3 py-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-300">
                          {entry.date}
                        </span>
                        <span className="text-[10px] text-slate-500">Tick {entry.tick}</span>
                      </div>
                      <p className="text-sm leading-[1.7] text-slate-300">{entry.summary}</p>
                    </article>
                  ))
                ) : (
                  <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-slate-400">
                    日记尚未生成，每天 22:00 自动写入。
                  </p>
                )}
              </div>
            </section>
          )}

          {/* ── Achievements ── */}
          {sidebarTab === 'achievements' && (
            <section className="mt-3 flex-1 rounded-[22px] border border-yellow-400/15 bg-yellow-400/[0.04] p-4">
              <p className="text-[11px] uppercase tracking-[0.28em] text-yellow-300/70">
                成就
                {liveAchievements && (
                  <span className="ml-2 rounded-full border border-yellow-400/20 bg-yellow-400/10 px-1.5 py-0.5 text-[9px] text-yellow-300/70">
                    {liveAchievements.filter((a) => a.unlocked).length}/{liveAchievements.length}
                  </span>
                )}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2">
                {liveAchievements ? (
                  liveAchievements.map((ach) => (
                    <div
                      key={ach.id}
                      className={[
                        'flex items-center gap-3 rounded-2xl border px-3 py-2.5',
                        ach.unlocked
                          ? 'border-yellow-400/25 bg-yellow-400/10'
                          : 'border-white/6 bg-slate-900/40 opacity-50',
                      ].join(' ')}
                    >
                      <span className="text-2xl">{ach.unlocked ? ach.icon : '🔒'}</span>
                      <div>
                        <p className={['text-sm font-medium', ach.unlocked ? 'text-yellow-100' : 'text-slate-400'].join(' ')}>
                          {ach.name}
                        </p>
                        <p className="text-[11px] text-slate-500">{ach.description}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-slate-400">
                    加载中…
                  </p>
                )}
              </div>
            </section>
          )}

          {/* ── Relationships ── */}
          {sidebarTab === 'relationships' && (
          <section className="mt-3 flex-1 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
              关系
                {liveRelationships && liveRelationships.length > 0 && (
                  <span className="ml-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-1.5 py-0.5 text-[9px] text-amber-300/70">
                    {liveRelationships.length}
                  </span>
              )}
            </p>
            <div className="mt-3 max-h-48 space-y-3 overflow-y-auto pr-1">
              {liveRelationships && liveRelationships.length > 0 ? (
                liveRelationships.map((rel) => (
                  <article
                    key={`${rel.from_id}-${rel.to_id}-${rel.type}`}
                    className="rounded-2xl border border-white/6 bg-slate-900/60 px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-white">{rel.counterpart_name}</p>
                      <span className="rounded-full border border-amber-200/20 bg-amber-200/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-amber-100">
                        {rel.type}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400">
                      <span>强度 {(rel.intensity * 100).toFixed(0)}%</span>
                      <span>熟悉度 {(rel.familiarity * 100).toFixed(0)}%</span>
                    </div>
                    {rel.reason && <p className="mt-2 text-sm leading-6 text-slate-300">{rel.reason}</p>}
                  </article>
                ))
              ) : relationshipEntries.length > 0 ? (
                relationshipEntries.map((entry) => (
                  <article key={entry.id} className="rounded-2xl border border-white/6 bg-slate-900/60 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-white">{entry.name}</p>
                      <span className="rounded-full border border-amber-200/20 bg-amber-200/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-amber-100">
                        {entry.type}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">强度 {(entry.intensity * 100).toFixed(0)}%</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{entry.reason}</p>
                  </article>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-slate-400">
                  暂无已记录的关系变化。
                </p>
              )}
            </div>
          </section>
          )}
        </aside>
      )}

      <section
        data-testid="town-minimap"
        className="absolute bottom-4 z-10 overflow-hidden rounded-[22px] border border-white/10 bg-slate-950/88 p-3 text-slate-100 shadow-[0_20px_50px_rgba(8,15,31,0.4)] backdrop-blur"
        style={{ right: '1rem' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-100/70">Minimap</p>
            <p className="mt-1 text-xs text-slate-400">角色分布总览</p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-300">
            {residents.length} residents
          </span>
        </div>

        <div className="relative mt-3 h-32 w-40 rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.94))]">
          {buildings.map((building) => {
            const footprint = getBuildingFootprint(building)

            return (
              <span
                key={building.id}
                data-testid="minimap-building-footprint"
                className="absolute block rounded-[4px] border border-cyan-200/20 bg-cyan-200/15"
                style={{
                  left: `${(building.position[0] / MAP_WIDTH) * 100}%`,
                  top: `${(building.position[1] / MAP_HEIGHT) * 100}%`,
                  width: `${(footprint.cols / MAP_WIDTH) * 100}%`,
                  height: `${(footprint.rows / MAP_HEIGHT) * 100}%`,
                }}
              />
            )
          })}
          {placeholders.map((placeholder) => (
            <span
              key={placeholder.id}
              data-testid="minimap-placeholder-dot"
              className="absolute block rounded-[4px] border border-amber-200/40 bg-amber-200/35"
              style={{
                left: `${(placeholder.tileX / MAP_WIDTH) * 100}%`,
                top: `${(placeholder.tileY / MAP_HEIGHT) * 100}%`,
                width: '8px',
                height: '8px',
                transform: 'translate(-50%, -50%)',
              }}
              title={placeholder.label}
            />
          ))}
          {residents.map((resident) => (
            <span
              key={resident.id}
              data-testid="minimap-resident-dot"
              className="absolute block rounded-full border border-slate-950/70"
              style={{
                left: `${(resident.targetX / MAP_WIDTH) * 100}%`,
                top: `${(resident.targetY / MAP_HEIGHT) * 100}%`,
                width: resident.id === selectedResidentId ? '10px' : '8px',
                height: resident.id === selectedResidentId ? '10px' : '8px',
                backgroundColor: `#${resident.color.toString(16).padStart(6, '0')}`,
                boxShadow: resident.id === selectedResidentId ? '0 0 0 2px rgba(250, 204, 21, 0.55)' : 'none',
                transform: 'translate(-50%, -50%)',
              }}
              title={resident.name}
            />
          ))}
        </div>
      </section>

      {contextMenu && (
        <section
          data-testid="town-context-menu"
          data-town-context-menu="true"
          className="absolute z-30 w-48 rounded-[20px] border border-white/10 bg-slate-950/94 p-2 text-slate-100 shadow-[0_22px_55px_rgba(8,15,31,0.46)] backdrop-blur"
          style={{ left: contextMenu.screenX, top: contextMenu.screenY }}
        >
          <div className="border-b border-white/8 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-100/70">Tile {contextMenu.tileX}, {contextMenu.tileY}</p>
            <p className="mt-1 text-xs text-slate-400">{formatTileKind(contextMenu.tileKind)}</p>
          </div>
          <div className="grid gap-1 px-1 py-2">
            <button
              type="button"
              onClick={onInjectEvent}
              className="rounded-2xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-cyan-300/14"
            >
              投放事件
            </button>
            <button
              type="button"
              onClick={onInspectTile}
              className="rounded-2xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-cyan-300/14"
            >
              查看位置
            </button>
            <button
              type="button"
              onClick={onPlacePlaceholder}
              className="rounded-2xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-amber-300/14"
            >
              放置建筑占位
            </button>
            {/* Teleport selected resident or context-menu nearby resident */}
            {(selectedResidentId || contextMenu.nearbyResidentId) && (
              <button
                type="button"
                onClick={() => {
                  void handleTeleport(contextMenu.tileX, contextMenu.tileY, contextMenu.nearbyResidentId)
                  onCloseContextMenu()
                }}
                className="rounded-2xl px-3 py-2 text-left text-sm text-violet-200 transition hover:bg-violet-300/14"
              >
                ⚡ 传送到此
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onCloseContextMenu}
            className="w-full rounded-2xl border border-white/8 px-3 py-2 text-xs text-slate-400 transition hover:bg-white/5"
          >
            收起菜单
          </button>
        </section>
      )}
    </>
  )
}
