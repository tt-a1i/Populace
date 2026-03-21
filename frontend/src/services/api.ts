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
  skin_color?: string | null
  hair_style?: string | null
  hair_color?: string | null
  outfit_color?: string | null
  coins?: number
  occupation?: string
}

interface SpeedPayload {
  speed: 1 | 2 | 5 | 10 | 50
}

interface EventPayload {
  description?: string
  source?: string
  preset_id?: string
}

export interface ActiveEvent {
  id: string
  name: string
  description: string
  radius: number
  remaining_ticks: number
}

export interface PresetEvent {
  id: string
  name: string
  description: string
  radius: number
  duration: number
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

export interface ExperimentHotspot {
  name: string
  visits: number
  interaction_score: number
}

export interface ExperimentReportStats {
  days: number
  start_tick: number
  end_tick: number
  node_count: number
  edge_count: number
  density_start: number
  density_end: number
  density_change: number
  triangle_count: number
  dominant_mood: string
  relation_type_distribution: Record<string, number>
  social_hotspots: ExperimentHotspot[]
  recorded_ticks: number
}

export interface ExperimentReportPayload {
  title: string
  sections: ReportSection[]
  stats: ExperimentReportStats
  generated_at: string
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

export function startSimulation(scene = 'modern_community') {
  return request('/api/simulation/start', {
    method: 'POST',
    body: JSON.stringify({ scene }),
  })
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

export function injectPresetEvent(preset_id: string) {
  return request('/api/world/events', {
    method: 'POST',
    body: JSON.stringify({ preset_id }),
  })
}

export function getActiveEvents() {
  return request<ActiveEvent[]>('/api/world/events/active')
}

export function getPresetEvents() {
  return request<PresetEvent[]>('/api/world/events/presets')
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

export interface ResidentMemory {
  id: string
  content: string
  timestamp: string
  importance: number
  emotion: string
}

export interface ResidentRelationship {
  from_id: string
  to_id: string
  type: string
  intensity: number
  familiarity: number
  reason: string
  since: string
  counterpart_name: string
  direction: 'outgoing' | 'incoming'
}

export interface ResidentReflection {
  id: string
  summary: string
  timestamp: string
  derived_from: string[]
}

export interface ResidentDiaryEntry {
  id: string
  date: string
  tick: number
  summary: string
}

export interface SimulationResidentStat {
  id: string
  name: string
  relationship_count: number
  relationship_intensity: number
}

export interface StrongestRelationshipStat {
  from_id: string
  from_name: string
  to_id: string
  to_name: string
  type: string
  intensity: number
}

export interface SimulationStats {
  total_ticks: number
  total_dialogues: number
  total_relationship_changes: number
  active_events: number
  average_mood_score: number
  most_social_resident: SimulationResidentStat | null
  loneliest_resident: SimulationResidentStat | null
  strongest_relationship: StrongestRelationshipStat | null
  total_memories: number
}

export function getResidentMemories(id: string) {
  return request<ResidentMemory[]>(`/api/residents/${id}/memories`)
}

export function patchResidentAttributes(
  id: string,
  attrs: { name?: string; personality?: string; mood?: string; goals?: string[] },
) {
  return request<ApiResident>(`/api/residents/${id}/attributes`, {
    method: 'PATCH',
    body: JSON.stringify(attrs),
  })
}

export function injectResidentMemory(
  id: string,
  payload: { content: string; importance?: number; emotion?: string },
) {
  return request<ResidentMemory>(`/api/residents/${id}/inject-memory`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function teleportResident(id: string, x: number, y: number) {
  return request<ApiResident>(`/api/residents/${id}/teleport`, {
    method: 'POST',
    body: JSON.stringify({ x, y }),
  })
}

export function getResidentRelationships(id: string) {
  return request<ResidentRelationship[]>(`/api/residents/${id}/relationships`)
}

export function getResidentReflections(id: string) {
  return request<ResidentReflection[]>(`/api/residents/${id}/reflections`)
}

export function getResidentDiary(id: string) {
  return request<ResidentDiaryEntry[]>(`/api/residents/${id}/diary`)
}

export function getSimulationStats() {
  return request<SimulationStats>('/api/simulation/stats')
}

export interface MoodHistoryEntry {
  tick: number
  resident_id: string
  resident_name: string
  mood: string
}

export interface NetworkAnalysisEntry {
  resident_id: string
  name: string
  relationship_count: number
  outgoing_count: number
  incoming_count: number
  avg_intensity: number
  influence_score: number
}

export function getMoodHistory() {
  return request<MoodHistoryEntry[]>('/api/simulation/mood-history')
}

export function getNetworkAnalysis() {
  return request<NetworkAnalysisEntry[]>('/api/simulation/network-analysis')
}

export interface BuildingData {
  id: string
  type: string
  name: string
  capacity: number
  position: [number, number]
}

export interface AddBuildingPayload {
  id?: string
  type: string
  name: string
  capacity: number
  position: [number, number]
}

export function getBuildings() {
  return request<BuildingData[]>('/api/world/buildings')
}

export function addBuilding(payload: AddBuildingPayload) {
  return request<BuildingData>('/api/world/buildings', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function removeBuilding(id: string) {
  return request<void>(`/api/world/buildings/${id}`, { method: 'DELETE' })
}

export function generateReport() {
  return request<ReportPayload>('/api/report/generate', { method: 'POST' })
}

export function getLatestReport() {
  return request<ReportPayload>('/api/report/latest')
}

export function generateExperimentReport(days: number) {
  return request<ExperimentReportPayload>('/api/report/experiment', {
    method: 'POST',
    body: JSON.stringify({ days }),
  })
}

// ---------------------------------------------------------------------------
// Custom scenario
// ---------------------------------------------------------------------------

export interface ScenarioBuilding {
  id: string
  type: string
  name: string
  capacity: number
  position: [number, number]
}

export interface ScenarioResident {
  id: string
  name: string
  personality: string
  goals?: string[]
  mood?: string
  home_id?: string
  x?: number
  y?: number
  skin_color?: string | null
  hair_style?: string | null
  hair_color?: string | null
  outfit_color?: string | null
}

export interface ScenarioData {
  name: string
  description?: string
  buildings: ScenarioBuilding[]
  residents: ScenarioResident[]
  map?: {
    width?: number
    height?: number
    roads?: Array<{ x: number; y: number; width: number; height: number }>
    water?: Array<{ x: number; y: number; width: number; height: number }>
  }
}

export function generateScenario(description: string) {
  return request<ScenarioData>('/api/world/generate-scenario', {
    method: 'POST',
    body: JSON.stringify({ description }),
  })
}

export function startCustomSimulation(scenario: ScenarioData) {
  return request('/api/simulation/start-custom', {
    method: 'POST',
    body: JSON.stringify(scenario),
  })
}

// ---------------------------------------------------------------------------
// Save system
// ---------------------------------------------------------------------------

export interface SaveMeta {
  id: string
  name: string
  created_at: string
  tick: number
}

export function saveGame(name: string) {
  return request<SaveMeta>('/api/saves', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export function listSaves() {
  return request<SaveMeta[]>('/api/saves')
}

export function loadSave(id: string) {
  return request('/api/saves/' + id + '/load', { method: 'POST' })
}

export function deleteSave(id: string) {
  return request('/api/saves/' + id, { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// Resident creation
// ---------------------------------------------------------------------------

export interface ResidentCreatePayload {
  name: string
  personality: string
  mood?: string
  home_building_id?: string
  initial_relationships?: Array<{ resident_id: string; type: string; intensity: number }>
}

export function createResident(payload: ResidentCreatePayload) {
  return request<ApiResident>('/api/residents/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export interface ResidentAchievement {
  id: string
  name: string
  description: string
  icon: string
  unlocked: boolean
}

export function getResidentAchievements(id: string) {
  return request<ResidentAchievement[]>(`/api/residents/${id}/achievements`)
}

export function transferCoins(fromId: string, toId: string, amount: number) {
  return request<ApiResident>(`/api/residents/${fromId}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ to_id: toId, amount }),
  })
}

export interface OccupationDistEntry {
  occupation: string
  count: number
}

export interface EconomyStats {
  total_coins: number
  avg_coins: number
  richest: string | null
  poorest: string | null
  occupation_distribution: OccupationDistEntry[]
}

export function getEconomyStats() {
  return request<EconomyStats>('/api/simulation/economy-stats')
}

export interface MemoirPayload {
  resident_id: string
  resident_name: string
  content: string
  generated_at: string
}

export function generateMemoir(residentId: string) {
  return request<MemoirPayload>(`/api/report/memoir/${residentId}`, { method: 'POST' })
}

export interface TimelineEvent {
  id: string
  event_type: string
  description: string
  tick: number
  time: string
  metadata: Record<string, unknown>
}

export function getTimeline() {
  return request<TimelineEvent[]>('/api/simulation/timeline')
}

export interface LlmKeyStatus {
  configured: boolean
}

export function getLlmKeyStatus() {
  return request<LlmKeyStatus>('/api/settings/llm-key')
}

export function setLlmKey(api_key: string) {
  return request<LlmKeyStatus>('/api/settings/llm-key', {
    method: 'POST',
    body: JSON.stringify({ api_key }),
  })
}

// ---------------------------------------------------------------------------
// Director's Console
// ---------------------------------------------------------------------------

export function injectEmotion(residentId: string, emotion: string, reason?: string) {
  return request<ApiResident>('/api/director/inject-emotion', {
    method: 'POST',
    body: JSON.stringify({ resident_id: residentId, emotion, reason: reason ?? '' }),
  })
}

export interface ForceEncounterResult {
  event_description: string
  location: string
}

export function forceEncounter(aId: string, bId: string, buildingId?: string) {
  return request<ForceEncounterResult>('/api/director/force-encounter', {
    method: 'POST',
    body: JSON.stringify({ resident_a_id: aId, resident_b_id: bId, location_building_id: buildingId ?? '' }),
  })
}

export interface SpreadRumorResult {
  ok: boolean
  effect: string
}

export function spreadRumor(targetId: string, listenerId: string, content: string, isPositive: boolean) {
  return request<SpreadRumorResult>('/api/director/spread-rumor', {
    method: 'POST',
    body: JSON.stringify({ target_id: targetId, listener_id: listenerId, content, is_positive: isPositive }),
  })
}

export function triggerJealousy(residentId: string, rivalId: string) {
  return request<ApiResident>('/api/director/trigger-jealousy', {
    method: 'POST',
    body: JSON.stringify({ resident_id: residentId, rival_id: rivalId }),
  })
}

// ---------------------------------------------------------------------------
// Quest system
// ---------------------------------------------------------------------------

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

export interface QuestStartResponse {
  ok: boolean
  quest_id: string
  message: string
}

export function listQuests() {
  return request<QuestInfo[]>('/api/quests')
}

export function startQuest(questId: string, params?: Record<string, string>) {
  return request<QuestStartResponse>(`/api/quests/${questId}/start`, {
    method: 'POST',
    body: JSON.stringify({ params: params ?? {} }),
  })
}

export function getActiveQuests() {
  return request<ActiveQuest[]>('/api/quests/active')
}

export function abandonQuest(questId: string) {
  return request<{ ok: boolean; quest_id: string; message: string }>(`/api/quests/${questId}/abandon`, {
    method: 'POST',
  })
}
