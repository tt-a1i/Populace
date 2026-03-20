import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TownChrome, type TownContextMenuState, type TownInspectionState, type TownPlaceholder } from '../components/town/TownChrome'
import type { ResidentPosition } from '../stores/simulation'
import type { GraphRelationship } from '../stores/relationships'

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

describe('TownChrome', () => {
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

  it('renders the resident sidebar with memory summary and relationships', () => {
    render(
      <TownChrome
        residents={residents}
        buildings={buildings}
        relationships={relationships}
        selectedResidentId="r1"
        currentTime="Day 2, 09:30"
        messageFeed={['小明 对 小红 说：今天真热闹。', '事件：咖啡馆门口传来笑声']}
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
    expect(screen.getByText(/friendship/i)).toBeInTheDocument()
    expect(screen.getByText(/晨曦咖啡馆/)).toBeInTheDocument()
    expect(screen.getByTestId('town-inspection')).toBeInTheDocument()
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
  })
})
