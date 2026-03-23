import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', () => ({
  getResidentAchievements: vi.fn().mockResolvedValue([{ unlocked: true }]),
  getResidentRelationships: vi.fn().mockResolvedValue([{ from_id: 'a', to_id: 'b', type: 'friendship', intensity: 0.8, familiarity: 0.5, reason: 'shared tea', since: 'today', counterpart_name: 'Ben', direction: 'outgoing' }]),
  getResidentMemories: vi.fn().mockResolvedValue([]),
  generateMemoir: vi.fn(),
  injectResidentMemory: vi.fn(),
  patchResidentAttributes: vi.fn(),
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
})
