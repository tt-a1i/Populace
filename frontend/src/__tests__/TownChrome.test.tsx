import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetResidentMemories,
  mockGetResidentRelationships,
  mockGetResidentReflections,
  mockGetResidentDiary,
  mockGetResidentAchievements,
} = vi.hoisted(() => ({
  mockGetResidentMemories: vi.fn(),
  mockGetResidentRelationships: vi.fn(),
  mockGetResidentReflections: vi.fn(),
  mockGetResidentDiary: vi.fn(),
  mockGetResidentAchievements: vi.fn(),
}))

vi.mock('../services/api', () => ({
  getResidentMemories: mockGetResidentMemories,
  getResidentRelationships: mockGetResidentRelationships,
  getResidentReflections: mockGetResidentReflections,
  getResidentDiary: mockGetResidentDiary,
  getResidentAchievements: mockGetResidentAchievements,
}))

import { TownChrome, type TownContextMenuState, type TownInspectionState, type TownPlaceholder } from '../components/town/TownChrome'
import type { ResidentPosition } from '../stores/simulation'
import type { GraphRelationship } from '../stores/relationships'
import type { ResidentMemory, ResidentReflection, ResidentRelationship } from '../services/api'

const residents: ResidentPosition[] = [
  {
    id: 'r1',
    name: '小明',
    x: 4,
    y: 5,
    targetX: 4,
    targetY: 5,
    color: 0xf97316,
    status: 'chatting',
    personality: '外向、热情',
    mood: 'happy',
    goals: ['结交朋友'],
    dialogueText: '今天真热闹。',
    currentBuildingId: 'cafe',
  },
  {
    id: 'r2',
    name: '小红',
    x: 12,
    y: 9,
    targetX: 12,
    targetY: 9,
    color: 0x38bdf8,
    status: 'idle',
    personality: '冷静、细心',
    mood: 'neutral',
    goals: ['观察小镇'],
    currentBuildingId: null,
  },
]

const relationships: GraphRelationship[] = [
  {
    from_id: 'r1',
    to_id: 'r2',
    type: 'friendship',
    intensity: 0.82,
    reason: '一起在咖啡馆聊天',
  },
]

const buildings = [
  {
    id: 'cafe',
    type: 'cafe',
    name: '晨曦咖啡馆',
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
  buildingName: '晨曦咖啡馆',
  residentCount: 1,
}

const placeholders: TownPlaceholder[] = [{ id: 'placeholder-1', tileX: 8, tileY: 10, label: '预留地块' }]

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
      { text: '小明 对 小红 说：今天真热闹。' },
      { text: '事件：咖啡馆门口传来笑声' },
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
    mockGetResidentReflections.mockReset()
    mockGetResidentDiary.mockReset()
    mockGetResidentAchievements.mockReset()

    mockGetResidentMemories.mockResolvedValue([])
    mockGetResidentRelationships.mockResolvedValue([])
    mockGetResidentReflections.mockResolvedValue([])
    mockGetResidentDiary.mockResolvedValue([])
    mockGetResidentAchievements.mockResolvedValue([])
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

    await user.click(screen.getByRole('button', { name: '投放事件' }))
    await user.click(screen.getByRole('button', { name: '查看位置' }))
    await user.click(screen.getByRole('button', { name: '放置建筑占位' }))

    expect(onInjectEvent).toHaveBeenCalledTimes(1)
    expect(onInspectTile).toHaveBeenCalledTimes(1)
    expect(onPlacePlaceholder).toHaveBeenCalledTimes(1)
  })

  it('renders the resident sidebar with memory summary and relationships', async () => {
    const user = userEvent.setup()
    render(
      <TownChrome
        residents={residents}
        buildings={buildings}
        relationships={relationships}
        selectedResidentId="r1"
        currentTime="Day 2, 09:30"
        messageFeed={[{ text: '小明 对 小红 说：今天真热闹。' }, { text: '事件：咖啡馆门口传来笑声' }]}
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
    expect(screen.getByText('小明')).toBeInTheDocument()
    expect(screen.getByText('外向、热情')).toBeInTheDocument()
    expect(screen.getByText('happy')).toBeInTheDocument()
    expect(screen.getAllByText(/今天真热闹/)[0]).toBeInTheDocument()
    expect(screen.getByText(/晨曦咖啡馆/)).toBeInTheDocument()
    expect(screen.getByTestId('town-inspection')).toBeInTheDocument()

    // Relationships are on the 关系 tab
    await user.click(screen.getByRole('button', { name: '关系' }))
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
    const user = userEvent.setup()
    const residentAMemories: ResidentMemory[] = [
      { id: 'memory-a', content: 'A API 记忆', timestamp: 'Day 1, 08:00', importance: 0.8, emotion: 'happy' },
    ]
    const residentARelationships: ResidentRelationship[] = [
      {
        from_id: 'r1',
        to_id: 'r2',
        type: 'friendship',
        intensity: 0.9,
        familiarity: 0.7,
        reason: 'A API 关系原因',
        since: 'Day 1',
        counterpart_name: 'A API 关系',
        direction: 'outgoing',
      },
    ]
    const residentAReflections: ResidentReflection[] = [
      { id: 'reflection-a', summary: 'A API 反思', timestamp: 'Day 1, 09:00', derived_from: [] },
    ]
    const residentBMemories = createDeferred<ResidentMemory[]>()
    const residentBRelationships = createDeferred<ResidentRelationship[]>()
    const residentBReflections = createDeferred<ResidentReflection[]>()

    mockGetResidentMemories.mockImplementation((id: string) => {
      if (id === 'r1') return Promise.resolve(residentAMemories)
      return residentBMemories.promise
    })
    mockGetResidentRelationships.mockImplementation((id: string) => {
      if (id === 'r1') return Promise.resolve(residentARelationships)
      return residentBRelationships.promise
    })
    mockGetResidentReflections.mockImplementation((id: string) => {
      if (id === 'r1') return Promise.resolve(residentAReflections)
      return residentBReflections.promise
    })

    const { rerender } = render(<TownChrome {...buildProps('r1')} />)

    expect(await screen.findByText('A API 记忆')).toBeInTheDocument()
    expect(screen.getByText('A API 反思')).toBeInTheDocument()

    // Switch to 关系 tab to verify relationship data
    await user.click(screen.getByRole('button', { name: '关系' }))
    expect(screen.getByText('A API 关系')).toBeInTheDocument()

    rerender(<TownChrome {...buildProps('r2')} />)

    expect(screen.getByText('小红')).toBeInTheDocument()
    expect(screen.queryByText('A API 记忆')).not.toBeInTheDocument()
    expect(screen.queryByText('A API 反思')).not.toBeInTheDocument()
    expect(screen.queryByText('A API 关系')).not.toBeInTheDocument()

    residentBMemories.resolve([])
    residentBRelationships.resolve([])
    residentBReflections.resolve([])

    await waitFor(() => {
      expect(mockGetResidentMemories).toHaveBeenCalledWith('r2')
    })
  })

  it('ignores stale API results that resolve after switching to another resident', async () => {
    const residentAMemories = createDeferred<ResidentMemory[]>()
    const residentARelationships = createDeferred<ResidentRelationship[]>()
    const residentAReflections = createDeferred<ResidentReflection[]>()
    const residentBMemories = createDeferred<ResidentMemory[]>()
    const residentBRelationships = createDeferred<ResidentRelationship[]>()
    const residentBReflections = createDeferred<ResidentReflection[]>()

    mockGetResidentMemories.mockImplementation((id: string) =>
      id === 'r1' ? residentAMemories.promise : residentBMemories.promise,
    )
    mockGetResidentRelationships.mockImplementation((id: string) =>
      id === 'r1' ? residentARelationships.promise : residentBRelationships.promise,
    )
    mockGetResidentReflections.mockImplementation((id: string) =>
      id === 'r1' ? residentAReflections.promise : residentBReflections.promise,
    )

    const { rerender } = render(<TownChrome {...buildProps('r1')} />)

    rerender(<TownChrome {...buildProps('r2')} />)

    residentAMemories.resolve([
      { id: 'memory-a-late', content: '过期的 A 记忆', timestamp: 'Day 1, 08:00', importance: 0.9, emotion: 'happy' },
    ])
    residentARelationships.resolve([
      {
        from_id: 'r1',
        to_id: 'r2',
        type: 'friendship',
        intensity: 0.8,
        familiarity: 0.7,
        reason: '过期的 A 关系原因',
        since: 'Day 1',
        counterpart_name: '过期的 A 关系',
        direction: 'outgoing',
      },
    ])
    residentAReflections.resolve([
      { id: 'reflection-a-late', summary: '过期的 A 反思', timestamp: 'Day 1, 09:00', derived_from: [] },
    ])

    await waitFor(() => {
      expect(screen.getByText('小红')).toBeInTheDocument()
    })

    expect(screen.queryByText('过期的 A 记忆')).not.toBeInTheDocument()
    expect(screen.queryByText('过期的 A 关系')).not.toBeInTheDocument()
    expect(screen.queryByText('过期的 A 反思')).not.toBeInTheDocument()

    residentBMemories.resolve([
      { id: 'memory-b', content: 'B API 记忆', timestamp: 'Day 1, 10:00', importance: 0.6, emotion: 'neutral' },
    ])
    residentBRelationships.resolve([
      {
        from_id: 'r2',
        to_id: 'r1',
        type: 'trust',
        intensity: 0.75,
        familiarity: 0.5,
        reason: 'B API 关系原因',
        since: 'Day 2',
        counterpart_name: 'B API 关系',
        direction: 'outgoing',
      },
    ])
    residentBReflections.resolve([
      { id: 'reflection-b', summary: 'B API 反思', timestamp: 'Day 2, 10:00', derived_from: [] },
    ])

    expect(await screen.findByText('B API 记忆')).toBeInTheDocument()
    expect(screen.getByText('B API 反思')).toBeInTheDocument()
    expect(screen.queryByText('过期的 A 记忆')).not.toBeInTheDocument()
  })

  it('clears stale live data when the next resident request fails', async () => {
    const residentAMemories: ResidentMemory[] = [
      { id: 'memory-a-success', content: '成功的 A 记忆', timestamp: 'Day 1, 08:00', importance: 0.7, emotion: 'happy' },
    ]
    const residentARelationships: ResidentRelationship[] = [
      {
        from_id: 'r1',
        to_id: 'r2',
        type: 'friendship',
        intensity: 0.85,
        familiarity: 0.6,
        reason: '成功的 A 关系原因',
        since: 'Day 1',
        counterpart_name: '成功的 A 关系',
        direction: 'outgoing',
      },
    ]
    const residentAReflections: ResidentReflection[] = [
      { id: 'reflection-a-success', summary: '成功的 A 反思', timestamp: 'Day 1, 09:00', derived_from: [] },
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
    mockGetResidentReflections.mockImplementation((id: string) =>
      id === 'r1'
        ? Promise.resolve(residentAReflections)
        : Promise.reject(new Error('resident B reflections failed')),
    )

    const { rerender } = render(<TownChrome {...buildProps('r1')} />)

    expect(await screen.findByText('成功的 A 记忆')).toBeInTheDocument()
    expect(screen.getByText('成功的 A 反思')).toBeInTheDocument()

    rerender(<TownChrome {...buildProps('r2')} />)

    await waitFor(() => {
      expect(mockGetResidentMemories).toHaveBeenCalledWith('r2')
    })

    await waitFor(() => {
      expect(screen.queryByText('成功的 A 记忆')).not.toBeInTheDocument()
      expect(screen.queryByText('成功的 A 反思')).not.toBeInTheDocument()
    })

    expect(screen.getByText('小红')).toBeInTheDocument()
    expect(screen.queryByText('反思 ·')).not.toBeInTheDocument()
  })

  it('shows the diary tab with entries when the 日记 tab is clicked', async () => {
    const user = userEvent.setup()
    mockGetResidentDiary.mockResolvedValue([
      { id: 'diary-1', date: 'Day 1', tick: 44, summary: '今天发生了很多有趣的事情。' },
    ])

    render(<TownChrome {...buildProps('r1')} />)

    await user.click(screen.getByRole('button', { name: '日记' }))

    expect(await screen.findByTestId('resident-diary')).toBeInTheDocument()
    expect(await screen.findByText('今天发生了很多有趣的事情。')).toBeInTheDocument()
    expect(screen.getByText('Day 1')).toBeInTheDocument()
  })

  it('shows empty diary message when no diary entries exist', async () => {
    const user = userEvent.setup()
    mockGetResidentDiary.mockResolvedValue([])

    render(<TownChrome {...buildProps('r1')} />)

    await user.click(screen.getByRole('button', { name: '日记' }))

    expect(await screen.findByTestId('resident-diary')).toBeInTheDocument()
    expect(screen.getByText(/日记尚未生成/)).toBeInTheDocument()
  })
})
