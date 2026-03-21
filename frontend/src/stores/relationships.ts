import { create } from 'zustand'

import type { RelationshipDelta } from '../types'

export type ResidentMood = 'happy' | 'sad' | 'angry' | 'neutral'
export type RelationshipType =
  | 'love'
  | 'friendship'
  | 'rivalry'
  | 'knows'
  | 'trust'
  | 'fear'
  | 'dislike'

export interface GraphResident {
  id: string
  name: string
  mood: ResidentMood
}

export interface GraphRelationship {
  from_id: string
  to_id: string
  type: RelationshipType
  intensity: number
  reason: string
}

export interface RelationshipTickState {
  tick?: number
  relationships?: Array<RelationshipDelta & { reason?: string }>
}

export interface RelationshipSnapshot {
  tick: number
  relationships: GraphRelationship[]
}

interface RelationshipsState {
  residents: GraphResident[]
  relationships: GraphRelationship[]
  history: RelationshipSnapshot[]
  lastAppliedTick: number
  replayTick: number | null
  updateFromTick: (tickState: RelationshipTickState) => void
  initFromSnapshot: (residents: Array<{ id: string; name: string; mood?: string }>) => void
  setRelationshipsAbsolute: (
    rels: Array<{ from_id: string; to_id: string; type: string; intensity: number; reason?: string }>,
  ) => void
  setReplayTick: (tick: number | null) => void
}

const seedResidents: GraphResident[] = [
  { id: 'r-ava', name: 'Ava', mood: 'happy' },
  { id: 'r-milo', name: 'Milo', mood: 'angry' },
  { id: 'r-juno', name: 'Juno', mood: 'neutral' },
  { id: 'r-lina', name: 'Lina', mood: 'sad' },
  { id: 'r-noah', name: 'Noah', mood: 'happy' },
]

const seedRelationships: GraphRelationship[] = [
  { from_id: 'r-ava', to_id: 'r-milo', type: 'friendship', intensity: 0.84, reason: '常在河岸步道闲聊' },
  { from_id: 'r-milo', to_id: 'r-lina', type: 'rivalry', intensity: 0.62, reason: '都想接手社区花园项目' },
  { from_id: 'r-juno', to_id: 'r-noah', type: 'love', intensity: 0.91, reason: '夜晚在码头看流星后迅速升温' },
  { from_id: 'r-ava', to_id: 'r-juno', type: 'knows', intensity: 0.38, reason: '晨间咖啡时偶尔会打招呼' },
  { from_id: 'r-noah', to_id: 'r-lina', type: 'friendship', intensity: 0.57, reason: '一起筹备周末露天电影' },
]

function clampIntensity(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function normalizeType(value: string): RelationshipType {
  switch (value) {
    case 'love':
    case 'friendship':
    case 'rivalry':
    case 'trust':
    case 'fear':
    case 'dislike':
      return value
    default:
      return 'knows'
  }
}

function relationshipKey(fromId: string, toId: string): string {
  return `${fromId}::${toId}`
}

export const useRelationshipsStore = create<RelationshipsState>((set) => ({
  residents: seedResidents,
  relationships: seedRelationships,
  history: [],
  lastAppliedTick: 0,
  replayTick: null,
  setReplayTick: (tick) => set({ replayTick: tick }),
  updateFromTick: (tickState) => {
    const relationshipUpdates = tickState.relationships

    if (!relationshipUpdates?.length && tickState.tick === undefined) {
      return
    }

    set((state) => {
      const nextRelationships = new Map(
        state.relationships.map((relationship) => [
          relationshipKey(relationship.from_id, relationship.to_id),
          relationship,
        ]),
      )

      for (const update of relationshipUpdates ?? []) {
        const key = relationshipKey(update.from_id, update.to_id)
        const current = nextRelationships.get(key)
        const nextType = normalizeType(update.type)
        const nextIntensity = clampIntensity((current?.intensity ?? 0) + update.delta)

        if (nextIntensity <= 0) {
          nextRelationships.delete(key)
          continue
        }

        nextRelationships.set(key, {
          from_id: update.from_id,
          to_id: update.to_id,
          type: nextType,
          intensity: nextIntensity,
          reason:
            update.reason ??
            current?.reason ??
            (current ? '关系仍在波动' : '新的互动正在形成'),
        })
      }

      const nextRelationshipList = Array.from(nextRelationships.values()).map((relationship) => ({
        ...relationship,
      }))
      const nextTick = tickState.tick ?? state.lastAppliedTick
      let nextHistory = state.history

      if (tickState.tick !== undefined) {
        const snapshot = {
          tick: nextTick,
          relationships: nextRelationshipList.map((relationship) => ({ ...relationship })),
        }
        const existingIndex = state.history.findIndex((item) => item.tick === nextTick)

        if (existingIndex >= 0) {
          nextHistory = state.history.map((item, index) => (index === existingIndex ? snapshot : item))
        } else {
          nextHistory = [...state.history, snapshot].slice(-100)
        }
      }

      return {
        history: nextHistory,
        lastAppliedTick: nextTick,
        relationships: nextRelationshipList,
      }
    })
  },

  initFromSnapshot: (residents) => {
    set({
      // Replace mock residents with the authoritative backend list
      residents: residents.map((r) => ({
        id: r.id,
        name: r.name,
        mood: (r.mood ?? 'neutral') as ResidentMood,
      })),
      // Clear mock relationships; real ones accumulate via tick deltas
      relationships: [],
      history: [],
      lastAppliedTick: 0,
      replayTick: null,
    })
  },

  setRelationshipsAbsolute: (rels) => {
    set({
      relationships: rels.map((r) => ({
        from_id: r.from_id,
        to_id: r.to_id,
        type: normalizeType(r.type),
        intensity: clampIntensity(r.intensity),
        reason: r.reason ?? '',
      })),
    })
  },
}))
