import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const { mockGetResidentRelationships, mockGetResidentAchievements } = vi.hoisted(() => ({
  mockGetResidentRelationships: vi.fn().mockResolvedValue([]),
  mockGetResidentAchievements: vi.fn().mockResolvedValue([
    { id: 'ach1', name: '首次旅行', unlocked: true },
  ]),
}))

vi.mock('../services/api', () => ({
  getResidentRelationships: mockGetResidentRelationships,
  getResidentAchievements: mockGetResidentAchievements,
}))

vi.mock('../stores/simulation', () => ({
  useSimulationStore: vi.fn((selector) => selector({
    residents: [
      { id: 'r1', name: '居民甲', outfit_color: '#FF5733', coins: 500, energy: 80 },
      { id: 'r2', name: '居民乙', outfit_color: '#33FF57', coins: 200, energy: 60 },
    ],
  })),
}))

vi.mock('../lib/residentAvatar', () => ({
  generateResidentAvatarDataUrl: vi.fn(() => 'data:image/png;base64,test'),
}))

import { LeaderboardPanel } from '../components/toolbar/LeaderboardPanel'

describe('LeaderboardPanel', () => {
  it('renders sort tabs', async () => {
    render(<LeaderboardPanel />)
    await waitFor(() => {
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThanOrEqual(4)
    })
  })

  it('shows residents after loading', async () => {
    render(<LeaderboardPanel />)
    await waitFor(() => {
      expect(screen.getByText('居民甲')).toBeInTheDocument()
    })
  })

  it('switches sort key on tab click', async () => {
    render(<LeaderboardPanel />)
    await waitFor(() => screen.getByText('居民甲'))
    const user = userEvent.setup()
    const buttons = screen.getAllByRole('button')
    await user.click(buttons[1])
    expect(mockGetResidentRelationships).toHaveBeenCalled()
  })
})
