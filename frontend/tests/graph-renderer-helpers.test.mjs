import assert from 'node:assert/strict'

import {
  classifyRelationshipChanges,
  detectRelationshipTriangles,
} from '../src/components/graph/GraphRenderer.ts'

const previousRelationships = [
  { from_id: 'a', to_id: 'b', intensity: 0.2, type: 'friendship' },
  { from_id: 'b', to_id: 'c', intensity: 0.6, type: 'rivalry' },
  { from_id: 'c', to_id: 'a', intensity: 0.4, type: 'knows' },
  { from_id: 'c', to_id: 'd', intensity: 0.5, type: 'friendship' },
]

const nextRelationships = [
  { from_id: 'a', to_id: 'b', intensity: 0.55, type: 'friendship' },
  { from_id: 'b', to_id: 'c', intensity: 0.4, type: 'rivalry' },
  { from_id: 'c', to_id: 'a', intensity: 0.4, type: 'knows' },
  { from_id: 'd', to_id: 'a', intensity: 0.45, type: 'trust' },
]

const changes = classifyRelationshipChanges(previousRelationships, nextRelationships)

assert.deepEqual(changes.enteringKeys, ['d::a'])
assert.deepEqual(changes.exitingKeys, ['c::d'])
assert.deepEqual(changes.intensifyingKeys, ['a::b'])

const triangles = detectRelationshipTriangles([
  { from_id: 'a', to_id: 'b' },
  { from_id: 'b', to_id: 'c' },
  { from_id: 'c', to_id: 'a' },
  { from_id: 'c', to_id: 'd' },
  { from_id: 'd', to_id: 'b' },
  { from_id: 'b', to_id: 'c' },
  { from_id: 'a', to_id: 'c' },
])

assert.deepEqual(triangles, [
  ['a', 'b', 'c'],
  ['b', 'c', 'd'],
])

console.log('graph renderer helper regression passed')
