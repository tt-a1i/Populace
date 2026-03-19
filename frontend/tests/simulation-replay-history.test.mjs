import assert from 'node:assert/strict'

import { useSimulationStore } from '../src/stores/simulation.ts'

function resetSimulationStore() {
  useSimulationStore.setState({
    tick: 16,
    tickPerDay: 48,
    time: 'Day 1, 08:00',
    running: true,
    speed: 1,
    lastAppliedTick: 0,
    residents: [],
    replayFrozenFrame: null,
    messageFeed: [],
    selectedResidentId: null,
    hoveredPairIds: null,
  })
}

resetSimulationStore()

useSimulationStore.getState().initFromSnapshot({
  tick: 0,
  time: 'Day 1, 08:00',
  residents: [
    { id: 'r-ava', name: 'Ava', x: 1, y: 1 },
    { id: 'r-milo', name: 'Milo', x: 2, y: 2 },
  ],
})

useSimulationStore.getState().updateFromTick({
  tick: 10,
  time: 'Day 1, 10:00',
  movements: [
    { id: 'r-ava', name: 'Ava', x: 3, y: 4, action: 'walking' },
    { id: 'r-milo', name: 'Milo', x: 5, y: 2, action: 'walking' },
  ],
})

useSimulationStore.getState().updateFromTick({
  tick: 11,
  time: 'Day 1, 10:30',
  movements: [
    { id: 'r-ava', name: 'Ava', x: 4, y: 4, action: 'walking' },
    { id: 'r-milo', name: 'Milo', x: 5, y: 3, action: 'walking' },
  ],
})

const simulationState = useSimulationStore.getState()

assert.ok(Array.isArray(simulationState.history), 'simulation store should retain a replay history')
assert.equal(
  typeof simulationState.getFrameByTick,
  'function',
  'simulation store should expose getFrameByTick(tick)',
)

const replayFrame = simulationState.getFrameByTick(10)

assert.ok(replayFrame, 'replay frame for tick 10 should exist')
assert.equal(replayFrame.tick, 10)
assert.equal(replayFrame.time, 'Day 1, 10:00')
assert.deepEqual(
  replayFrame.residents.map((resident) => ({
    id: resident.id,
    targetX: resident.targetX,
    targetY: resident.targetY,
  })),
  [
    { id: 'r-ava', targetX: 3, targetY: 4 },
    { id: 'r-milo', targetX: 5, targetY: 2 },
  ],
)

for (let tick = 12; tick <= 111; tick += 1) {
  useSimulationStore.getState().updateFromTick({
    tick,
    time: `Day 1, ${tick}`,
    movements: [
      { id: 'r-ava', name: 'Ava', x: tick % 10, y: 4, action: 'walking' },
      { id: 'r-milo', name: 'Milo', x: 5, y: tick % 8, action: 'walking' },
    ],
  })
}

const cappedHistoryState = useSimulationStore.getState()

assert.equal(cappedHistoryState.history.length, 100, 'replay history should cap at 100 frames')
assert.equal(cappedHistoryState.history[0]?.tick, 12, 'oldest replay frame should roll forward')

console.log('simulation replay history regression passed')
