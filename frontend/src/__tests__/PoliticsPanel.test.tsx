import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetWorldPolitics } = vi.hoisted(() => ({
  mockGetWorldPolitics: vi.fn(),
}))

vi.mock('../services/api', () => ({
  getWorldPolitics: mockGetWorldPolitics,
}))

import { PoliticsPanel } from '../components/toolbar/PoliticsPanel'

describe('PoliticsPanel', () => {
  beforeEach(() => {
    mockGetWorldPolitics.mockReset()
  })

  it('loads and renders mayor, policies and party distribution', async () => {
    mockGetWorldPolitics.mockResolvedValue({
      mayor: {
        resident_id: 'a1',
        resident_name: '小明',
        party: 'progressive',
        term_start: 500,
        term_end: 1000,
        approval: 0.61,
      },
      active_policies: [
        { type: 'welfare', effect: { mood_delta: 0.15, reserve_delta: -20 }, duration: 60 },
      ],
      election_countdown: 122,
      public_satisfaction: 0.58,
      party_distribution: {
        progressive: 2,
        conservative: 1,
        neutral: 1,
      },
      active_election: {
        issue: '镇长选举',
        total_votes: 3,
        status: 'active',
      },
      impeachment_risk: false,
    })

    render(<PoliticsPanel />)

    expect((await screen.findAllByText('小明')).length).toBeGreaterThan(0)
    expect(screen.getByText('welfare')).toBeInTheDocument()
    expect(screen.getByText('镇长选举')).toBeInTheDocument()
    expect(screen.getAllByText('progressive').length).toBeGreaterThan(0)
    expect(screen.getByText('conservative')).toBeInTheDocument()
  })

  it('refreshes the politics data', async () => {
    mockGetWorldPolitics
      .mockResolvedValueOnce({
        mayor: {
          resident_id: 'a1',
          resident_name: '小明',
          party: 'progressive',
          term_start: 500,
          term_end: 1000,
          approval: 0.61,
        },
        active_policies: [],
        election_countdown: 80,
        public_satisfaction: 0.52,
        party_distribution: { progressive: 2, conservative: 1, neutral: 1 },
        active_election: null,
        impeachment_risk: false,
      })
      .mockResolvedValueOnce({
        mayor: {
          resident_id: 'a2',
          resident_name: '小红',
          party: 'conservative',
          term_start: 600,
          term_end: 1100,
          approval: 0.47,
        },
        active_policies: [
          { type: 'security', effect: { safety_delta: 0.18 }, duration: 90 },
        ],
        election_countdown: 300,
        public_satisfaction: 0.44,
        party_distribution: { progressive: 1, conservative: 2, neutral: 1 },
        active_election: null,
        impeachment_risk: true,
      })

    const user = userEvent.setup()
    render(<PoliticsPanel />)

    expect((await screen.findAllByText('小明')).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /刷新政治|刷新 politics/i }))

    await waitFor(() => {
      expect(mockGetWorldPolitics).toHaveBeenCalledTimes(2)
    })
    expect(screen.getAllByText('小红').length).toBeGreaterThan(0)
    expect(screen.getByText('security')).toBeInTheDocument()
  })
})
