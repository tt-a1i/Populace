import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockScreenToTile, mockInjectEvent, mockPushToast, mockPlay } = vi.hoisted(() => ({
  mockScreenToTile: vi.fn(),
  mockInjectEvent: vi.fn().mockResolvedValue({}),
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
    showEventRadii = vi.fn()
    screenToTile = mockScreenToTile
  },
}))

vi.mock('../services/api', () => ({
  getActiveEvents: vi.fn().mockResolvedValue([]),
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
        messageFeed: [],
        replayFrozenFrame: null,
        getFrameByTick: vi.fn().mockReturnValue(null),
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
})
