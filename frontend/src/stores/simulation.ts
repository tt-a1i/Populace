import { create } from 'zustand'

import i18n from '../i18n/config'
import type { SimulationReplaySnapshot } from '../services/api'
import type {
  Building,
  Disaster,
  DisasterUpdate,
  DialogueUpdate,
  EnergyUpdate,
  Festival,
  FestivalUpdate,
  HealthState,
  MovementUpdate,
  Pet,
  PopulationEvent,
  Resident,
  TickState,
  VoteRecord,
} from '../types'

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
  appearance?: Resident['appearance']
  wardrobe?: Resident['wardrobe']
  personality?: string
  mood?: string
  goals?: string[]
  dialogueText?: string | null
  dialogueKind?: 'dialogue' | 'gossip' | 'monologue'
  currentGoal?: string | null   // active short-term goal for thought bubble
  coins?: number
  wallet?: number
  job?: {
    title?: string
    workplace_id?: string | null
    salary?: number
    work_hours?: number[]
    satisfaction?: number
  }
  occupation?: string
  energy?: number
  ageDays?: number
  reputation?: number
  skills?: Record<string, number>
  inventory?: Resident['inventory']
  pets?: Pet[]
  health?: HealthState
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
    weather: string
    season: string
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
    appearance?: Resident['appearance']
    wardrobe?: Resident['wardrobe']
    coins?: number
    occupation?: string
    skills?: Record<string, number>
    inventory?: Resident['inventory']
    energy?: number
    age_days?: number
    reputation?: number
    pets?: Pet[]
    health?: HealthState
  }>
  last_tick?: SimulationTickState | null
  active_votes?: VoteRecord[]
  vote_history?: VoteRecord[]
  active_festivals?: Festival[]
  festival_history?: Festival[]
  active_disasters?: Disaster[]
  disaster_history?: Disaster[]
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
  snapshotHistory: SimulationReplaySnapshot[]
  buildings: Array<Building & { occupants: number }>
  replayFrozenFrame: FrozenSimulationFrame | null
  messageFeed: FeedMessage[]
  activeVotes: VoteRecord[]
  voteHistory: VoteRecord[]
  currentFestival: Festival | null
  festivalHistory: Festival[]
  currentDisasters: Disaster[]
  disasterHistory: Disaster[]
  selectedResidentId: string | null
  hoveredPairIds: [string, string] | null
  setRunning: (running: boolean) => void
  setSpeed: (speed: SimulationSpeed) => void
  setBuildings: (buildings: Array<Building & { occupants: number }>) => void
  selectResident: (residentId: string | null) => void
  setHoveredPairIds: (pairIds: [string, string] | null) => void
  setActiveVotes: (votes: VoteRecord[]) => void
  setVoteHistory: (votes: VoteRecord[]) => void
  applyVoteTick: (votes: VoteRecord[], announcements: VoteRecord[]) => void
  applyFestivalTick: (updates: FestivalUpdate[]) => void
  applyDisasterTick: (updates: DisasterUpdate[]) => void
  applyResidentOperation: (
    resident: Partial<ResidentPosition> & { id: string; name?: string },
    operation: 'resident_updated' | 'resident_teleported',
  ) => void
  freezeForReplay: () => void
  resumeLiveFromReplay: () => void
  getFrameByTick: (tick: number) => SimulationHistoryFrame | null
  getSnapshotByTick: (tick: number) => SimulationReplaySnapshot | null
  setSnapshotHistory: (snapshots: SimulationReplaySnapshot[]) => void
  upsertReplaySnapshot: (snapshot: SimulationReplaySnapshot) => void
  updateFromTick: (tickState: SimulationTickState) => void
  initFromSnapshot: (snapshot: SimulationSnapshot) => void
  applyPopulationEvents: (events: PopulationEvent[]) => void
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

function residentPositionFromPopulationSnapshot(
  resident: PopulationEvent['resident'],
  previous?: ResidentPosition,
): ResidentPosition {
  const x = clampTilePosition(resident.x ?? 0, 39)
  const y = clampTilePosition(resident.y ?? 0, 29)
  return {
    id: resident.id,
    name: resident.name,
    x,
    y,
    targetX: x,
    targetY: y,
    color: previous?.color ?? colorForResident(resident.id),
    status: previous?.status ?? 'idle',
    currentBuildingId: resident.location ?? null,
    skinColor: resident.skin_color ?? previous?.skinColor ?? null,
    hairStyle: resident.hair_style ?? previous?.hairStyle ?? null,
    hairColor: resident.hair_color ?? previous?.hairColor ?? null,
    outfitColor: resident.outfit_color ?? previous?.outfitColor ?? null,
    appearance: resident.appearance ?? previous?.appearance,
    wardrobe: resident.wardrobe ?? previous?.wardrobe ?? [],
    personality: resident.personality ?? previous?.personality,
    mood: resident.mood ?? previous?.mood ?? 'neutral',
    goals: resident.goals ?? previous?.goals ?? [],
    dialogueText: previous?.dialogueText ?? null,
    coins: resident.coins ?? previous?.coins ?? 100,
    occupation: resident.occupation ?? previous?.occupation ?? 'unemployed',
    inventory: resident.inventory ?? previous?.inventory ?? [],
    energy: resident.energy ?? previous?.energy ?? 1.0,
    ageDays: resident.age_days ?? previous?.ageDays ?? 0,
    reputation: resident.reputation ?? previous?.reputation ?? 0,
    pets: resident.pets ?? previous?.pets ?? [],
    health: resident.health ?? previous?.health,
  }
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
  snapshotHistory: [],
  buildings: [],
  replayFrozenFrame: null,
  messageFeed: [
    { id: 'init-1', kind: 'system' as FeedMessageKind, text: i18n.t('message_bar.init_1') },
    { id: 'init-2', kind: 'system' as FeedMessageKind, text: i18n.t('message_bar.init_2') },
  ],
  activeVotes: [],
  voteHistory: [],
  currentFestival: null,
  festivalHistory: [],
  currentDisasters: [],
  disasterHistory: [],
  selectedResidentId: null,
  hoveredPairIds: null,
  setRunning: (running) => set({ running }),
  setSpeed: (speed) => set({ speed, running: speed !== 0 }),
  setBuildings: (buildings) => set({ buildings }),
  selectResident: (residentId) => set({ selectedResidentId: residentId }),
  setHoveredPairIds: (pairIds) => set({ hoveredPairIds: pairIds }),
  setActiveVotes: (votes) => set({ activeVotes: votes }),
  setVoteHistory: (votes) => set({ voteHistory: votes }),
  applyVoteTick: (votes, announcements) =>
    set((state) => ({
      activeVotes: votes,
      voteHistory: [...announcements, ...state.voteHistory.filter((item) => !announcements.some((entry) => entry.id === item.id))].slice(0, 20),
    })),
  applyFestivalTick: (updates) =>
    set((state) => {
      if (updates.length === 0) {
        return state
      }
      let currentFestival = state.currentFestival
      let festivalHistory = [...state.festivalHistory]
      for (const update of updates) {
        if (update.status === 'started') {
          currentFestival = { ...update.festival, status: 'active' }
        } else if (update.status === 'ended') {
          if (currentFestival?.name === update.festival.name) {
            currentFestival = null
          }
          festivalHistory = [{ ...update.festival, status: 'completed', memorial: update.memorial ?? update.festival.memorial ?? null }, ...festivalHistory]
            .filter((festival, index, items) => index === items.findIndex((item) => item.name === festival.name && item.start_tick === festival.start_tick))
            .slice(0, 20)
        }
      }
      return { currentFestival, festivalHistory }
    }),
  applyDisasterTick: (updates) =>
    set((state) => {
      if (updates.length === 0) {
        return state
      }
      let currentDisasters = [...state.currentDisasters]
      let disasterHistory = [...state.disasterHistory]
      for (const update of updates) {
        if (update.status === 'started') {
          currentDisasters = [
            { ...update.disaster, status: 'active' },
            ...currentDisasters.filter(
              (disaster) =>
                !(disaster.type === update.disaster.type && disaster.tick_start === update.disaster.tick_start),
            ),
          ].slice(0, 10)
        } else if (update.status === 'ended') {
          currentDisasters = currentDisasters.filter(
            (disaster) =>
              !(disaster.type === update.disaster.type && disaster.tick_start === update.disaster.tick_start),
          )
          disasterHistory = [
            { ...update.disaster, status: 'completed', memorial: update.memorial ?? update.disaster.memorial ?? null },
            ...disasterHistory,
          ]
            .filter(
              (disaster, index, items) =>
                index ===
                items.findIndex(
                  (item) => item.type === disaster.type && item.tick_start === disaster.tick_start,
                ),
            )
            .slice(0, 20)
        }
      }
      return { currentDisasters, disasterHistory }
    }),
  applyResidentOperation: (resident, operation) =>
    set((state) => {
      const nextResidents = state.residents.map((currentResident) => {
        if (currentResident.id !== resident.id) {
          return currentResident
        }

        const nextX = clampTilePosition(resident.x ?? currentResident.targetX, 39)
        const nextY = clampTilePosition(resident.y ?? currentResident.targetY, 29)

        return {
          ...currentResident,
          name: resident.name ?? currentResident.name,
          targetX: nextX,
          targetY: nextY,
          x: operation === 'resident_teleported' ? nextX : currentResident.x,
          y: operation === 'resident_teleported' ? nextY : currentResident.y,
          personality: resident.personality ?? currentResident.personality,
          mood: resident.mood ?? currentResident.mood,
          goals: resident.goals ?? currentResident.goals,
          occupation: resident.occupation ?? currentResident.occupation,
          appearance: (resident as { appearance?: Resident['appearance'] }).appearance ?? currentResident.appearance,
          wardrobe: (resident as { wardrobe?: Resident['wardrobe'] }).wardrobe ?? currentResident.wardrobe,
          inventory: resident.inventory ?? currentResident.inventory,
          energy: resident.energy ?? currentResident.energy,
          ageDays: resident.ageDays ?? currentResident.ageDays,
          reputation: resident.reputation ?? currentResident.reputation,
          pets: resident.pets ?? currentResident.pets,
          currentBuildingId:
            resident.currentBuildingId ??
            ((resident as { location?: string | null }).location !== undefined
              ? (resident as { location?: string | null }).location
              : currentResident.currentBuildingId),
        }
      })

      return {
        residents: nextResidents,
        buildings: recomputeBuildingOccupancy(state.buildings, nextResidents),
      }
    }),
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
          weather: state.weather,
          season: state.season,
        },
      },
    })),
  resumeLiveFromReplay: () => set({ replayFrozenFrame: null }),
  getFrameByTick: (tick) => get().history.find((frame) => frame.tick === tick) ?? null,
  getSnapshotByTick: (tick) => get().snapshotHistory.find((snapshot) => snapshot.tick === tick) ?? null,
  setSnapshotHistory: (snapshots) =>
    set({
      snapshotHistory: [...snapshots]
        .sort((a, b) => a.tick - b.tick)
        .filter((snapshot, index, items) => index === items.findIndex((item) => item.tick === snapshot.tick)),
    }),
  upsertReplaySnapshot: (snapshot) =>
    set((state) => ({
      snapshotHistory: [...state.snapshotHistory.filter((item) => item.tick !== snapshot.tick), snapshot]
        .sort((a, b) => a.tick - b.tick)
        .slice(-50),
    })),
  updateFromTick: (tickState) => {
    set((state) => {
      const residentMap = new Map(state.residents.map((resident) => [resident.id, resident]))
      const dialogueByResident = new Map<string, { text: string; kind: string }>()
      const freshMessages: FeedMessage[] = []
      const seenResidents = new Set<string>()

      for (const dialogue of tickState.dialogues ?? []) {
        if (!dialogueByResident.has(dialogue.to_id)) {
          dialogueByResident.set(dialogue.to_id, { text: '💬', kind: 'dialogue' })
        }
        dialogueByResident.set(dialogue.from_id, { text: dialogue.text, kind: dialogue.kind ?? 'dialogue' })
        const fromName = residentMap.get(dialogue.from_id)?.name ?? dialogue.from_id
        const toName = residentMap.get(dialogue.to_id)?.name ?? dialogue.to_id
        freshMessages.push({ id: _feedId(), kind: 'dialogue', text: i18n.t('message_bar.dialogue', { from: fromName, to: toName, text: dialogue.text }) })
      }

      for (const g of tickState.gossips ?? []) {
        dialogueByResident.set(g.listener_id, { text: g.content, kind: 'gossip' })
        const speakerName = residentMap.get(g.speaker_id)?.name ?? g.speaker_id
        freshMessages.push({ id: _feedId(), kind: 'event', text: i18n.t('message_bar.gossip', { speaker: speakerName, target: g.target_name }) })
      }

      for (const event of tickState.events ?? []) {
        freshMessages.push({ id: _feedId(), kind: 'event', text: i18n.t('message_bar.event', { desc: event.description }) })
      }

      for (const movement of tickState.movements) {
        seenResidents.add(movement.id)
        const existingResident = residentMap.get(movement.id)
        const dialogueEntry = dialogueByResident.get(movement.id)
        const dialogueText = dialogueEntry?.text ?? movement.dialogueText ?? null
        const dialogueKind = (dialogueEntry?.kind ?? 'dialogue') as ResidentPosition['dialogueKind']
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
          outfitColor: movement.outfit_color ?? existingResident?.outfitColor ?? null,
          appearance: movement.appearance ?? existingResident?.appearance,
          wardrobe: existingResident?.wardrobe ?? [],
          personality: existingResident?.personality,
          mood: existingResident?.mood,
          goals: existingResident?.goals,
          dialogueText,
          dialogueKind,
          currentGoal: existingResident?.currentGoal ?? null,
          coins: existingResident?.coins ?? 100,
          occupation: existingResident?.occupation ?? 'unemployed',
          inventory: existingResident?.inventory ?? [],
          energy: existingResident?.energy ?? 1.0,
          ageDays: existingResident?.ageDays ?? 0,
          reputation: existingResident?.reputation ?? 0,
          pets: existingResident?.pets ?? [],
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

      for (const [residentId, dialogueEntry] of dialogueByResident.entries()) {
        const resident = residentMap.get(residentId)

        if (!resident) {
          continue
        }

        residentMap.set(residentId, {
          ...resident,
          dialogueText: dialogueEntry.text,
          dialogueKind: dialogueEntry.kind as ResidentPosition['dialogueKind'],
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
        activeVotes: tickState.vote_updates ?? state.activeVotes,
        voteHistory:
          tickState.vote_announcements && tickState.vote_announcements.length > 0
            ? [...tickState.vote_announcements, ...state.voteHistory.filter((item) => !tickState.vote_announcements?.some((entry) => entry.id === item.id))].slice(0, 20)
            : state.voteHistory,
        currentFestival:
          tickState.festival_updates?.find((entry) => entry.status === 'started')?.festival
            ? { ...tickState.festival_updates.find((entry) => entry.status === 'started')!.festival, status: 'active' }
            : tickState.festival_updates?.some((entry) => entry.status === 'ended')
              ? null
              : state.currentFestival,
        festivalHistory:
          tickState.festival_updates && tickState.festival_updates.some((entry) => entry.status === 'ended')
            ? [
                ...tickState.festival_updates
                  .filter((entry) => entry.status === 'ended')
                  .map((entry) => ({ ...entry.festival, status: 'completed', memorial: entry.memorial ?? entry.festival.memorial ?? null })),
                ...state.festivalHistory,
              ].slice(0, 20)
            : state.festivalHistory,
        currentDisasters:
          tickState.disaster_updates && tickState.disaster_updates.length > 0
            ? tickState.disaster_updates.reduce<Array<Disaster>>((current, entry) => {
                if (entry.status === 'started') {
                  return [
                    { ...entry.disaster, status: 'active' },
                    ...current.filter(
                      (disaster) =>
                        !(disaster.type === entry.disaster.type && disaster.tick_start === entry.disaster.tick_start),
                    ),
                  ].slice(0, 10)
                }
                if (entry.status === 'ended') {
                  return current.filter(
                    (disaster) =>
                      !(disaster.type === entry.disaster.type && disaster.tick_start === entry.disaster.tick_start),
                  )
                }
                return current
              }, state.currentDisasters)
            : state.currentDisasters,
        disasterHistory:
          tickState.disaster_updates && tickState.disaster_updates.some((entry) => entry.status === 'ended')
            ? [
                ...tickState.disaster_updates
                  .filter((entry) => entry.status === 'ended')
                  .map((entry) => ({
                    ...entry.disaster,
                    status: 'completed',
                    memorial: entry.memorial ?? entry.disaster.memorial ?? null,
                  })),
                ...state.disasterHistory,
              ]
                .filter(
                  (disaster, index, items) =>
                    index ===
                    items.findIndex(
                      (item) => item.type === disaster.type && item.tick_start === disaster.tick_start,
                    ),
                )
                .slice(0, 20)
            : state.disasterHistory,
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
          appearance: (r as { appearance?: Resident['appearance'] }).appearance ?? prev?.appearance,
          wardrobe: (r as { wardrobe?: Resident['wardrobe'] }).wardrobe ?? prev?.wardrobe ?? [],
          personality: r.personality ?? prev?.personality,
          mood: r.mood ?? prev?.mood ?? 'neutral',
          goals: r.goals ?? prev?.goals ?? [],
          dialogueText: prev?.dialogueText ?? null,
          coins: (r as { coins?: number }).coins ?? prev?.coins ?? 100,
          occupation: (r as { occupation?: string }).occupation ?? prev?.occupation ?? 'unemployed',
          skills: (r as { skills?: Record<string, number> }).skills ?? prev?.skills ?? {},
          inventory: (r as { inventory?: Resident['inventory'] }).inventory ?? prev?.inventory ?? [],
          energy: (r as { energy?: number }).energy ?? prev?.energy ?? 1.0,
          ageDays: (r as { age_days?: number }).age_days ?? prev?.ageDays ?? 0,
          reputation: (r as { reputation?: number }).reputation ?? prev?.reputation ?? 0,
          pets: (r as { pets?: Pet[] }).pets ?? prev?.pets ?? [],
          health: (r as { health?: HealthState }).health ?? prev?.health,
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
        weather: (snapshot as { weather?: string }).weather ?? state.weather,
        season: (snapshot as { season?: string }).season ?? state.season,
        history,
        buildings,
        activeVotes: snapshot.active_votes ?? state.activeVotes,
        voteHistory: snapshot.vote_history ?? state.voteHistory,
        currentFestival: snapshot.active_festivals?.[0] ?? state.currentFestival,
        festivalHistory: snapshot.festival_history ?? state.festivalHistory,
        currentDisasters: snapshot.active_disasters ?? state.currentDisasters,
        disasterHistory: snapshot.disaster_history ?? state.disasterHistory,
        replayFrozenFrame: state.replayFrozenFrame,
        messageFeed:
          residents.length > 0
            ? appendRecentMessages(state.messageFeed, [{ id: _feedId(), kind: 'system', text: i18n.t('message_bar.snapshot_arrived') }])
            : appendRecentMessages(state.messageFeed, [{ id: _feedId(), kind: 'system', text: i18n.t('message_bar.snapshot_empty') }]),
        residents,
      }
    })
  },
  applyPopulationEvents: (events) => {
    if (events.length === 0) {
      return
    }
    set((state) => {
      const residentMap = new Map(state.residents.map((resident) => [resident.id, resident]))
      for (const event of events) {
        if (event.event_type === 'death') {
          residentMap.delete(event.resident_id)
          continue
        }
        residentMap.set(
          event.event_type === 'birth' ? event.resident_id : event.resident.id,
          residentPositionFromPopulationSnapshot(event.resident, residentMap.get(event.resident_id)),
        )
      }
      const nextResidents = Array.from(residentMap.values())
      return {
        residents: nextResidents,
        buildings: recomputeBuildingOccupancy(state.buildings, nextResidents),
      }
    })
  },
}))
