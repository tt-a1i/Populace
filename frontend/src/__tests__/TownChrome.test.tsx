import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetResidentMemories,
  mockGetResidentRelationships,
} = vi.hoisted(() => ({
  mockGetResidentMemories: vi.fn(),
  mockGetResidentRelationships: vi.fn(),
}))

vi.mock('../services/api', () => ({
  getResidentMemories: mockGetResidentMemories,
  getResidentRelationships: mockGetResidentRelationships,
  teleportResident: vi.fn(),
}))

import { TownChrome, type TownContextMenuState, type TownInspectionState, type TownPlaceholder } from '../components/town/TownChrome'
import type { ResidentPosition } from '../stores/simulation'
import type { GraphRelationship } from '../stores/relationships'
import type { ResidentMemory, ResidentRelationship } from '../services/api'

const residents: ResidentPosition[] = [
  {
    id: 'r1',
    name: '\u5c0f\u660e',
    x: 4,
    y: 5,
    targetX: 4,
    targetY: 5,
    color: 0xf97316,
    status: 'chatting',
    personality: '\u5916\u5411\u3001\u70ed\u60c5',
    mood: 'happy',
    goals: ['\u7ed3\u4ea4\u670b\u53cb'],
    dialogueText: '\u4eca\u5929\u771f\u70ed\u95f9\u3002',
    currentBuildingId: 'cafe',
  },
  {
    id: 'r2',
    name: '\u5c0f\u7ea2',
    x: 12,
    y: 9,
    targetX: 12,
    targetY: 9,
    color: 0x38bdf8,
    status: 'idle',
    personality: '\u51b7\u9759\u3001\u7ec6\u5fc3',
    mood: 'neutral',
    goals: ['\u89c2\u5bdf\u5c0f\u9547'],
    currentBuildingId: null,
  },
]

const relationships: GraphRelationship[] = [
  {
    from_id: 'r1',
    to_id: 'r2',
    type: 'friendship',
    intensity: 0.82,
    reason: '\u4e00\u8d77\u5728\u5496\u5561\u9986\u804a\u5929',
  },
]

const buildings = [
  {
    id: 'cafe',
    type: 'cafe',
    name: '\u6668\u66e6\u5496\u5561\u9986',
    capacity: 4,
    occupants: 2,
    position: [4, 5] as [number, number],
  },
]

const contextMenu: TownContextMenuState = {
  screenX: 120,
  screenY: 90,
  tileX: 4,
  tileY: 5,
  tileKind: 'grass',
}

const inspection: TownInspectionState = {
  tileX: 4,
  tileY: 5,
  tileKind: 'grass',
  buildingName: '\u6668\u66e6\u5496\u5561\u9986',
  residentCount: 1,
}

const placeholders: TownPlaceholder[] = [{ id: 'placeholder-1', tileX: 8, tileY: 10, label: '\u9884\u7559\u5730\u5757' }]

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

function buildProps(selectedResidentId: string | null) {
  return {
    residents,
    buildings,
    relationships,
    selectedResidentId,
    currentTime: 'Day 2, 09:30',
    messageFeed: [
      { text: '\u5c0f\u660e \u5bf9 \u5c0f\u7ea2 \u8bf4\uff1a\u4eca\u5929\u771f\u70ed\u95f9\u3002' },
      { text: '\u4e8b\u4ef6\uff1a\u5496\u5561\u9986\u95e8\u53e3\u4f20\u6765\u7b11\u58f0' },
    ],
    contextMenu: null,
    inspection: null,
    placeholders,
    onCloseContextMenu: vi.fn(),
    onInjectEvent: vi.fn(),
    onInspectTile: vi.fn(),
    onPlacePlaceholder: vi.fn(),
    onClearResidentSelection: vi.fn(),
    onDismissInspection: vi.fn(),
  } satisfies React.ComponentProps<typeof TownChrome>
}

describe('TownChrome', () => {
  beforeEach(() => {
    mockGetResidentMemories.mockReset()
    mockGetResidentRelationships.mockReset()

    mockGetResidentMemories.mockResolvedValue([])
    mockGetResidentRelationships.mockResolvedValue([])
  })

  it('shows the tile context menu and dispatches actions', async () => {
    const user = userEvent.setup()
    const onInjectEvent = vi.fn()
    const onInspectTile = vi.fn()
    const onPlacePlaceholder = vi.fn()

    render(
      <TownChrome
        residents={residents}
        buildings={buildings}
        relationships={relationships}
        selectedResidentId={null}
        currentTime="Day 1, 08:00"
        messageFeed={[]}
        contextMenu={contextMenu}
        inspection={null}
        placeholders={[]}
        onCloseContextMenu={vi.fn()}
        onInjectEvent={onInjectEvent}
        onInspectTile={onInspectTile}
        onPlacePlaceholder={onPlacePlaceholder}
        onClearResidentSelection={vi.fn()}
        onDismissInspection={vi.fn()}
      />,
    )

    expect(screen.getByTestId('town-context-menu')).toBeInTheDocument()
    expect(screen.getByText('Tile 4, 5')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '\u6295\u653e\u4e8b\u4ef6' }))
    await user.click(screen.getByRole('button', { name: '\u67e5\u770b\u4f4d\u7f6e' }))
    await user.click(screen.getByRole('button', { name: '\u653e\u7f6e\u5efa\u7b51\u5360\u4f4d' }))

    expect(onInjectEvent).toHaveBeenCalledTimes(1)
    expect(onInspectTile).toHaveBeenCalledTimes(1)
    expect(onPlacePlaceholder).toHaveBeenCalledTimes(1)
  })

  it('renders the resident story panel with name, activity, and building info', async () => {
    const residentARelationships: ResidentRelationship[] = [
      {
        from_id: 'r1',
        to_id: 'r2',
        type: 'friendship',
        intensity: 0.9,
        familiarity: 0.7,
        reason: 'A API \u5173\u7cfb\u539f\u56e0',
        since: 'Day 1',
        counterpart_name: 'A API \u5173\u7cfb',
        direction: 'outgoing',
      },
    ]
    mockGetResidentRelationships.mockResolvedValue(residentARelationships)

    render(
      <TownChrome
        residents={residents}
        buildings={buildings}
        relationships={relationships}
        selectedResidentId="r1"
        currentTime="Day 2, 09:30"
        messageFeed={[{ text: '\u5c0f\u660e \u5bf9 \u5c0f\u7ea2 \u8bf4\uff1a\u4eca\u5929\u771f\u70ed\u95f9\u3002' }]}
        contextMenu={null}
        inspection={inspection}
        placeholders={placeholders}
        onCloseContextMenu={vi.fn()}
        onInjectEvent={vi.fn()}
        onInspectTile={vi.fn()}
        onPlacePlaceholder={vi.fn()}
        onClearResidentSelection={vi.fn()}
        onDismissInspection={vi.fn()}
      />,
    )

    expect(screen.getByTestId('resident-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('resident-story-panel')).toBeInTheDocument()

    // Name shown
    expect(screen.getByText(/\u5c0f\u660e/)).toBeInTheDocument()

    // Building name shown (activity line + possibly inspection panel)
    expect(screen.getAllByText(/\u6668\u66e6\u5496\u5561\u9986/)[0]).toBeInTheDocument()

    // Inspection panel also shows
    expect(screen.getByTestId('town-inspection')).toBeInTheDocument()

    // Relationships section shows after fetch resolves
    expect(await screen.findByText('A API \u5173\u7cfb')).toBeInTheDocument()
    expect(screen.getByText(/friendship/i)).toBeInTheDocument()
  })

  it('renders a minimap dot for every resident and placeholder marker', () => {
    render(
      <TownChrome
        residents={residents}
        buildings={buildings}
        relationships={relationships}
        selectedResidentId="r1"
        currentTime="Day 1, 08:00"
        messageFeed={[]}
        contextMenu={null}
        inspection={null}
        placeholders={placeholders}
        onCloseContextMenu={vi.fn()}
        onInjectEvent={vi.fn()}
        onInspectTile={vi.fn()}
        onPlacePlaceholder={vi.fn()}
        onClearResidentSelection={vi.fn()}
        onDismissInspection={vi.fn()}
      />,
    )

    expect(screen.getByTestId('town-minimap')).toBeInTheDocument()
    expect(screen.getAllByTestId('minimap-resident-dot')).toHaveLength(2)
    expect(screen.getAllByTestId('minimap-placeholder-dot')).toHaveLength(1)
    expect(screen.getByTestId('minimap-building-footprint')).toHaveStyle({
      width: '5%',
      height: '10%',
    })
  })

  it('clears live API data immediately when switching residents', async () => {
    const residentAMemories: ResidentMemory[] = [
      { id: 'memory-a', content: 'A API \u8bb0\u5fc6', timestamp: 'Day 1, 08:00', importance: 0.8, emotion: 'happy' },
    ]
    const residentARelationships: ResidentRelationship[] = [
      {
        from_id: 'r1',
        to_id: 'r2',
        type: 'friendship',
        intensity: 0.9,
        familiarity: 0.7,
        reason: 'A API \u5173\u7cfb\u539f\u56e0',
        since: 'Day 1',
        counterpart_name: 'A API \u5173\u7cfb',
        direction: 'outgoing',
      },
    ]
    const residentBMemories = createDeferred<ResidentMemory[]>()
    const residentBRelationships = createDeferred<ResidentRelationship[]>()

    mockGetResidentMemories.mockImplementation((id: string) => {
      if (id === 'r1') return Promise.resolve(residentAMemories)
      return residentBMemories.promise
    })
    mockGetResidentRelationships.mockImplementation((id: string) => {
      if (id === 'r1') return Promise.resolve(residentARelationships)
      return residentBRelationships.promise
    })

    const { rerender } = render(<TownChrome {...buildProps('r1')} />)

    expect(await screen.findByText('A API \u8bb0\u5fc6')).toBeInTheDocument()
    expect(screen.getByText('A API \u5173\u7cfb')).toBeInTheDocument()

    rerender(<TownChrome {...buildProps('r2')} />)

    expect(screen.getByText('\u5c0f\u7ea2')).toBeInTheDocument()
    // Old data should be gone (new panel remounts with empty state)
    expect(screen.queryByText('A API \u8bb0\u5fc6')).not.toBeInTheDocument()
    expect(screen.queryByText('A API \u5173\u7cfb')).not.toBeInTheDocument()

    residentBMemories.resolve([])
    residentBRelationships.resolve([])

    await waitFor(() => {
      expect(mockGetResidentMemories).toHaveBeenCalledWith('r2')
    })
  })

  it('ignores stale API results that resolve after switching to another resident', async () => {
    const residentAMemories = createDeferred<ResidentMemory[]>()
    const residentARelationships = createDeferred<ResidentRelationship[]>()
    const residentBMemories = createDeferred<ResidentMemory[]>()
    const residentBRelationships = createDeferred<ResidentRelationship[]>()

    mockGetResidentMemories.mockImplementation((id: string) =>
      id === 'r1' ? residentAMemories.promise : residentBMemories.promise,
    )
    mockGetResidentRelationships.mockImplementation((id: string) =>
      id === 'r1' ? residentARelationships.promise : residentBRelationships.promise,
    )

    const { rerender } = render(<TownChrome {...buildProps('r1')} />)

    rerender(<TownChrome {...buildProps('r2')} />)

    residentAMemories.resolve([
      { id: 'memory-a-late', content: '\u8fc7\u671f\u7684 A \u8bb0\u5fc6', timestamp: 'Day 1, 08:00', importance: 0.9, emotion: 'happy' },
    ])
    residentARelationships.resolve([
      {
        from_id: 'r1',
        to_id: 'r2',
        type: 'friendship',
        intensity: 0.8,
        familiarity: 0.7,
        reason: '\u8fc7\u671f\u7684 A \u5173\u7cfb\u539f\u56e0',
        since: 'Day 1',
        counterpart_name: '\u8fc7\u671f\u7684 A \u5173\u7cfb',
        direction: 'outgoing',
      },
    ])

    await waitFor(() => {
      expect(screen.getByText('\u5c0f\u7ea2')).toBeInTheDocument()
    })

    expect(screen.queryByText('\u8fc7\u671f\u7684 A \u8bb0\u5fc6')).not.toBeInTheDocument()
    expect(screen.queryByText('\u8fc7\u671f\u7684 A \u5173\u7cfb')).not.toBeInTheDocument()

    residentBMemories.resolve([
      { id: 'memory-b', content: 'B API \u8bb0\u5fc6', timestamp: 'Day 1, 10:00', importance: 0.6, emotion: 'neutral' },
    ])
    residentBRelationships.resolve([
      {
        from_id: 'r2',
        to_id: 'r1',
        type: 'trust',
        intensity: 0.75,
        familiarity: 0.5,
        reason: 'B API \u5173\u7cfb\u539f\u56e0',
        since: 'Day 2',
        counterpart_name: 'B API \u5173\u7cfb',
        direction: 'outgoing',
      },
    ])

    expect(await screen.findByText('B API \u8bb0\u5fc6')).toBeInTheDocument()
    expect(screen.queryByText('\u8fc7\u671f\u7684 A \u8bb0\u5fc6')).not.toBeInTheDocument()
  })

  it('clears stale live data when the next resident request fails', async () => {
    const residentAMemories: ResidentMemory[] = [
      { id: 'memory-a-success', content: '\u6210\u529f\u7684 A \u8bb0\u5fc6', timestamp: 'Day 1, 08:00', importance: 0.7, emotion: 'happy' },
    ]
    const residentARelationships: ResidentRelationship[] = [
      {
        from_id: 'r1',
        to_id: 'r2',
        type: 'friendship',
        intensity: 0.85,
        familiarity: 0.6,
        reason: '\u6210\u529f\u7684 A \u5173\u7cfb\u539f\u56e0',
        since: 'Day 1',
        counterpart_name: '\u6210\u529f\u7684 A \u5173\u7cfb',
        direction: 'outgoing',
      },
    ]

    mockGetResidentMemories.mockImplementation((id: string) =>
      id === 'r1'
        ? Promise.resolve(residentAMemories)
        : Promise.reject(new Error('resident B memories failed')),
    )
    mockGetResidentRelationships.mockImplementation((id: string) =>
      id === 'r1'
        ? Promise.resolve(residentARelationships)
        : Promise.reject(new Error('resident B relationships failed')),
    )

    const { rerender } = render(<TownChrome {...buildProps('r1')} />)

    expect(await screen.findByText('\u6210\u529f\u7684 A \u8bb0\u5fc6')).toBeInTheDocument()

    rerender(<TownChrome {...buildProps('r2')} />)

    await waitFor(() => {
      expect(mockGetResidentMemories).toHaveBeenCalledWith('r2')
    })

    await waitFor(() => {
      expect(screen.queryByText('\u6210\u529f\u7684 A \u8bb0\u5fc6')).not.toBeInTheDocument()
      expect(screen.queryByText('\u6210\u529f\u7684 A \u5173\u7cfb')).not.toBeInTheDocument()
    })

    expect(screen.getByText('\u5c0f\u7ea2')).toBeInTheDocument()
  })

  it('shows the story panel with god action buttons', async () => {
    render(<TownChrome {...buildProps('r1')} />)

    expect(screen.getByTestId('resident-story-panel')).toBeInTheDocument()

    // God action buttons are present (teleport was removed)
    expect(screen.getByRole('button', { name: /\u6539\u60c5\u7eea/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /\u6ce8\u5165\u8bb0\u5fc6/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /\u56de\u5fc6\u5f55/ })).toBeInTheDocument()
  })
})
