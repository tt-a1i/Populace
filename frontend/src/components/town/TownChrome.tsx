import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { GraphRelationship } from '../../stores/relationships'
import type { ResidentPosition } from '../../stores/simulation'
import {
  type ResidentMemory,
  type ResidentReflection,
  type ResidentRelationship,
  getResidentMemories,
  getResidentReflections,
  getResidentRelationships,
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

  // Real data from API (fetched when a resident is selected)
  const [liveMemories, setLiveMemories] = useState<ResidentMemory[] | null>(null)
  const [liveRelationships, setLiveRelationships] = useState<ResidentRelationship[] | null>(null)
  const [liveReflections, setLiveReflections] = useState<ResidentReflection[] | null>(null)
  const requestSequenceRef = useRef(0)

  useLayoutEffect(() => {
    requestSequenceRef.current += 1
    // eslint-disable-next-line react-hooks/rules-of-hooks
    window.queueMicrotask(() => {
      setLiveMemories(null)
      setLiveRelationships(null)
      setLiveReflections(null)
    })
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
    const setReflections = applyIfCurrent(setLiveReflections)

    void getResidentMemories(selectedResidentId).then(setMemories).catch(() => setMemories(null))
    void getResidentRelationships(selectedResidentId)
      .then(setRelationships)
      .catch(() => setRelationships(null))
    void getResidentReflections(selectedResidentId)
      .then(setReflections)
      .catch(() => setReflections(null))

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
            <button
              type="button"
              onClick={onClearResidentSelection}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10"
            >
              收起
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Mood</p>
              <p className="mt-2 text-lg font-semibold text-white">{formatMood(selectedResident.mood)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Position</p>
              <p className="mt-2 text-lg font-semibold text-white">{selectedResident.targetX}, {selectedResident.targetY}</p>
            </div>
          </div>

          {/* ── Memories (live from API, fallback to synthesised) ── */}
          <section className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
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
          </section>

          {/* ── Reflections ── */}
          {liveReflections && liveReflections.length > 0 && (
            <section className="mt-3 rounded-[22px] border border-violet-400/15 bg-violet-400/5 p-4">
              <p className="text-[11px] uppercase tracking-[0.28em] text-violet-300/70">
                反思 · {liveReflections.length}
              </p>
              <div className="mt-3 max-h-32 space-y-2 overflow-y-auto pr-1">
                {[...liveReflections].reverse().slice(0, 4).map((rf) => (
                  <div key={rf.id} className="rounded-2xl border border-violet-400/15 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
                    <p className="text-[10px] text-slate-500 mb-1">{rf.timestamp}</p>
                    <p>{rf.summary}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Relationships (live from API or fallback from graph store) ── */}
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
