import { create } from 'zustand'

import type { Building, DialogueUpdate, MovementUpdate, Resident, TickState } from '../types'

export type SimulationSpeed = 0 | 1 | 2 | 5
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
  dialogueText?: string | null
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
  buildings?: Building[]
  residents?: Array<{
    id: string
    name: string
    x?: number
    y?: number
    mood?: string
    personality?: string
    location?: string | null
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
  residents: ResidentPosition[]
  replayFrozenFrame: FrozenSimulationFrame | null
  messageFeed: string[]
  selectedResidentId: string | null
  hoveredPairIds: [string, string] | null
  setRunning: (running: boolean) => void
  setSpeed: (speed: SimulationSpeed) => void
  selectResident: (residentId: string | null) => void
  setHoveredPairIds: (pairIds: [string, string] | null) => void
  freezeForReplay: () => void
  resumeLiveFromReplay: () => void
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

function appendRecentMessages(existing: string[], incoming: string[]): string[] {
  if (incoming.length === 0) {
    return existing
  }

  return [...existing, ...incoming].slice(-5)
}

export const useSimulationStore = create<SimulationState>((set) => ({
  tick: 16,
  tickPerDay: 48,
  time: 'Day 1, 08:00',
  running: true,
  speed: 1,
  lastAppliedTick: 0,
  residents: [],
  replayFrozenFrame: null,
  messageFeed: [
    '等待居民进入场景...',
    '连接建立后，这里会滚动显示最新事件与对话。',
  ],
  selectedResidentId: null,
  hoveredPairIds: null,
  setRunning: (running) => set({ running }),
  setSpeed: (speed) => set({ speed, running: speed !== 0 }),
  selectResident: (residentId) => set({ selectedResidentId: residentId }),
  setHoveredPairIds: (pairIds) => set({ hoveredPairIds: pairIds }),
  freezeForReplay: () =>
    set((state) => ({
      replayFrozenFrame: {
        residents: state.residents,
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
  updateFromTick: (tickState) => {
    set((state) => {
      const residentMap = new Map(state.residents.map((resident) => [resident.id, resident]))
      const dialogueByResident = new Map<string, string>()
      const freshMessages: string[] = []

      for (const dialogue of tickState.dialogues ?? []) {
        if (!dialogueByResident.has(dialogue.to_id)) {
          dialogueByResident.set(dialogue.to_id, '💬')
        }
        dialogueByResident.set(dialogue.from_id, dialogue.text)
        const fromName = residentMap.get(dialogue.from_id)?.name ?? dialogue.from_id
        const toName = residentMap.get(dialogue.to_id)?.name ?? dialogue.to_id
        freshMessages.push(`${fromName} 对 ${toName} 说：${dialogue.text}`)
      }

      for (const event of tickState.events ?? []) {
        freshMessages.push(`事件：${event.description}`)
      }

      for (const movement of tickState.movements) {
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
          dialogueText,
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

      return {
        tick: tickState.tick,
        time: tickState.time,
        lastAppliedTick: tickState.tick,
        messageFeed: appendRecentMessages(state.messageFeed, freshMessages),
        residents: Array.from(residentMap.values()),
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
          dialogueText: prev?.dialogueText ?? null,
        }
      })

        return {
          tick: snapshot.tick ?? state.tick,
          time: snapshot.time ?? state.time,
          running: snapshot.running ?? state.running,
          lastAppliedTick: snapshot.tick ?? state.lastAppliedTick,
          replayFrozenFrame: state.replayFrozenFrame,
          messageFeed:
            residents.length > 0
              ? appendRecentMessages(state.messageFeed, ['首帧快照已到达，居民开始进入小镇。'])
              : appendRecentMessages(state.messageFeed, ['首帧快照为空，等待居民加载...']),
          residents,
        }
      })
  },
}))
