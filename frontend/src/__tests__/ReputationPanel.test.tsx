import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetReputationRankings } = vi.hoisted(() => ({
  mockGetReputationRankings: vi.fn(),
}))

vi.mock('../services/api', () => ({
  getReputationRankings: mockGetReputationRankings,
}))

import { ReputationPanel } from '../components/toolbar/ReputationPanel'

describe('ReputationPanel', () => {
  beforeEach(() => {
    mockGetReputationRankings.mockReset()
  })

  it('loads and renders reputation rankings', async () => {
    mockGetReputationRankings.mockResolvedValue([
      {
        resident_id: 'r1',
        resident_name: '小明',
        reputation: 0.92,
        title: '镇上名人',
        recent_events: ['helped_other', 'social_active'],
      },
      {
        resident_id: 'r2',
        resident_name: '小红',
        reputation: 0.31,
        title: '',
        recent_events: ['vote_participation'],
      },
    ])

    render(<ReputationPanel />)

    expect(await screen.findByRole('heading', { name: '小明' })).toBeInTheDocument()
    expect(screen.getByText('镇上名人')).toBeInTheDocument()
    expect(screen.getByText('0.92')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '小红' })).toBeInTheDocument()
  })

  it('refreshes the rankings', async () => {
    mockGetReputationRankings
      .mockResolvedValueOnce([
        { resident_id: 'r1', resident_name: '小明', reputation: 0.5, title: '', recent_events: [] },
      ])
      .mockResolvedValueOnce([
        { resident_id: 'r1', resident_name: '小明', reputation: 0.7, title: '', recent_events: ['social_active'] },
      ])

    const user = userEvent.setup()
    render(<ReputationPanel />)

    expect(await screen.findByText('0.50')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /刷新声望/ }))

    await waitFor(() => {
      expect(mockGetReputationRankings).toHaveBeenCalledTimes(2)
    })
    expect(screen.getByText('0.70')).toBeInTheDocument()
  })
})
