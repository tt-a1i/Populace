import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetWorldDisasters } = vi.hoisted(() => ({
  mockGetWorldDisasters: vi.fn(),
}))

vi.mock('../services/api', () => ({
  getWorldDisasters: mockGetWorldDisasters,
}))

import { EmergencyPanel } from '../components/toolbar/EmergencyPanel'

describe('EmergencyPanel', () => {
  beforeEach(() => {
    mockGetWorldDisasters.mockReset()
  })

  it('loads and renders active disasters, history, and summary', async () => {
    mockGetWorldDisasters.mockResolvedValue({
      current: [
        {
          type: 'fire',
          severity: 0.78,
          affected_buildings: ['home1', 'cafe1'],
          tick_start: 120,
          duration: 8,
          casualties: 1,
          status: 'active',
          reserve_spent: 26,
          evacuations: 3,
        },
      ],
      history: [
        {
          type: 'flood',
          severity: 0.61,
          affected_buildings: ['school1'],
          tick_start: 80,
          duration: 12,
          casualties: 0,
          status: 'completed',
          reserve_spent: 18,
          evacuations: 2,
          memorial: '洪水退去后，居民重建了步道。',
        },
      ],
      summary: {
        active_count: 1,
        history_count: 1,
        affected_buildings: 3,
        total_casualties: 1,
        reserve_spent: 44,
        by_type: { fire: 1, flood: 1 },
      },
    })

    render(<EmergencyPanel />)

    expect(await screen.findByText('应急面板')).toBeInTheDocument()
    expect(screen.getAllByText('fire').length).toBeGreaterThan(0)
    expect(screen.getAllByText('flood').length).toBeGreaterThan(0)
    expect(screen.getByText('洪水退去后，居民重建了步道。')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('44')).toBeInTheDocument()
  })

  it('refreshes disaster data', async () => {
    mockGetWorldDisasters
      .mockResolvedValueOnce({
        current: [],
        history: [],
        summary: {
          active_count: 0,
          history_count: 0,
          affected_buildings: 0,
          total_casualties: 0,
          reserve_spent: 0,
          by_type: {},
        },
      })
      .mockResolvedValueOnce({
        current: [
          {
            type: 'earthquake',
            severity: 0.83,
            affected_buildings: ['clinic1'],
            tick_start: 160,
            duration: 6,
            casualties: 2,
            status: 'active',
            reserve_spent: 35,
            evacuations: 5,
          },
        ],
        history: [],
        summary: {
          active_count: 1,
          history_count: 0,
          affected_buildings: 1,
          total_casualties: 2,
          reserve_spent: 35,
          by_type: { earthquake: 1 },
        },
      })

    const user = userEvent.setup()
    render(<EmergencyPanel />)

    expect(await screen.findByText('当前暂无灾害')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /刷新应急|刷新灾害/ }))

    await waitFor(() => {
      expect(mockGetWorldDisasters).toHaveBeenCalledTimes(2)
    })
    expect(screen.getAllByText('earthquake').length).toBeGreaterThan(0)
  })
})
