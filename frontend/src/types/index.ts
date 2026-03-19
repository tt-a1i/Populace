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

export interface TickState {
  tick: number
  time: string
  movements: MovementUpdate[]
  dialogues: DialogueUpdate[]
  relationships: RelationshipDelta[]
  events: EventUpdate[]
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
}

export interface Building {
  id: string
  type: string
  name: string
  capacity: number
  position: [number, number]
}

export interface ResidentMovement extends MovementUpdate {
  name?: string
  dialogueText?: string | null
  mood?: string
}
