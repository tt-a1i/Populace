import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetWorldHealth } = vi.hoisted(() => ({
  mockGetWorldHealth: vi.fn(),
}))

vi.mock('../services/api', () => ({
  getWorldHealth: mockGetWorldHealth,
}))

import { HealthPanel } from '../components/toolbar/HealthPanel'

describe('HealthPanel', () => {
  beforeEach(() => {
    mockGetWorldHealth.mockReset()
  })

  it('loads and renders epidemic metrics and hotspots', async () => {
    mockGetWorldHealth.mockResolvedValue({
      active_cases: 3,
      contagious_cases: 2,
      hospitalized_count: 1,
      treatment_rate: 0.33,
      average_hp: 0.71,
      illness_counts: { cold: 1, flu: 1, injury: 1 },
      outbreak_hotspots: [
        { location: '商业区', cases: 2, intensity: 1 },
        { location: '住宅区', cases: 1, intensity: 0.5 },
      ],
    })

    render(<HealthPanel />)

    expect(await screen.findByText('3')).toBeInTheDocument()
    expect(screen.getByText('商业区')).toBeInTheDocument()
    expect(screen.getByText('住宅区')).toBeInTheDocument()
    expect(screen.getByText('cold')).toBeInTheDocument()
    expect(screen.getByText('flu')).toBeInTheDocument()
    expect(screen.getByText('injury')).toBeInTheDocument()
  })

  it('refreshes the health data', async () => {
    mockGetWorldHealth
      .mockResolvedValueOnce({
        active_cases: 1,
        contagious_cases: 1,
        hospitalized_count: 0,
        treatment_rate: 0,
        average_hp: 0.92,
        illness_counts: { cold: 1 },
        outbreak_hotspots: [{ location: '商业区', cases: 1, intensity: 1 }],
      })
      .mockResolvedValueOnce({
        active_cases: 2,
        contagious_cases: 1,
        hospitalized_count: 1,
        treatment_rate: 0.5,
        average_hp: 0.81,
        illness_counts: { cold: 1, exhaustion: 1 },
        outbreak_hotspots: [{ location: '住宅区', cases: 2, intensity: 1 }],
      })

    const user = userEvent.setup()
    render(<HealthPanel />)

    expect(await screen.findByText('疫情总览')).toBeInTheDocument()
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /刷新健康|刷新疫情/ }))

    await waitFor(() => {
      expect(mockGetWorldHealth).toHaveBeenCalledTimes(2)
    })
    expect(screen.getByText('住宅区')).toBeInTheDocument()
  })
})
