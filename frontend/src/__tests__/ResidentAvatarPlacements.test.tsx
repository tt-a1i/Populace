import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', () => ({
  getResidentAchievements: vi.fn().mockResolvedValue([{ unlocked: true }]),
  getResidentRelationships: vi.fn().mockResolvedValue([{ from_id: 'a', to_id: 'b', type: 'friendship', intensity: 0.8, familiarity: 0.5, reason: 'shared tea', since: 'today', counterpart_name: 'Ben', direction: 'outgoing' }]),
  getResidentMemories: vi.fn().mockResolvedValue([]),
  getResidentMoodLog: vi.fn().mockResolvedValue([
    { tick: 8, mood: 'sad', cause: 'weather' },
    { tick: 12, mood: 'calm', cause: 'social' },
  ]),
  getResidentSkills: vi.fn().mockResolvedValue({
    resident_id: 'a',
    skills: { cooking: 0.82, teaching: 0.45, trading: 0.16 },
  }),
  generateMemoir: vi.fn(),
  injectResidentMemory: vi.fn(),
  patchResidentAttributes: vi.fn(),
  tradeResidentItem: vi.fn().mockResolvedValue({
    seller_resident: { id: 'a', coins: 125, inventory: [] },
    buyer_resident: { id: 'b', coins: 90, inventory: [{ name: 'coffee', quantity: 1, value: 5 }] },
    item_name: 'coffee',
    quantity: 1,
    total_price: 5,
  }),
  getResidentFamilyTree: vi.fn().mockResolvedValue({ self: { id: '', name: '', age_days: 0, deceased: false, relation: 'self' }, parents: [], children: [], siblings: [], partner: null }),
  chatWithResident: vi.fn().mockResolvedValue({ reply: 'hello', resident_id: 'r1', resident_name: 'test' }),
}))

import { ComparePanel } from '../components/toolbar/ComparePanel'
import { ResidentStoryPanel } from '../components/town/ResidentStoryPanel'
import { useSimulationStore } from '../stores/simulation'

describe('resident avatar placements', () => {
  beforeEach(() => {
    useSimulationStore.setState({
      residents: [
        {
          id: 'a',
          name: 'Ada',
          x: 1,
          y: 1,
          targetX: 1,
          targetY: 1,
          color: 0x38bdf8,
          status: 'idle',
          skinColor: '#d8a27a',
          hairStyle: 'bun',
          hairColor: '#2b1b17',
          outfitColor: '#3b82f6',
          personality: 'calm',
          mood: 'happy',
          goals: [],
          coins: 120,
          occupation: 'artist',
          energy: 0.8,
          skills: { cooking: 0.82, teaching: 0.45, trading: 0.16 },
          inventory: [{ name: 'coffee', quantity: 2, value: 5 }, { name: 'book', quantity: 1, value: 7 }],
        },
        {
          id: 'b',
          name: 'Ben',
          x: 2,
          y: 2,
          targetX: 2,
          targetY: 2,
          color: 0xf59e0b,
          status: 'idle',
          skinColor: '#f0c7a1',
          hairStyle: 'short',
          hairColor: '#2f241c',
          outfitColor: '#10b981',
          personality: 'bold',
          mood: 'neutral',
          goals: [],
          coins: 95,
          occupation: 'chef',
          energy: 0.7,
          skills: { cooking: 0.3, teaching: 0.15 },
          inventory: [],
        },
      ],
    })
  })

  it('shows a generated avatar in the resident sidebar header', async () => {
    render(
      <ResidentStoryPanel
        residentId="a"
        residents={useSimulationStore.getState().residents}
        buildings={[]}
        onClose={() => undefined}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('img', { name: /ada avatar/i })).toBeInTheDocument()
    })
  })

  it('shows generated avatars in compare results', async () => {
    const user = userEvent.setup()

    render(<ComparePanel />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0], 'a')
    await user.selectOptions(selects[1], 'b')
    await user.click(screen.getByRole('button', { name: /对比|compare/i }))

    await waitFor(() => {
      expect(screen.getByRole('img', { name: /ada avatar/i })).toBeInTheDocument()
      expect(screen.getByRole('img', { name: /ben avatar/i })).toBeInTheDocument()
    })
  })

  it('renders a skills tab with skill levels in the resident sidebar', async () => {
    const user = userEvent.setup()

    render(
      <ResidentStoryPanel
        residentId="a"
        residents={useSimulationStore.getState().residents}
        buildings={[]}
        onClose={() => undefined}
      />,
    )

    await user.click(screen.getByRole('tab', { name: /技能|skills/i }))

    await waitFor(() => {
      expect(screen.getByText(/cooking/i)).toBeInTheDocument()
      expect(screen.getByText(/expert|专家/i)).toBeInTheDocument()
      expect(screen.getByText(/teaching/i)).toBeInTheDocument()
    })
  })

  it('renders a mood log timeline with cause tags in the resident sidebar', async () => {
    const user = userEvent.setup()

    render(
      <ResidentStoryPanel
        residentId="a"
        residents={useSimulationStore.getState().residents}
        buildings={[]}
        onClose={() => undefined}
      />,
    )

    await user.click(screen.getByRole('tab', { name: /情绪日志|mood log/i }))

    await waitFor(() => {
      expect(screen.getByText(/sad/i)).toBeInTheDocument()
      expect(screen.getByText(/weather/i)).toBeInTheDocument()
      expect(screen.getByText(/social/i)).toBeInTheDocument()
    })
  })

  it('renders a backpack tab with items and trade action', async () => {
    const user = userEvent.setup()

    render(
      <ResidentStoryPanel
        residentId="a"
        residents={useSimulationStore.getState().residents}
        buildings={[]}
        onClose={() => undefined}
      />,
    )

    await user.click(screen.getByRole('tab', { name: /背包|backpack/i }))

    await waitFor(() => {
      expect(screen.getByText(/coffee/i)).toBeInTheDocument()
      expect(screen.getByText(/book/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /交易|trade/i })).toBeInTheDocument()
    })
  })
})
