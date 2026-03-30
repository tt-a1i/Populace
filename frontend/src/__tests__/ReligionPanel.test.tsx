import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', () => ({
  getWorldReligion: vi.fn().mockResolvedValue({
    distribution: [
      { religion: 'solarsm', label: '日耀信仰', count: 4, share: 0.4 },
      { religion: 'naturalism', label: '自然信仰', count: 3, share: 0.3 },
    ],
    morality_index: 0.68,
    morality_history: [
      { tick: 48, morality_index: 0.56 },
      { tick: 96, morality_index: 0.68 },
    ],
    events: [
      {
        religion: 'solarsm',
        event_type: 'festival',
        name: '晨辉赞歌节',
        venue_id: 'chapel1',
        leader_id: 'a1',
        participants: ['a1', 'a2', 'a3'],
        tick_start: 96,
        duration: 6,
        town_mood_boost: 0.12,
        morality_boost: 0.04,
      },
    ],
    leaders: [
      { resident_id: 'a1', resident_name: '阿曜', religion: 'solarsm', piety: 0.92, reputation: 0.74 },
    ],
  }),
}))

import { ReligionPanel } from '../components/toolbar/ReligionPanel'

describe('ReligionPanel', () => {
  it('renders faith distribution, morality trend, and religious events', async () => {
    render(<ReligionPanel />)

    await waitFor(() => {
      expect(screen.getByText(/晨辉赞歌节/i)).toBeInTheDocument()
      expect(screen.getByText(/68%/i)).toBeInTheDocument()
      expect(screen.getByText(/日耀信仰/i)).toBeInTheDocument()
      expect(screen.getByText(/阿曜/i)).toBeInTheDocument()
    })
  })
})
