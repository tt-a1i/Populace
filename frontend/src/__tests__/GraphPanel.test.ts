import { describe, expect, it } from 'vitest'

import { calculateNetworkStats, filterGraphData } from '../components/graph/graphHelpers'
import type { GraphRelationship, GraphResident } from '../stores/relationships'

type FilterGraphData = (
  residents: GraphResident[],
  relationships: GraphRelationship[],
  filter: { type: 'all' | 'friendship' | 'rivalry' | 'love' | 'knows'; minIntensity: number },
) => { residents: GraphResident[]; relationships: GraphRelationship[] }

const residents: GraphResident[] = [
  { id: 'a', name: 'Ada', mood: 'happy' },
  { id: 'b', name: 'Ben', mood: 'neutral' },
  { id: 'c', name: 'Cora', mood: 'sad' },
  { id: 'd', name: 'Drew', mood: 'angry' },
  { id: 'e', name: 'Eli', mood: 'happy' },
]

const relationships: GraphRelationship[] = [
  { from_id: 'a', to_id: 'b', type: 'friendship', intensity: 0.82, reason: '早餐搭子' },
  { from_id: 'b', to_id: 'c', type: 'rivalry', intensity: 0.61, reason: '项目竞争' },
  { from_id: 'c', to_id: 'd', type: 'knows', intensity: 0.22, reason: '见过几次' },
  { from_id: 'd', to_id: 'e', type: 'love', intensity: 0.68, reason: '湖边约会' },
  { from_id: 'c', to_id: 'e', type: 'trust', intensity: 0.91, reason: '共同保密' },
]

describe('GraphPanel filtering helpers', () => {
  it('exports a graph filtering helper for the panel', () => {
    expect(filterGraphData as FilterGraphData).toBeTypeOf('function')
  })

  it('keeps all real relationship types when the type filter is all', () => {
    expect(filterGraphData).toBeTypeOf('function')

    const result = filterGraphData(residents, relationships, { type: 'all', minIntensity: 0.3 })

    expect(result.relationships.map((relationship) => relationship.type)).toEqual([
      'friendship',
      'rivalry',
      'love',
      'trust',
    ])
    expect(result.residents.map((resident) => resident.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('keeps only the selected type and its related residents', () => {
    expect(filterGraphData).toBeTypeOf('function')

    const result = filterGraphData(residents, relationships, { type: 'friendship', minIntensity: 0.3 })

    expect(result.relationships.map((relationship) => relationship.type)).toEqual(['friendship'])
    expect(result.residents.map((resident) => resident.id)).toEqual(['a', 'b'])
  })

  it('removes edges below the active intensity threshold', () => {
    expect(filterGraphData).toBeTypeOf('function')

    const result = filterGraphData(residents, relationships, { type: 'all', minIntensity: 0.7 })

    expect(result.relationships).toEqual([
      expect.objectContaining({ type: 'friendship', intensity: 0.82 }),
      expect.objectContaining({ type: 'trust', intensity: 0.91 }),
    ])
    expect(result.residents.map((resident) => resident.id)).toEqual(['a', 'b', 'c', 'e'])
  })

  it('keeps deceased residents visible even after their links disappear', () => {
    const filterGraphData = getFilterGraphData()
    expect(filterGraphData).toBeTypeOf('function')
    if (!filterGraphData) {
      return
    }

    const result = filterGraphData(
      [...residents, { id: 'ghost', name: 'Ghost', mood: 'neutral', deceased: true }],
      [],
      { type: 'all', minIntensity: 0 },
    )

    expect(result.residents.map((resident) => resident.id)).toContain('ghost')
  })

  it('computes network density, average path length, and largest connected component', () => {
    expect(calculateNetworkStats).toBeTypeOf('function')

    const stats = calculateNetworkStats(residents, [
      { from_id: 'a', to_id: 'b', type: 'friendship', intensity: 0.8, reason: '' },
      { from_id: 'b', to_id: 'c', type: 'friendship', intensity: 0.8, reason: '' },
      { from_id: 'c', to_id: 'a', type: 'friendship', intensity: 0.8, reason: '' },
      { from_id: 'd', to_id: 'e', type: 'knows', intensity: 0.4, reason: '' },
    ])

    expect(stats.density).toBeCloseTo(0.4, 5)
    expect(stats.averagePathLength).toBeCloseTo(1, 5)
    expect(stats.largestComponentSize).toBe(3)
  })
})
