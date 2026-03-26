import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockScreenToTile, mockInjectEvent, mockPushToast, mockPlay, mockGetActiveEvents, mockGetZones, mockGetWorldTransport } = vi.hoisted(() => ({
  mockScreenToTile: vi.fn(),
  mockInjectEvent: vi.fn().mockResolvedValue({}),
  mockGetActiveEvents: vi.fn().mockResolvedValue([{ id: 'evt-1', radius: 6 }]),
  mockGetZones: vi.fn().mockResolvedValue([
    {
      id: 'zone-commercial',
      name: '商业活力带',
      type: 'commercial',
      bounds: { x: 0, y: 0, width: 12, height: 10 },
      atmosphere: { noise: 0.82, safety: 0.64, beauty: 0.58 },
      resident_count: 1,
      building_count: 1,
      dominant_building_types: ['cafe'],
    },
  ]),
  mockGetWorldTransport: vi.fn().mockResolvedValue({
    roads: [
      {
        from_building: 'cafe',
        to_building: 'home1',
        distance: 6,
        road_type: 'street',
        traffic: 3,
      },
    ],
    stats: {
      mode_share: { walk: 2, bicycle: 1, cart: 0 },
      average_travel_ticks: 4,
      congestion_hotspots: [{ road_key: 'cafe:home1', traffic: 3, slowdown: 0.25 }],
    },
  }),
  mockPushToast: vi.fn(),
  mockPlay: vi.fn(),
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
    showEventRadii = vi.fn()
    syncTransport = vi.fn()
    drawRelationshipLines = vi.fn()
    setHeatmapEnabled = vi.fn()
    recordHeatmapTick = vi.fn()
    triggerMilestone = vi.fn()
    redrawTiles = vi.fn()
    getFollowedResidentId = vi.fn().mockReturnValue(null)
    screenToTile = mockScreenToTile
  },
}))

vi.mock('../services/api', () => ({
  getActiveEvents: mockGetActiveEvents,
  getZones: mockGetZones,
  getWorldTransport: mockGetWorldTransport,
  injectEvent: mockInjectEvent,
}))

vi.mock('../audio', () => ({
  useSound: () => ({ enabled: true, play: mockPlay, toggleEnabled: vi.fn() }),
}))

vi.mock('../components/ui/ToastProvider', () => ({
  useToast: () => ({ pushToast: mockPushToast }),
}))

vi.mock('../stores/simulation', () => ({
  useSimulationStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        buildings: [
          {
            id: 'cafe',
            type: 'cafe',
            name: '晨曦咖啡馆',
            capacity: 4,
            occupants: 2,
            position: [4, 5],
          },
        ],
        residents: [
          {
            id: 'r1',
            name: '小明',
            x: 5,
            y: 6,
            targetX: 5,
            targetY: 6,
            color: 0xf97316,
            status: 'idle',
            personality: '外向、热情',
            mood: 'happy',
            goals: ['结交朋友'],
            currentBuildingId: 'cafe',
            dialogueText: null,
          },
        ],
        tick: 8,
        tickPerDay: 48,
        time: 'Day 1, 08:00',
        running: true,
        selectedResidentId: null,
        speed: 1,
        hoveredPairIds: null,
        weather: 'sunny',
        season: 'spring',
        currentFestival: {
          name: '春日祭',
          type: 'spring',
          start_tick: 3,
          duration: 12,
          location: 'cafe',
          participants: ['r1'],
          status: 'active',
        },
        messageFeed: [],
        replayFrozenFrame: null,
        getFrameByTick: vi.fn().mockReturnValue(null),
        getSnapshotByTick: vi.fn().mockReturnValue(null),
        selectResident: vi.fn(),
      }),
    {
      getState: () => ({
        buildings: [
          {
            id: 'cafe',
            type: 'cafe',
            name: '晨曦咖啡馆',
            capacity: 4,
            occupants: 2,
            position: [4, 5],
          },
        ],
        residents: [
          {
            id: 'r1',
            name: '小明',
            x: 5,
            y: 6,
            targetX: 5,
            targetY: 6,
            color: 0xf97316,
            status: 'idle',
            personality: '外向、热情',
            mood: 'happy',
            goals: ['结交朋友'],
            currentBuildingId: 'cafe',
            dialogueText: null,
          },
        ],
        tick: 8,
        tickPerDay: 48,
        time: 'Day 1, 08:00',
        running: true,
        selectedResidentId: null,
        speed: 1,
        hoveredPairIds: null,
        weather: 'sunny',
        season: 'spring',
        currentFestival: {
          name: '春日祭',
          type: 'spring',
          start_tick: 3,
          duration: 12,
          location: 'cafe',
          participants: ['r1'],
          status: 'active',
        },
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

describe('TownCanvas', () => {
  beforeEach(() => {
    mockScreenToTile.mockReset()
    mockInjectEvent.mockClear()
    mockPushToast.mockClear()
    mockPlay.mockClear()
    mockGetActiveEvents.mockClear()
    mockGetZones.mockClear()
    mockGetWorldTransport.mockClear()
    mockGetActiveEvents.mockResolvedValue([{ id: 'evt-1', radius: 6 }])
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
  })

  it('clamps the context menu within the viewport when right clicking near the top-left edge', async () => {
    mockScreenToTile.mockReturnValue({ tileX: 0, tileY: 0, tileKind: 'grass' })
    const user = userEvent.setup()

    render(<TownCanvas />)

    const shell = await screen.findByTestId('town-canvas-shell')
    Object.defineProperty(shell, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 200, height: 180 }),
    })

    await user.pointer([{ target: shell, keys: '[MouseRight]', coords: { x: 0, y: 0 } }])

    const menu = await screen.findByTestId('town-context-menu')
    expect(menu).toHaveStyle({ left: '24px', top: '24px' })
  })

  it('exposes the map shell as a keyboard-focusable region', async () => {
    render(<TownCanvas />)

    const shell = await screen.findByTestId('town-canvas-shell')

    expect(shell).toHaveAttribute('tabindex', '0')
    expect(shell).toHaveAttribute('role', 'region')
    expect(shell).toHaveAccessibleName('小镇地图')
  })

  it('recognizes a click inside a building footprint when inspecting a tile', async () => {
    mockScreenToTile.mockReturnValue({ tileX: 5, tileY: 6, tileKind: 'grass' })
    const user = userEvent.setup()

    render(<TownCanvas />)

    const shell = await screen.findByTestId('town-canvas-shell')
    Object.defineProperty(shell, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 960, height: 640 }),
    })

    await user.pointer([{ target: shell, keys: '[MouseRight]', coords: { x: 100, y: 100 } }])
    await user.click(await screen.findByRole('button', { name: '查看位置' }))

    await waitFor(() => {
      expect(screen.getByTestId('town-inspection')).toHaveTextContent('晨曦咖啡馆')
    })
  })

  it('loads active events and forwards their radii to the renderer', async () => {
    render(<TownCanvas />)

    await waitFor(() => {
      expect(mockGetActiveEvents).toHaveBeenCalledTimes(1)
    })

    const rendererInstances = (await import('../components/town/TownRenderer')).TownRenderer as unknown as {
      instances: Array<{ showEventRadii: ReturnType<typeof vi.fn> }>
    }
    expect(rendererInstances.instances[0]?.showEventRadii).toHaveBeenCalledWith([
      { x: 20, y: 15, radius: 6 },
    ])
  })

  it('loads zones, forwards them to the renderer, and opens the zone panel on click', async () => {
    mockScreenToTile.mockReturnValue({ tileX: 3, tileY: 4, tileKind: 'grass' })
    const user = userEvent.setup()

    render(<TownCanvas />)

    const shell = await screen.findByTestId('town-canvas-shell')
    Object.defineProperty(shell, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 960, height: 640 }),
    })

    await waitFor(() => {
      expect(mockGetZones).toHaveBeenCalledTimes(1)
    })

    const rendererInstances = (await import('../components/town/TownRenderer')).TownRenderer as unknown as {
      instances: Array<{ syncZones: ReturnType<typeof vi.fn> }>
    }
    expect(rendererInstances.instances[0]?.syncZones).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'zone-commercial' })]),
    )

    await user.pointer([{ target: shell, keys: '[MouseLeft]', coords: { x: 40, y: 40 } }])

    expect(await screen.findByTestId('town-zone-panel')).toHaveTextContent('商业活力带')
  })

  it('loads transport network and forwards it to the renderer', async () => {
    render(<TownCanvas />)

    await waitFor(() => {
      expect(mockGetWorldTransport).toHaveBeenCalledTimes(1)
    })

    const rendererInstances = (await import('../components/town/TownRenderer')).TownRenderer as unknown as {
      instances: Array<{ syncTransport: ReturnType<typeof vi.fn> }>
    }
    const transportCalls = rendererInstances.instances[0]?.syncTransport.mock.calls ?? []
    expect(transportCalls.some(([payload]) =>
      payload?.roads?.some((road: { from_building: string; to_building: string }) => road.from_building === 'cafe' && road.to_building === 'home1')
        && payload?.stats?.mode_share?.bicycle === 1,
    )).toBe(true)
  })

  it('forwards the active festival marker to the renderer', async () => {
    render(<TownCanvas />)

    const rendererInstances = (await import('../components/town/TownRenderer')).TownRenderer as unknown as {
      instances: Array<{ setActiveFestival: ReturnType<typeof vi.fn> }>
    }

    await waitFor(() => {
      expect(rendererInstances.instances[0]?.setActiveFestival).toHaveBeenCalledWith(
        expect.objectContaining({ name: '春日祭', location: 'cafe' }),
      )
    })
  })
})
