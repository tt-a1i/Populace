const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export interface Item {
  name: string
  quantity: number
  value: number
}

export interface Pet {
  id: string
  name: string
  species: string
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
  appearance?: ResidentAppearance
  wardrobe?: ClothingItem[]
  coins?: number
  occupation?: string
  wallet?: number
  job?: ResidentJob
  skills?: Record<string, number>
  inventory?: Item[]
  energy?: number
  age_days?: number
  age_stage?: string
  reputation?: number
  pets?: Pet[]
  health?: HealthState
}

export interface ResidentJob {
  title: string
  workplace_id?: string | null
  salary: number
  work_hours: number[]
  satisfaction: number
}

export interface ReplayRelationship {
  from_id: string
  to_id: string
  type: string
  intensity: number
  familiarity?: number
  reason?: string
}

export interface SimulationReplaySnapshot {
  tick: number
  time: string
  weather: string
  season: string
  residents: ApiResident[]
  relationships: ReplayRelationship[]
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

export interface FestivalRecord {
  name: string
  type: string
  start_tick: number
  duration: number
  location: string
  participants: string[]
  status: 'active' | 'completed' | string
  end_tick?: number | null
  memorial?: string | null
}

export interface FestivalListResponse {
  current: FestivalRecord[]
  history: FestivalRecord[]
}

export interface DisasterRecord {
  type: string
  severity: number
  affected_buildings: string[]
  tick_start: number
  duration: number
  casualties: number
  status: 'active' | 'completed' | string
  end_tick?: number | null
  reserve_spent?: number
  evacuations?: number
  memorial?: string | null
}

export interface DisasterSummaryRecord {
  active_count: number
  history_count: number
  affected_buildings: number
  total_casualties: number
  reserve_spent: number
  by_type: Record<string, number>
}

export interface DisasterListResponse {
  current: DisasterRecord[]
  history: DisasterRecord[]
  summary: DisasterSummaryRecord
}

export interface BulletinPostRecord {
  id: string
  author_id: string
  author_name: string
  content: string
  tick: number
  likes: string[]
  category: string
  topic: string
  subject_id: string
  tone: 'positive' | 'negative' | 'neutral' | string
}

export interface BulletinTopicRecord {
  topic: string
  label: string
  category: string
  post_count: number
  heat: number
  sentiment: 'positive' | 'negative' | 'neutral' | string
}

export interface WorldBulletinPayload {
  posts: BulletinPostRecord[]
  hot_topics: BulletinTopicRecord[]
}

export interface DiplomacyTown {
  name: string
  relation_score: number
  relation_status: string
  trade_balance: number
  ambassador_id: string | null
  ambassador_name: string | null
  specialties: string[]
}

export interface DiplomacyTradeRoute {
  id: string
  from_town: string
  to_town: string
  goods: string[]
  profit_per_tick: number
  merchant_id: string | null
  merchant_name: string | null
  relation_status: string
  rare_goods: string[]
}

export interface DiplomacyLedgerEntry {
  tick: number
  type: string
  town_name: string
  route_id: string
  amount: number
  description: string
}

export interface WorldDiplomacyPayload {
  towns: DiplomacyTown[]
  trade_routes: DiplomacyTradeRoute[]
  summary: {
    active_routes: number
    total_profit: number
    total_trade_balance: number
  }
  ledger: DiplomacyLedgerEntry[]
}

export interface PoliticsMayor {
  resident_id: string
  resident_name: string
  party: string
  term_start: number
  term_end: number
  approval: number
}

export interface PoliticsPolicy {
  type: string
  effect: Record<string, number>
  duration: number
  issued_tick?: number
}

export interface PoliticsElection {
  issue: string
  total_votes: number
  status: string
}

export interface WorldPoliticsPayload {
  mayor: PoliticsMayor | null
  active_policies: PoliticsPolicy[]
  election_countdown: number
  public_satisfaction: number
  party_distribution: Record<string, number>
  active_election: PoliticsElection | null
  impeachment_risk: boolean
}

interface VotePayload {
  issue: string
  options: string[]
  duration_ticks: number
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
  const clientId =
    typeof window !== 'undefined' ? window.sessionStorage.getItem('populace:client-id') : null
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(clientId ? { 'X-Populace-Client-Id': clientId } : {}),
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

export function getSimulationSnapshots() {
  return request<SimulationReplaySnapshot[]>('/api/simulation/snapshots')
}

export function replaySimulationTick(tick: number) {
  return request<SimulationReplaySnapshot>(`/api/simulation/replay/${tick}`, {
    method: 'POST',
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

export function createVote(payload: VotePayload) {
  return request<VoteRecord>('/api/world/vote', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getActiveVotes() {
  return request<VoteRecord[]>('/api/world/votes/active')
}

export function getVoteHistory() {
  return request<VoteRecord[]>('/api/world/votes/history')
}

export function getFestivals() {
  return request<FestivalListResponse>('/api/world/festivals')
}

export function getWorldDisasters() {
  return request<DisasterListResponse>('/api/world/disasters')
}

export function getWorldBulletin() {
  return request<WorldBulletinPayload>('/api/world/bulletin')
}

export function getWorldDiplomacy() {
  return request<WorldDiplomacyPayload>('/api/world/diplomacy')
}

export function getWorldPolitics() {
  return request<WorldPoliticsPayload>('/api/world/politics')
}

export function getResidents() {
  return request<ApiResident[]>('/api/residents')
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
  tick?: number
  type?: string
  emotional_weight?: number
  related_resident_ids?: string[]
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
  day: number
  tick: number
  summary: string
  content: string
  tags: string[]
  mood_snapshot: string
  highlight: boolean
}

export interface ResidentSkillsPayload {
  resident_id: string
  resident_name: string
  skills: Record<string, number>
}

export interface ResidentMoodLogEntry {
  tick: number
  mood: string
  cause: string
}

export interface ResidentHealthPayload {
  resident_id: string
  resident_name: string
  health: HealthState
}

export interface WorldHealthPayload {
  active_cases: number
  contagious_cases: number
  hospitalized_count: number
  treatment_rate: number
  average_hp: number
  illness_counts: Record<string, number>
  outbreak_hotspots: Array<{ location: string; cases: number; intensity: number }>
}

export interface ReputationHistoryEntry {
  tick: number
  source: string
  delta: number
  before: number
  after: number
}

export interface ResidentReputation {
  resident_id: string
  resident_name: string
  reputation: number
  title: string
  history: ReputationHistoryEntry[]
}

export interface ReputationRankingEntry {
  resident_id: string
  resident_name: string
  reputation: number
  title: string
  recent_events: string[]
}

export interface EducationCourse {
  subject: string
  name: string
  building_id?: string | null
  enrolled_tick?: number
  attendance_count?: number
}

export interface EducationHistoryEntry {
  tick: number
  subject: string
  course_name: string
}

export interface ResidentEducationPayload {
  resident_id: string
  resident_name: string
  education: {
    courses: EducationCourse[]
    knowledge_level: Record<string, number>
    course_history: EducationHistoryEntry[]
  }
}

export type WorldPetPayload = Pet

export interface TradeResidentItemPayload {
  buyer_id: string
  item_name: string
  quantity: number
}

export interface TradeResidentItemResponse {
  seller_resident: ApiResident
  buyer_resident: ApiResident
  item_name: string
  quantity: number
  total_price: number
}

export interface MarketStatsPayload {
  trade_volume: number
  total_items_traded: number
  hottest_item: string | null
  most_active_trader: string | null
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

export function getResidentMemories(
  id: string,
  options?: { page?: number; page_size?: number; memory_type?: string },
) {
  const params = new URLSearchParams()
  if (options?.page !== undefined) params.set('page', String(options.page))
  if (options?.page_size !== undefined) params.set('page_size', String(options.page_size))
  if (options?.memory_type) params.set('memory_type', options.memory_type)
  const query = params.toString()
  return request<ResidentMemory[]>(`/api/residents/${id}/memories${query ? `?${query}` : ''}`)
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

export function getResidentDiary(id: string, options?: { day?: number; limit?: number; offset?: number }) {
  const params = new URLSearchParams()
  if (options?.day !== undefined) params.set('day', String(options.day))
  if (options?.limit !== undefined) params.set('limit', String(options.limit))
  if (options?.offset !== undefined) params.set('offset', String(options.offset))
  const query = params.toString()
  return request<ResidentDiaryEntry[]>(`/api/residents/${id}/diary${query ? `?${query}` : ''}`)
}

export function getResidentSkills(id: string) {
  return request<ResidentSkillsPayload>(`/api/residents/${id}/skills`)
}

export function getResidentMoodLog(id: string) {
  return request<ResidentMoodLogEntry[]>(`/api/residents/${id}/mood-log`)
}

export function getResidentHealth(id: string) {
  return request<ResidentHealthPayload>(`/api/residents/${id}/health`)
}

export function getResidentReputation(id: string) {
  return request<ResidentReputation>(`/api/residents/${id}/reputation`)
}

export function getResidentEducation(id: string) {
  return request<ResidentEducationPayload>(`/api/residents/${id}/education`)
}

export function getResidentPets(id: string) {
  return request<Pet[]>(`/api/residents/${id}/pets`)
}

export function tradeResidentItem(id: string, payload: TradeResidentItemPayload) {
  return request<TradeResidentItemResponse>(`/api/residents/${id}/trade`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export interface FamilyMember {
  id: string
  name: string
  age_days: number
  deceased: boolean
  relation: string
}

export interface FamilyTree {
  root: FamilyMember
  parents: FamilyMember[]
  siblings: FamilyMember[]
  spouse: FamilyMember | null
  children: FamilyMember[]
}

export function getResidentFamilyTree(id: string) {
  return request<FamilyTree>(`/api/residents/${id}/family-tree`)
}

export interface ResidentFamily {
  family_name: string
  resident: FamilyMember
  members: FamilyMember[]
  tree: FamilyTree
}

export function getResidentFamily(id: string) {
  return request<ResidentFamily>(`/api/residents/${id}/family`)
}

export interface WorldFamilyMember {
  id: string
  name: string
  age_days: number
  partner_id?: string | null
  children_ids?: string[]
}

export interface WorldFamily {
  family_name: string
  member_count: number
  average_mood: number
  members: WorldFamilyMember[]
}

export function getFamilies() {
  return request<WorldFamily[]>('/api/world/families')
}

export interface CrimeLogEntry {
  type: string
  perpetrator: string
  victim: string | null
  location: string
  tick: number
  resolved: boolean
}

export interface SafetyHotspot {
  location: string
  count: number
  resolved_count: number
  intensity: number
}

export interface SafetyStats {
  safety_index: number
  average_safety_feeling: number
  total_crimes: number
  unresolved_crimes: number
  crimes_by_type: Record<string, number>
  hotspots: SafetyHotspot[]
  flagged_residents: string[]
  patrol_zones: string[]
}

export function getCrimeLog() {
  return request<CrimeLogEntry[]>('/api/world/crimes')
}

export function getSafetyStats() {
  return request<SafetyStats>('/api/world/safety')
}

export interface TransportRoad {
  from_building: string
  to_building: string
  distance: number
  road_type: string
  traffic: number
}

export interface TransportHotspot {
  road_key: string
  traffic: number
  slowdown: number
}

export interface TransportStats {
  mode_share: Record<string, number>
  average_travel_ticks: number
  congestion_hotspots: TransportHotspot[]
}

export interface WorldTransportPayload {
  roads: TransportRoad[]
  stats: TransportStats
}

export function getWorldTransport() {
  return request<WorldTransportPayload>('/api/world/transport')
}

export interface GenerationalTimelineEntry {
  tick: number
  type: string
  resident_id?: string | null
  resident_name: string
  summary: string
}

export interface WorldDemographicsPayload {
  age_distribution: Record<string, number>
  aging_index: number
  average_age: number
  retired_count: number
  recent_deaths: number
  generational_timeline: GenerationalTimelineEntry[]
}

export function getWorldDemographics() {
  return request<WorldDemographicsPayload>('/api/world/demographics')
}

export interface RelationshipHistoryPoint {
  tick: number
  time: string
  intensity: number
  rel_type: string
  dialogue: string | null
}

export interface RelationshipHistory {
  from_id: string
  to_id: string
  from_name: string
  to_name: string
  points: RelationshipHistoryPoint[]
}

export function getRelationshipHistory(id1: string, id2: string) {
  return request<RelationshipHistory>(`/api/residents/${id1}/relationship-history/${id2}`)
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

export interface DialogueHistoryEntry {
  id: string
  tick: number
  time: string
  from_id: string
  from_name: string
  to_id: string
  to_name: string
  text: string
  kind: 'dialogue' | 'gossip' | 'monologue'
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

export function getDialogueHistory() {
  return request<DialogueHistoryEntry[]>('/api/simulation/dialogue-history')
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
  level?: number
  upgrades?: string[]
  decoration_score?: number
}

export interface ZoneData {
  id: string
  name: string
  type: 'residential' | 'commercial' | 'leisure' | 'education' | string
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  atmosphere: {
    noise: number
    safety: number
    beauty: number
  }
  resident_count: number
  building_count: number
  dominant_building_types: string[]
}

export interface WorldEducationCourse {
  subject: string
  name: string
  building_id?: string | null
  registration_count: number
}

export interface CultureEvent {
  type: string
  name: string
  venue_id: string
  organizer_id: string
  participants: string[]
  tick_start: number
  duration: number
}

export interface CultureProsperityPoint {
  tick: number
  prosperity_index: number
}

export interface CultureTalentRanking {
  resident_id: string
  resident_name: string
  artistic_talent: number
  art_skill: number
  art_knowledge?: number
}

export interface WorldCulturePayload {
  events: CultureEvent[]
  prosperity_index: number
  prosperity_history: CultureProsperityPoint[]
  talent_rankings: CultureTalentRanking[]
}

export interface ReligionDistribution {
  religion: string
  label: string
  count: number
  share: number
}

export interface MoralityPoint {
  tick: number
  morality_index: number
}

export interface ReligiousEvent {
  religion: string
  event_type: string
  name: string
  venue_id: string
  leader_id: string
  participants: string[]
  tick_start: number
  duration: number
  town_mood_boost: number
  morality_boost: number
}

export interface ReligionLeader {
  resident_id: string
  resident_name: string
  religion: string
  piety: number
  reputation: number
}

export interface WorldReligionPayload {
  distribution: ReligionDistribution[]
  morality_index: number
  morality_history: MoralityPoint[]
  events: ReligiousEvent[]
  leaders: ReligionLeader[]
}

export function getWorldEducation() {
  return request<WorldEducationCourse[]>('/api/world/education')
}

export function getWorldCulture() {
  return request<WorldCulturePayload>('/api/world/culture')
}

export function getWorldReligion() {
  return request<WorldReligionPayload>('/api/world/religion')
}

export function getWorldHealth() {
  return request<WorldHealthPayload>('/api/world/health')
}

export function getWorldPets() {
  return request<WorldPetPayload[]>('/api/world/pets')
}

export function getZones() {
  return request<ZoneData[]>('/api/world/zones')
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

export interface BuildingOccupantInfo {
  id: string
  name: string
  occupation: string
  mood: string
  status: string
}

export interface BuildingVisitRecord {
  resident_id: string
  resident_name: string
  action: string
  tick: number
}

export interface BuildingDetailData {
  id: string
  type: string
  name: string
  capacity: number
  position: [number, number]
  occupants: number
  level: number
  upgrades: string[]
  decoration_score: number
  next_level: number | null
  required_reserve: number
  reserve_ready: boolean
  vote_passed: boolean
  special_feature: string | null
  visit_willingness: number
  current_residents: BuildingOccupantInfo[]
  recent_visits: BuildingVisitRecord[]
}

export function getBuildingDetails(id: string) {
  return request<BuildingDetailData>(`/api/buildings/${id}/details`)
}

export interface BuildingUpgradeData {
  id: string
  type: string
  name: string
  level: number
  capacity: number
  upgrades: string[]
  decoration_score: number
  next_level: number | null
  required_reserve: number
  reserve_ready: boolean
  vote_passed: boolean
  can_upgrade: boolean
  special_feature: string | null
}

export function getBuildingUpgrades() {
  return request<BuildingUpgradeData[]>('/api/world/buildings/upgrades')
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
  category: string
  unlocked: boolean
  unlocked_at_tick: number | null
}

export interface AchievementLeaderboardEntry {
  resident_id: string
  resident_name: string
  unlocked_count: number
  achievements: ResidentAchievement[]
}

export function getResidentAchievements(id: string) {
  return request<ResidentAchievement[]>(`/api/residents/${id}/achievements`)
}

export interface ResidentJobPayload {
  resident_id: string
  resident_name: string
  wallet: number
  job: ResidentJob
}

export interface WorldEconomyPayload {
  employment_rate: number
  average_income: number
  gdp: number
  unemployed_count: number
  employed_count: number
  employment_distribution: Array<{ occupation: string; count: number }>
  income_distribution: Array<{ bucket: string; count: number }>
  gdp_history: Array<{ tick: number; gdp: number }>
}

export interface FashionTrend {
  color_name: string
  color: string
  style: string
  category: string
  started_tick: number
}

export interface FashionRankingEntry {
  resident_id: string
  resident_name: string
  style_score: number
  clothing: string
  current_outfit: string
  accent_color: string
  trend_match: boolean
  designed_by_tailor: boolean
}

export interface FashionConsumptionEntry {
  tick: number
  resident_id: string
  resident_name: string
  price: number
  category: string
  color_name: string
  style: string
  item_name: string
  designed_by?: string | null
}

export interface WorldFashionPayload {
  current_trend: FashionTrend
  trend_history: FashionTrend[]
  rankings: FashionRankingEntry[]
  consumption: {
    total_purchases: number
    total_spent: number
    average_spend: number
    top_category?: string | null
    top_color?: string | null
    recent_purchases: FashionConsumptionEntry[]
  }
}

export function getAchievementLeaderboard() {
  return request<AchievementLeaderboardEntry[]>('/api/world/achievements/leaderboard')
}

export function getResidentJob(id: string) {
  return request<ResidentJobPayload>(`/api/residents/${id}/job`)
}

export function getWorldEconomy() {
  return request<WorldEconomyPayload>('/api/world/economy')
}

export function getWorldFashion() {
  return request<WorldFashionPayload>('/api/world/fashion')
}

export function getReputationRankings() {
  return request<ReputationRankingEntry[]>('/api/world/reputation/rankings')
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

export function getMarketStats() {
  return request<MarketStatsPayload>('/api/simulation/market-stats')
}

export interface PerformanceMetrics {
  avg_tick_duration_ms: number
  max_tick_duration_ms: number
  active_agents_count: number
  pending_llm_calls: number
  memory_usage_mb: number
  websocket_connections: number
  adaptive_throttle_active: boolean
  tick_history: number[]
}

export function getPerformanceMetrics() {
  return request<PerformanceMetrics>('/api/simulation/performance')
}

export interface SocialIndicators {
  gini_coefficient: number
  social_cohesion: number
  happiness_index: number
  population: number
  avg_mood_score: number
  total_coins: number
  avg_energy: number
  total_relationships: number
}

export function getSocialIndicators() {
  return request<SocialIndicators>('/api/simulation/social-indicators')
}

export interface NewspaperArticle {
  section: string
  headline: string
  content: string
  icon: string
}

export interface NewspaperData {
  day: number
  date_label: string
  headline: string
  articles: NewspaperArticle[]
  generated_at: string
}

export function getNewspaper(day: number) {
  return request<NewspaperData>(`/api/report/newspaper/${day}`)
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

// ---------------------------------------------------------------------------
// What-If Analysis
// ---------------------------------------------------------------------------

export interface WhatIfEventParam {
  description: string
}

export interface WhatIfResidentMod {
  resident_id: string
  mood?: string
  energy?: number
  coins?: number
}

export interface WhatIfResidentSnapshot {
  id: string
  name: string
  mood: string
  coins: number
  energy: number
  occupation: string
  x: number
  y: number
}

export interface WhatIfRelationshipSnapshot {
  from_id: string
  to_id: string
  type: string
  intensity: number
}

export interface WhatIfStateSnapshot {
  tick: number
  population: number
  avg_mood_score: number
  total_coins: number
  total_relationships: number
  gini_coefficient: number
  residents: WhatIfResidentSnapshot[]
  relationships: WhatIfRelationshipSnapshot[]
}

export interface WhatIfResponse {
  ticks_simulated: number
  current: WhatIfStateSnapshot
  predicted: WhatIfStateSnapshot
}

export function runWhatIf(params: {
  ticks?: number
  events?: WhatIfEventParam[]
  resident_mods?: WhatIfResidentMod[]
}) {
  return request<WhatIfResponse>('/api/simulation/what-if', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export interface ChatReply {
  reply: string
  resident_id: string
  resident_name: string
}

export function chatWithResident(residentId: string, message: string) {
  return request<ChatReply>(`/api/residents/${residentId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

// ── Simulation Rules ─────────────────────────────────────────────────
export interface RuleCondition {
  field: string
  operator: string
  value: string
}

export interface RuleAction {
  action: string
  value: string
}

export interface SimulationRule {
  id: string
  name: string
  description: string
  conditions: RuleCondition[]
  actions: RuleAction[]
  enabled: boolean
  times_fired: number
}

export function getRules() {
  return request<SimulationRule[]>('/api/simulation/rules')
}

export function createRule(payload: {
  name: string
  description?: string
  conditions: RuleCondition[]
  actions: RuleAction[]
  enabled?: boolean
}) {
  return request<SimulationRule>('/api/simulation/rules', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function toggleRule(ruleId: string, enabled: boolean) {
  return request<SimulationRule>(`/api/simulation/rules/${ruleId}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  })
}

export function deleteRule(ruleId: string) {
  return request<{ status: string; id: string }>(`/api/simulation/rules/${ruleId}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Memory search
// ---------------------------------------------------------------------------

export function searchResidentMemories(residentId: string, q: string) {
  return request<ResidentMemory[]>(
    `/api/residents/${residentId}/memories/search?q=${encodeURIComponent(q)}`,
  )
}

// ---------------------------------------------------------------------------
// Knowledge Graph
// ---------------------------------------------------------------------------

export interface KnowledgeGraphNode {
  id: string
  label: string
  type: 'resident' | 'building' | 'event'
  metadata: Record<string, unknown>
}

export interface KnowledgeGraphEdge {
  source: string
  target: string
  label: string
  tick: number
}

export interface KnowledgeGraphData {
  nodes: KnowledgeGraphNode[]
  edges: KnowledgeGraphEdge[]
}

export function getKnowledgeGraph(sinceTick?: number, untilTick?: number) {
  const params = new URLSearchParams()
  if (sinceTick !== undefined) params.set('since_tick', String(sinceTick))
  if (untilTick !== undefined) params.set('until_tick', String(untilTick))
  const qs = params.toString()
  return request<KnowledgeGraphData>(`/api/simulation/knowledge-graph${qs ? `?${qs}` : ''}`)
}
