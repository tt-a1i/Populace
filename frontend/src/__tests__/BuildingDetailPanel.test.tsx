import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetBuildingDetails } = vi.hoisted(() => ({
  mockGetBuildingDetails: vi.fn(),
}))

vi.mock('../services/api', () => ({
  getBuildingDetails: mockGetBuildingDetails,
}))

import { BuildingDetailPanel } from '../components/toolbar/BuildingDetailPanel'

describe('BuildingDetailPanel', () => {
  beforeEach(() => {
    mockGetBuildingDetails.mockReset()
  })

  it('renders upgrade metadata and decoration stats', async () => {
    mockGetBuildingDetails.mockResolvedValue({
      id: 'cafe-1',
      type: 'cafe',
      name: '晨曦餐厅',
      capacity: 6,
      position: [4, 5],
      occupants: 3,
      level: 3,
      upgrades: ['expanded', 'luxury'],
      decoration_score: 0.82,
      current_residents: [],
      recent_visits: [],
      next_level: null,
      required_reserve: 0,
      reserve_ready: true,
      vote_passed: true,
      special_feature: 'banquet',
      visit_willingness: 0.71,
    })

    render(<BuildingDetailPanel buildingId="cafe-1" onClose={() => undefined} />)

    expect(await screen.findByText('Lv.3')).toBeInTheDocument()
    expect(screen.getByText('82')).toBeInTheDocument()
    expect(screen.getByText(/宴会功能/)).toBeInTheDocument()
    expect(screen.getByText(/expanded/)).toBeInTheDocument()
    expect(screen.getByText(/luxury/)).toBeInTheDocument()
  })
})
