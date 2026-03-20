import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSimulationStats } = vi.hoisted(() => ({
  mockGetSimulationStats: vi.fn(),
}))

vi.mock('../services/api', () => ({
  getSimulationStats: mockGetSimulationStats,
}))

import { StatsPanel } from '../components/toolbar/StatsPanel'

describe('StatsPanel', () => {
  beforeEach(() => {
    mockGetSimulationStats.mockReset()
  })

  it('loads and renders simulation metrics from the stats API', async () => {
    mockGetSimulationStats.mockResolvedValue({
      total_ticks: 144,
      total_dialogues: 32,
      total_relationship_changes: 18,
      active_events: 3,
      average_mood_score: 0.42,
      most_social_resident: {
        id: 'r1',
        name: '小明',
        relationship_count: 6,
        relationship_intensity: 4.8,
      },
      loneliest_resident: {
        id: 'r9',
        name: '阿雅',
        relationship_count: 0,
        relationship_intensity: 0,
      },
      strongest_relationship: {
        from_id: 'r1',
        from_name: '小明',
        to_id: 'r2',
        to_name: '小红',
        type: 'friendship',
        intensity: 0.93,
      },
      total_memories: 87,
    })

    render(<StatsPanel />)

    expect(await screen.findByText('144')).toBeInTheDocument()
    expect(screen.getByText('0.42')).toBeInTheDocument()
    expect(screen.getByText('小明')).toBeInTheDocument()
    expect(screen.getByText('阿雅')).toBeInTheDocument()
    expect(screen.getByText('小明 ↔ 小红')).toBeInTheDocument()
    expect(screen.getByText(/friendship · 0.93/)).toBeInTheDocument()
    expect(screen.getByText('87')).toBeInTheDocument()
  })

  it('refreshes stats when the refresh button is clicked', async () => {
    mockGetSimulationStats
      .mockResolvedValueOnce({
        total_ticks: 10,
        total_dialogues: 1,
        total_relationship_changes: 2,
        active_events: 0,
        average_mood_score: 0,
        most_social_resident: null,
        loneliest_resident: null,
        strongest_relationship: null,
        total_memories: 3,
      })
      .mockResolvedValueOnce({
        total_ticks: 11,
        total_dialogues: 2,
        total_relationship_changes: 4,
        active_events: 1,
        average_mood_score: 0.1,
        most_social_resident: null,
        loneliest_resident: null,
        strongest_relationship: null,
        total_memories: 4,
      })

    const user = userEvent.setup()
    render(<StatsPanel />)

    expect(await screen.findByText('10')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /刷新统计|Refresh stats/ }))

    await waitFor(() => {
      expect(mockGetSimulationStats).toHaveBeenCalledTimes(2)
    })
    expect(screen.getByText('11')).toBeInTheDocument()
  })
})
