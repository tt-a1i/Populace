import { create } from 'zustand'

import type { Building, DialogueUpdate, EnergyUpdate, MovementUpdate, Resident, TickState } from '../types'

export type SimulationSpeed = 0 | 1 | 2 | 5 | 10 | 50

export type FeedMessageKind = 'dialogue' | 'event' | 'system'

export interface FeedMessage {
  id: string
  text: string
  kind: FeedMessageKind
}
export type ResidentStatus =
  | 'idle'
  | 'walking'
  | 'chatting'
  | 'thinking'
  | 'happy'
  | 'angry'
  | 'sad'

export interface ResidentPosition {
  id: Resident['id']
  name: Resident['name']
  x: Resident['x']
  y: Resident['y']
  targetX: Resident['x']
  targetY: Resident['y']
  color: number
  status: ResidentStatus
  currentBuildingId?: string | null
  skinColor?: string | null
  hairStyle?: string | null
  hairColor?: string | null
  outfitColor?: string | null
  personality?: string
  mood?: string
  goals?: string[]
  dialogueText?: string | null
  currentGoal?: string | null   // active short-term goal for thought bubble
  coins?: number
  occupation?: string
  energy?: number
}

export interface TickMovement extends Omit<MovementUpdate, 'action'> {
  action?: string
  name?: string
  dialogueText?: string | null
  status?: ResidentStatus
}

export interface FrozenSimulationFrame {
  residents: ResidentPosition[]
  meta: {
    running: boolean
    speed: SimulationSpeed
    tick: number
    tickPerDay: number
    time: string
  }
}

export interface SimulationHistoryFrame {
  tick: number
  time: string
  residents: ResidentPosition[]
}

export interface SimulationTickState extends Omit<TickState, 'movements' | 'dialogues'> {
  dialogues?: DialogueUpdate[]
  movements: TickMovement[]
}

/** Shape of the backend /api/simulation/snapshot response */
export interface SimulationSnapshot {
  tick?: number
  time?: string
  running?: boolean
  speed?: number
  buildings?: Array<Building & { occupants?: number }>
  residents?: Array<{
    id: string
    name: string
    x?: number
    y?: number
    mood?: string
    personality?: string
    goals?: string[]
    location?: string | null
    skin_color?: string | null
    hair_style?: string | null
    hair_color?: string | null
    outfit_color?: string | null
  }>
  last_tick?: SimulationTickState | null
}

interface SimulationState {
  tick: number
  tickPerDay: number
  time: string
  running: boolean
  speed: SimulationSpeed
  lastAppliedTick: number
  weather: string
  season: string
  residents: ResidentPosition[]
  history: SimulationHistoryFrame[]
  buildings: Array<Building & { occupants: number }>
  replayFrozenFrame: FrozenSimulationFrame | null
  messageFeed: FeedMessage[]
  selectedResidentId: string | null
  hoveredPairIds: [string, string] | null
  setRunning: (running: boolean) => void
  setSpeed: (speed: SimulationSpeed) => void
  setBuildings: (buildings: Array<Building & { occupants: number }>) => void
  selectResident: (residentId: string | null) => void
  setHoveredPairIds: (pairIds: [string, string] | null) => void
  freezeForReplay: () => void
  resumeLiveFromReplay: () => void
  getFrameByTick: (tick: number) => SimulationHistoryFrame | null
  updateFromTick: (tickState: SimulationTickState) => void
  initFromSnapshot: (snapshot: SimulationSnapshot) => void
}

const palette = [0xf97316, 0x38bdf8, 0x34d399, 0xf59e0b, 0xe879f9, 0xfb7185]

function clampTilePosition(value: number, max: number): number {
  return Math.max(0, Math.min(value, max))
}

function colorForResident(id: string): number {
  const checksum = [...id].reduce((total, char) => total + char.charCodeAt(0), 0)
  return palette[checksum % palette.length]
}

function statusFromAction(action?: string, fallback?: ResidentStatus): ResidentStatus {
  if (fallback) {
    return fallback
  }

  switch (action) {
    case 'walking':
      return 'walking'
    case 'dialogue':
    case 'talking':
      return 'chatting'
    case 'thinking':
      return 'thinking'
    case 'happy':
      return 'happy'
    case 'angry':
      return 'angry'
    case 'sad':
      return 'sad'
    default:
      return 'idle'
  }
}

let _feedCounter = 0
function _feedId(): string { return `f${++_feedCounter}` }

function appendRecentMessages(existing: FeedMessage[], incoming: FeedMessage[]): FeedMessage[] {
  if (incoming.length === 0) {
    return existing
  }

  return [...existing, ...incoming].slice(-5)
}

function cloneResidents(residents: ResidentPosition[]): ResidentPosition[] {
  return residents.map((resident) => ({ ...resident }))
}

function recomputeBuildingOccupancy(
  buildings: Array<Building & { occupants: number }>,
  residents: ResidentPosition[],
): Array<Building & { occupants: number }> {
  const occupantsByBuilding = residents.reduce<Map<string, number>>((counts, resident) => {
    if (resident.currentBuildingId) {
      counts.set(resident.currentBuildingId, (counts.get(resident.currentBuildingId) ?? 0) + 1)
    }
    return counts
  }, new Map())

  return buildings.map((building) => ({
    ...building,
    occupants: occupantsByBuilding.get(building.id) ?? 0,
  }))
}

function inferBuildingId(
  resident: ResidentPosition,
  buildings: Array<Building & { occupants: number }>,
): string | null {
  const building = buildings.find(
    (candidate) =>
      candidate.position[0] === resident.targetX && candidate.position[1] === resident.targetY,
  )

  return building?.id ?? null
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  tick: 16,
  tickPerDay: 48,
  time: 'Day 1, 08:00',
  running: true,
  speed: 1,
  lastAppliedTick: 0,
  weather: 'sunny',
  season: 'spring',
  residents: [],
  history: [],
  buildings: [],
  replayFrozenFrame: null,
  messageFeed: [
    { id: 'init-1', kind: 'system' as FeedMessageKind, text: '等待居民进入场景...' },
    { id: 'init-2', kind: 'system' as FeedMessageKind, text: '连接建立后，这里会滚动显示最新事件与对话。' },
  ],
  selectedResidentId: null,
  hoveredPairIds: null,
  setRunning: (running) => set({ running }),
  setSpeed: (speed) => set({ speed, running: speed !== 0 }),
  setBuildings: (buildings) => set({ buildings }),
  selectResident: (residentId) => set({ selectedResidentId: residentId }),
  setHoveredPairIds: (pairIds) => set({ hoveredPairIds: pairIds }),
  freezeForReplay: () =>
    set((state) => ({
      replayFrozenFrame: {
        residents: cloneResidents(state.residents),
        meta: {
          running: state.running,
          speed: state.speed,
          tick: state.tick,
          tickPerDay: state.tickPerDay,
          time: state.time,
        },
      },
    })),
  resumeLiveFromReplay: () => set({ replayFrozenFrame: null }),
  getFrameByTick: (tick) => get().history.find((frame) => frame.tick === tick) ?? null,
  updateFromTick: (tickState) => {
    set((state) => {
      const residentMap = new Map(state.residents.map((resident) => [resident.id, resident]))
      const dialogueByResident = new Map<string, string>()
      const freshMessages: FeedMessage[] = []
      const seenResidents = new Set<string>()

      for (const dialogue of tickState.dialogues ?? []) {
        if (!dialogueByResident.has(dialogue.to_id)) {
          dialogueByResident.set(dialogue.to_id, '💬')
        }
        dialogueByResident.set(dialogue.from_id, dialogue.text)
        const fromName = residentMap.get(dialogue.from_id)?.name ?? dialogue.from_id
        const toName = residentMap.get(dialogue.to_id)?.name ?? dialogue.to_id
        freshMessages.push({ id: _feedId(), kind: 'dialogue', text: `${fromName} 对 ${toName} 说：${dialogue.text}` })
      }

      for (const event of tickState.events ?? []) {
        freshMessages.push({ id: _feedId(), kind: 'event', text: `事件：${event.description}` })
      }

      for (const movement of tickState.movements) {
        seenResidents.add(movement.id)
        const existingResident = residentMap.get(movement.id)
        const dialogueText = dialogueByResident.get(movement.id) ?? movement.dialogueText ?? null
        const nextX = clampTilePosition(movement.x, 39)
        const nextY = clampTilePosition(movement.y, 29)
        const previousTargetX = existingResident?.targetX ?? existingResident?.x ?? nextX
        const previousTargetY = existingResident?.targetY ?? existingResident?.y ?? nextY

        residentMap.set(movement.id, {
          id: movement.id,
          name: movement.name ?? existingResident?.name ?? movement.id,
          x: previousTargetX,
          y: previousTargetY,
          targetX: nextX,
          targetY: nextY,
          color: existingResident?.color ?? colorForResident(movement.id),
          status: statusFromAction(movement.action, movement.status),
          currentBuildingId: null,
          skinColor: existingResident?.skinColor ?? null,
          hairStyle: existingResident?.hairStyle ?? null,
          hairColor: existingResident?.hairColor ?? null,
          outfitColor: existingResident?.outfitColor ?? null,
          personality: existingResident?.personality,
          mood: existingResident?.mood,
          goals: existingResident?.goals,
          dialogueText,
          currentGoal: existingResident?.currentGoal ?? null,
          coins: existingResident?.coins ?? 100,
        })
      }

      // Apply goal updates from this tick
      for (const goalUpdate of ((tickState as unknown as Record<string, unknown>).goals ?? []) as Array<{ id: string; goal: string }>) {
        const existing = residentMap.get(goalUpdate.id)
        if (existing) {
          residentMap.set(goalUpdate.id, { ...existing, currentGoal: goalUpdate.goal })
        }
      }

      // Apply energy updates from this tick
      for (const energyUpdate of (tickState.energy_updates ?? []) as EnergyUpdate[]) {
        const existing = residentMap.get(energyUpdate.id)
        if (existing) {
          residentMap.set(energyUpdate.id, { ...existing, energy: energyUpdate.energy })
        }
      }

      for (const resident of state.residents) {
        if (seenResidents.has(resident.id)) {
          continue
        }

        const previous = residentMap.get(resident.id) ?? resident
        residentMap.set(resident.id, {
          ...previous,
          currentBuildingId: previous.currentBuildingId ?? inferBuildingId(previous, state.buildings),
        })
      }

      for (const [residentId, dialogueText] of dialogueByResident.entries()) {
        const resident = residentMap.get(residentId)

        if (!resident) {
          continue
        }

        residentMap.set(residentId, {
          ...resident,
          dialogueText,
          status: 'chatting',
        })
      }

      const nextResidents = Array.from(residentMap.values())
      const historyFrame: SimulationHistoryFrame = {
        tick: tickState.tick,
        time: tickState.time,
        residents: cloneResidents(nextResidents),
      }
      const existingIndex = state.history.findIndex((frame) => frame.tick === tickState.tick)
      const history =
        existingIndex >= 0
          ? state.history.map((frame, index) => (index === existingIndex ? historyFrame : frame))
          : [...state.history, historyFrame].slice(-100)

      return {
        tick: tickState.tick,
        time: tickState.time,
        lastAppliedTick: tickState.tick,
        weather: tickState.weather ?? state.weather,
        season: tickState.season ?? state.season,
        history,
        buildings: recomputeBuildingOccupancy(state.buildings, nextResidents),
        messageFeed: appendRecentMessages(state.messageFeed, freshMessages),
        residents: nextResidents,
      }
    })
  },

  initFromSnapshot: (snapshot) => {
    set((state) => {
      // Build residents from snapshot.residents (authoritative list from backend)
      const existing = new Map(state.residents.map((r) => [r.id, r]))
      const residents: ResidentPosition[] = (snapshot.residents ?? []).map((r) => {
        const prev = existing.get(r.id)
        return {
          id: r.id,
          name: r.name,
          x: clampTilePosition(r.x ?? 0, 39),
          y: clampTilePosition(r.y ?? 0, 29),
          targetX: clampTilePosition(r.x ?? 0, 39),
          targetY: clampTilePosition(r.y ?? 0, 29),
          color: prev?.color ?? colorForResident(r.id),
          status: statusFromAction(undefined, prev?.status ?? 'idle'),
          currentBuildingId: r.location ?? null,
          skinColor: r.skin_color ?? prev?.skinColor ?? null,
          hairStyle: r.hair_style ?? prev?.hairStyle ?? null,
          hairColor: r.hair_color ?? prev?.hairColor ?? null,
          outfitColor: r.outfit_color ?? prev?.outfitColor ?? null,
          personality: r.personality ?? prev?.personality,
          mood: r.mood ?? prev?.mood ?? 'neutral',
          goals: r.goals ?? prev?.goals ?? [],
          dialogueText: prev?.dialogueText ?? null,
          coins: (r as { coins?: number }).coins ?? prev?.coins ?? 100,
          occupation: (r as { occupation?: string }).occupation ?? prev?.occupation ?? 'unemployed',
          energy: (r as { energy?: number }).energy ?? prev?.energy ?? 1.0,
        }
      })

      const buildings = recomputeBuildingOccupancy(
        (snapshot.buildings ?? []).map((building) => ({
          ...building,
          occupants: building.occupants ?? 0,
        })),
        residents,
      )
      const history =
        snapshot.tick !== undefined
          ? [
              {
                tick: snapshot.tick,
                time: snapshot.time ?? state.time,
                residents: cloneResidents(residents),
              },
            ]
          : []

      return {
        tick: snapshot.tick ?? state.tick,
        time: snapshot.time ?? state.time,
        running: snapshot.running ?? state.running,
        lastAppliedTick: snapshot.tick ?? state.lastAppliedTick,
        history,
        buildings,
        replayFrozenFrame: state.replayFrozenFrame,
        messageFeed:
          residents.length > 0
            ? appendRecentMessages(state.messageFeed, [{ id: _feedId(), kind: 'system', text: '首帧快照已到达，居民开始进入小镇。' }])
            : appendRecentMessages(state.messageFeed, [{ id: _feedId(), kind: 'system', text: '首帧快照为空，等待居民加载...' }]),
        residents,
      }
    })
  },
}))
