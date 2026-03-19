const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export interface ApiResident {
  id: string
  name: string
  personality?: string
  mood?: string
  goals?: string[]
  location?: string | null
  x?: number
  y?: number
}

interface SpeedPayload {
  speed: 1 | 2 | 5
}

interface EventPayload {
  description: string
  source?: string
}

interface ResidentUpdatePayload {
  name?: string
  personality?: string
  mood?: string
  goals?: string[]
}

export interface ReportSection {
  heading: string
  content: string
}

export interface ReportPayload {
  title: string
  sections: ReportSection[]
  generated_at: string
  tick: number
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

export function startSimulation() {
  return request('/api/simulation/start', { method: 'POST' })
}

export function stopSimulation() {
  return request('/api/simulation/stop', { method: 'POST' })
}

export function setSpeed(payload: SpeedPayload) {
  return request('/api/simulation/speed', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function injectEvent(payload: EventPayload) {
  return request('/api/world/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getResidents() {
  return request('/api/residents')
}

export function updateResident(id: string, payload: ResidentUpdatePayload) {
  return request(`/api/residents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function generateReport() {
  return request<ReportPayload>('/api/report/generate', { method: 'POST' })
}

export function getLatestReport() {
  return request<ReportPayload>('/api/report/latest')
}
