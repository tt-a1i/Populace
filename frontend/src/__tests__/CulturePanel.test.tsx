import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', () => ({
  getWorldCulture: vi.fn().mockResolvedValue({
    events: [
      {
        type: 'concert',
        name: '河畔黄昏音乐会',
        venue_id: 'park1',
        organizer_id: 'a1',
        participants: ['a1', 'a2'],
        tick_start: 96,
        duration: 6,
      },
    ],
    prosperity_index: 0.72,
    prosperity_history: [
      { tick: 48, prosperity_index: 0.5 },
      { tick: 96, prosperity_index: 0.72 },
    ],
    talent_rankings: [
      { resident_id: 'a1', resident_name: '阿青', artistic_talent: 0.93, art_skill: 0.88 },
    ],
  }),
}))

import { CulturePanel } from '../components/toolbar/CulturePanel'

describe('CulturePanel', () => {
  it('renders cultural events, prosperity trend, and talent rankings', async () => {
    render(<CulturePanel />)

    await waitFor(() => {
      expect(screen.getByText(/河畔黄昏音乐会/i)).toBeInTheDocument()
      expect(screen.getByText(/72%/i)).toBeInTheDocument()
      expect(screen.getByText(/阿青/i)).toBeInTheDocument()
    })
  })
})
