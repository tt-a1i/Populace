export interface MovementUpdate {
  id: string
  x: number
  y: number
  action: string
}

export interface DialogueUpdate {
  from_id: string
  to_id: string
  text: string
  kind?: 'dialogue' | 'gossip' | 'monologue'
}

export interface GossipUpdate {
  speaker_id: string
  listener_id: string
  target_id: string
  target_name: string
  content: string
  is_positive: boolean
}

export interface RelationshipDelta {
  from_id: string
  to_id: string
  type: string
  delta: number
}

export interface EventUpdate {
  description: string
}

export interface Item {
  name: string
  quantity: number
  value: number
}

export interface EnergyUpdate {
  id: string
  energy: number
}

export interface PopulationResidentSnapshot {
  id: string
  name: string
  personality: string
  mood: string
  location: string | null
  x: number
  y: number
  home_building_id?: string | null
  skin_color?: string | null
  hair_style?: string | null
  hair_color?: string | null
  outfit_color?: string | null
  coins?: number
  occupation?: string
  skills?: Record<string, number>
  inventory?: Item[]
  energy?: number
  age_days?: number
  goals?: string[]
}

export interface PopulationEvent {
  event_type: 'birth' | 'death'
  resident_id: string
  resident_name: string
  resident: PopulationResidentSnapshot
  parent_ids?: string[]
  parent_names?: string[]
  summary?: string
}

export interface VoteRecord {
  id: string
  issue: string
  options: string[]
  counts: Record<string, number>
  status: 'active' | 'completed'
  start_tick: number
  end_tick: number
  winning_option: string | null
  result_announced: boolean
  total_votes: number
  effects?: string[]
}

export interface TickState {
  tick: number
  time: string
  movements: MovementUpdate[]
  dialogues: DialogueUpdate[]
  relationships: RelationshipDelta[]
  events: EventUpdate[]
  weather: string
  season?: string
  energy_updates?: EnergyUpdate[]
  gossips?: GossipUpdate[]
  population_events?: PopulationEvent[]
  vote_updates?: VoteRecord[]
  vote_announcements?: VoteRecord[]
}

export interface Resident {
  id: string
  name: string
  personality: string
  goals: string[]
  mood: string
  location: string | null
  x: number
  y: number
  skin_color?: string | null
  hair_style?: string | null
  hair_color?: string | null
  outfit_color?: string | null
  coins?: number
  occupation?: string
  skills?: Record<string, number>
  inventory?: Item[]
  energy?: number
  age_days?: number
  safety_feeling?: number
  flagged_for_crime?: boolean
}

export interface Building {
  id: string
  type: string
  name: string
  capacity: number
  position: [number, number]
  occupants?: number
}

export interface ZoneBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ZoneAtmosphere {
  noise: number
  safety: number
  beauty: number
}

export interface Zone {
  id: string
  name: string
  type: 'residential' | 'commercial' | 'leisure' | 'education' | string
  bounds: ZoneBounds
  atmosphere: ZoneAtmosphere
  resident_count: number
  building_count: number
  dominant_building_types?: string[]
}

export interface ResidentMovement extends MovementUpdate {
  name?: string
  dialogueText?: string | null
  mood?: string
}

export interface QuestInfo {
  id: string
  name: string
  description: string
  icon: string
  status: 'available' | 'active' | 'completed'
  requires_params: boolean
}

export interface ActiveQuest {
  quest_id: string
  name: string
  icon: string
  description: string
  progress: number
  progress_text: string
  remaining_ticks: number
  status: string
}
