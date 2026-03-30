import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockGetActiveEvents, mockGetZones, mockGetWorldTransport } = vi.hoisted(() => ({
  mockGetActiveEvents: vi.fn().mockResolvedValue([]),
  mockGetZones: vi.fn().mockResolvedValue([]),
  mockGetWorldTransport: vi.fn().mockResolvedValue({
    roads: [],
    stats: { mode_share: {}, average_travel_ticks: 0, congestion_hotspots: [] },
  }),
}))

vi.mock('pixi.js', () => ({
  Application: class {
    canvas = document.createElement('canvas')
    renderer = { resize: vi.fn() }
    async init() {}
    destroy() {}
  },
}))

vi.mock('../components/town/TownRenderer', () => ({
  TownRenderer: class {
    static instances: unknown[] = []

    constructor() {
      ;(this.constructor as unknown as { instances: unknown[] }).instances.push(this)
    }

    syncBuildings = vi.fn()
    syncResidents = vi.fn()
    updateSimulationMeta = vi.fn()
    setFollowTarget = vi.fn()
    setHighlightedResidents = vi.fn()
    resize = vi.fn()
    destroy = vi.fn()
    updateWeather = vi.fn()
    setPlaceholderBuildings = vi.fn()
    syncZones = vi.fn()
    setSelectedZone = vi.fn()
    setActiveFestival = vi.fn()
    setActiveDisasters = vi.fn()
    showEventRadii = vi.fn()
    syncTransport = vi.fn()
    drawRelationshipLines = vi.fn()
    setHeatmapEnabled = vi.fn()
    recordHeatmapTick = vi.fn()
    triggerMilestone = vi.fn()
    redrawTiles = vi.fn()
    getFollowedResidentId = vi.fn().mockReturnValue(null)
    screenToTile = vi.fn()
  },
}))

vi.mock('../services/api', () => ({
  getActiveEvents: mockGetActiveEvents,
  getZones: mockGetZones,
  getWorldTransport: mockGetWorldTransport,
  injectEvent: vi.fn(),
}))

vi.mock('../audio', () => ({
  useSound: () => ({ enabled: true, play: vi.fn(), toggleEnabled: vi.fn() }),
}))

vi.mock('../components/ui/ToastProvider', () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}))

vi.mock('../stores/simulation', () => ({
  useSimulationStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        buildings: [{ id: 'home1', type: 'home', name: '家园', capacity: 4, position: [4, 5] }],
        residents: [],
        tick: 12,
        tickPerDay: 48,
        time: 'Day 1, 12:00',
        running: true,
        selectedResidentId: null,
        speed: 1,
        hoveredPairIds: null,
        weather: 'rainy',
        season: 'spring',
        currentFestival: null,
        currentDisasters: [
          {
            type: 'fire',
            severity: 0.78,
            affected_buildings: ['home1'],
            tick_start: 12,
            duration: 8,
            casualties: 1,
            status: 'active',
            reserve_spent: 22,
            evacuations: 2,
          },
        ],
        messageFeed: [],
        replayFrozenFrame: null,
        getFrameByTick: vi.fn().mockReturnValue(null),
        getSnapshotByTick: vi.fn().mockReturnValue(null),
        selectResident: vi.fn(),
      }),
    {
      getState: () => ({
        buildings: [{ id: 'home1', type: 'home', name: '家园', capacity: 4, position: [4, 5] }],
        residents: [],
        tick: 12,
        tickPerDay: 48,
        time: 'Day 1, 12:00',
        running: true,
        selectedResidentId: null,
        speed: 1,
        hoveredPairIds: null,
        weather: 'rainy',
        season: 'spring',
        currentFestival: null,
        currentDisasters: [
          {
            type: 'fire',
            severity: 0.78,
            affected_buildings: ['home1'],
            tick_start: 12,
            duration: 8,
            casualties: 1,
            status: 'active',
            reserve_spent: 22,
            evacuations: 2,
          },
        ],
      }),
    },
  ),
}))

vi.mock('../stores/relationships', () => ({
  useRelationshipsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      relationships: [],
      history: [],
      replayTick: null,
    }),
}))

import { TownCanvas } from '../components/town/TownCanvas'

class MockResizeObserver {
  observe() {}
  disconnect() {}
}

describe('TownCanvas disaster overlay wiring', () => {
  it('forwards active disasters to the renderer', async () => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    render(<TownCanvas />)

    const rendererClass = (await import('../components/town/TownRenderer')).TownRenderer as unknown as {
      instances: Array<{ setActiveDisasters: ReturnType<typeof vi.fn> }>
    }

    await waitFor(() => {
      expect(rendererClass.instances[0]?.setActiveDisasters).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'fire',
          affected_buildings: ['home1'],
        }),
      ])
    })
  })
})
