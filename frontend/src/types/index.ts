export interface MovementUpdate {
  id: string
  x: number
  y: number
  action: string
  outfit_color?: string | null
  appearance?: ResidentAppearance | null
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

export interface Pet {
  id: string
  name: string
  species: 'cat' | 'dog' | 'bird' | 'rabbit' | string
  owner_id?: string | null
  mood?: string
  hunger?: number
  location?: string | null
  x?: number
  y?: number
}

export interface Illness {
  type: string
  contagious?: boolean
  severity?: number
}

export interface HealthState {
  hp: number
  illness?: Illness | null
  recovery_tick: number
}

export interface ResidentAppearance {
  hair: string
  clothing: string
  style_score: number
}

export interface ClothingItem {
  id: string
  name: string
  category: string
  color_name: string
  color: string
  style: string
  price: number
  quality: number
  designed_by?: string | null
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
  appearance?: ResidentAppearance
  wardrobe?: ClothingItem[]
  coins?: number
  occupation?: string
  skills?: Record<string, number>
  inventory?: Item[]
  energy?: number
  age_days?: number
  goals?: string[]
  reputation?: number
  pets?: Pet[]
  health?: HealthState
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

export interface Festival {
  name: string
  type: string
  start_tick: number
  duration: number
  location: string
  participants: string[]
  status?: string
  end_tick?: number | null
  memorial?: string | null
}

export interface FestivalUpdate {
  festival: Festival
  status: 'started' | 'ended' | string
  memorial?: string | null
}

export interface Disaster {
  type: string
  severity: number
  affected_buildings: string[]
  tick_start: number
  duration: number
  casualties: number
  status?: string
  end_tick?: number | null
  reserve_spent?: number
  evacuations?: number
  memorial?: string | null
}

export interface DisasterUpdate {
  disaster: Disaster
  status: 'started' | 'ended' | string
  memorial?: string | null
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
  festival_updates?: FestivalUpdate[]
  disaster_updates?: DisasterUpdate[]
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
  appearance?: ResidentAppearance
  wardrobe?: ClothingItem[]
  coins?: number
  occupation?: string
  skills?: Record<string, number>
  inventory?: Item[]
  energy?: number
  age_days?: number
  safety_feeling?: number
  flagged_for_crime?: boolean
  reputation?: number
  pets?: Pet[]
  health?: HealthState
}

export interface Building {
  id: string
  type: string
  name: string
  capacity: number
  position: [number, number]
  level?: number
  upgrades?: string[]
  decoration_score?: number
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
