import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetWorldDemographics } = vi.hoisted(() => ({
  mockGetWorldDemographics: vi.fn(),
}))

vi.mock('../services/api', () => ({
  getWorldDemographics: mockGetWorldDemographics,
}))

import { PopulationPanel } from '../components/toolbar/PopulationPanel'

describe('PopulationPanel', () => {
  beforeEach(() => {
    mockGetWorldDemographics.mockReset()
  })

  it('loads and renders age distribution plus generational timeline', async () => {
    mockGetWorldDemographics.mockResolvedValue({
      age_distribution: { child: 2, adult: 5, elder: 1 },
      aging_index: 0.2,
      average_age: 322.5,
      retired_count: 1,
      recent_deaths: 0,
      generational_timeline: [
        { tick: 144, type: 'retirement', resident_name: '大强', summary: '大强退休' },
        { tick: 96, type: 'birth', resident_name: '新芽', summary: '新芽出生' },
      ],
    })

    render(<PopulationPanel />)

    expect(await screen.findByText('人口面板')).toBeInTheDocument()
    expect(screen.getByText('child')).toBeInTheDocument()
    expect(screen.getByText('adult')).toBeInTheDocument()
    expect(screen.getByText('elder')).toBeInTheDocument()
    expect(screen.getByText('大强退休')).toBeInTheDocument()
    expect(screen.getByText('新芽出生')).toBeInTheDocument()
  })

  it('refreshes demographics data when the refresh button is clicked', async () => {
    mockGetWorldDemographics
      .mockResolvedValueOnce({
        age_distribution: { child: 1, adult: 4, elder: 1 },
        aging_index: 0.25,
        average_age: 280,
        retired_count: 1,
        recent_deaths: 0,
        generational_timeline: [],
      })
      .mockResolvedValueOnce({
        age_distribution: { child: 2, adult: 4, elder: 2 },
        aging_index: 0.5,
        average_age: 350,
        retired_count: 2,
        recent_deaths: 1,
        generational_timeline: [{ tick: 188, type: 'death', resident_name: '老周', summary: '老周离世' }],
      })

    const user = userEvent.setup()
    render(<PopulationPanel />)

    expect(await screen.findByText('年龄金字塔')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /刷新人口|刷新人口统计/ }))

    await waitFor(() => {
      expect(mockGetWorldDemographics).toHaveBeenCalledTimes(2)
    })
    expect(screen.getByText('老周离世')).toBeInTheDocument()
  })
})
