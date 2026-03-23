import type { GraphRelationship, GraphResident } from '../../stores/relationships'

export type GraphFilterType = 'all' | 'friendship' | 'rivalry' | 'love' | 'knows'

export const graphTypeOptions: readonly GraphFilterType[] = [
  'all',
  'friendship',
  'rivalry',
  'love',
  'knows',
]

export function calculateNetworkStats(
  residents: GraphResident[],
  relationships: GraphRelationship[],
): { density: number; averagePathLength: number; largestComponentSize: number } {
  const nodeIds = residents.map((resident) => resident.id)
  if (nodeIds.length <= 1) {
    return { density: 0, averagePathLength: 0, largestComponentSize: nodeIds.length }
  }

  const adjacency = new Map<string, Set<string>>(nodeIds.map((nodeId) => [nodeId, new Set<string>()]))
  const undirectedEdges = new Set<string>()

  for (const relationship of relationships) {
    adjacency.get(relationship.from_id)?.add(relationship.to_id)
    adjacency.get(relationship.to_id)?.add(relationship.from_id)
    undirectedEdges.add([relationship.from_id, relationship.to_id].sort().join('::'))
  }

  const visited = new Set<string>()
  const componentSizes: number[] = []
  let pathLengthTotal = 0
  let pathPairCount = 0

  for (const start of nodeIds) {
    if (!visited.has(start)) {
      const stack = [start]
      visited.add(start)
      let size = 0
      while (stack.length > 0) {
        const current = stack.pop()
        if (!current) continue
        size += 1
        for (const neighbor of adjacency.get(current) ?? []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor)
            stack.push(neighbor)
          }
        }
      }
      componentSizes.push(size)
    }

    const queue: Array<{ nodeId: string; distance: number }> = [{ nodeId: start, distance: 0 }]
    const seen = new Set([start])
    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) continue
      for (const neighbor of adjacency.get(current.nodeId) ?? []) {
        if (seen.has(neighbor)) continue
        seen.add(neighbor)
        const distance = current.distance + 1
        queue.push({ nodeId: neighbor, distance })
        if (neighbor > start) {
          pathLengthTotal += distance
          pathPairCount += 1
        }
      }
    }
  }

  const possibleEdges = (nodeIds.length * (nodeIds.length - 1)) / 2
  return {
    density: possibleEdges === 0 ? 0 : undirectedEdges.size / possibleEdges,
    averagePathLength: pathPairCount === 0 ? 0 : pathLengthTotal / pathPairCount,
    largestComponentSize: Math.max(0, ...componentSizes),
  }
}

export function filterGraphData(
  residents: GraphResident[],
  relationships: GraphRelationship[],
  filter: { type: GraphFilterType; minIntensity: number },
): { residents: GraphResident[]; relationships: GraphRelationship[] } {
  const visibleRelationships = relationships.filter((relationship) => {
    if (relationship.intensity < filter.minIntensity) {
      return false
    }

    if (filter.type === 'all') {
      return true
    }

    return relationship.type === filter.type
  })

  const visibleResidentIds = new Set<string>()
  for (const relationship of visibleRelationships) {
    visibleResidentIds.add(relationship.from_id)
    visibleResidentIds.add(relationship.to_id)
  }

  return {
    residents: residents.filter((resident) => visibleResidentIds.has(resident.id) || resident.deceased),
    relationships: visibleRelationships,
  }
}
