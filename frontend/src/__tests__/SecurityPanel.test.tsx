import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetCrimeLog, mockGetSafetyStats } = vi.hoisted(() => ({
  mockGetCrimeLog: vi.fn(),
  mockGetSafetyStats: vi.fn(),
}))

vi.mock('../services/api', () => ({
  getCrimeLog: mockGetCrimeLog,
  getSafetyStats: mockGetSafetyStats,
}))

import { SecurityPanel } from '../components/toolbar/SecurityPanel'

describe('SecurityPanel', () => {
  beforeEach(() => {
    mockGetCrimeLog.mockReset()
    mockGetSafetyStats.mockReset()
  })

  it('loads and renders safety metrics, hotspots, and crime events', async () => {
    mockGetSafetyStats.mockResolvedValue({
      safety_index: 0.72,
      average_safety_feeling: 0.68,
      total_crimes: 5,
      unresolved_crimes: 2,
      crimes_by_type: {
        theft: 2,
        vandalism: 1,
        conflict: 2,
      },
      hotspots: [
        { location: '商业区', count: 3, resolved_count: 1, intensity: 1 },
        { location: '住宅区', count: 2, resolved_count: 1, intensity: 0.67 },
      ],
      flagged_residents: ['a1', 'a3'],
      patrol_zones: ['商业区'],
    })
    mockGetCrimeLog.mockResolvedValue([
      {
        type: 'theft',
        perpetrator: 'a1',
        victim: 'a2',
        location: '商业区',
        tick: 12,
        resolved: false,
      },
      {
        type: 'conflict',
        perpetrator: 'a3',
        victim: 'a4',
        location: '住宅区',
        tick: 10,
        resolved: true,
      },
    ])

    render(<SecurityPanel />)

    expect(await screen.findByText('0.72')).toBeInTheDocument()
    expect(screen.getByText('商业区')).toBeInTheDocument()
    expect(screen.getByText('住宅区')).toBeInTheDocument()
    expect(screen.getAllByText('theft').length).toBeGreaterThan(0)
    expect(screen.getByText('vandalism')).toBeInTheDocument()
    expect(screen.getAllByText('conflict').length).toBeGreaterThan(0)
    expect(screen.getByText('重点人员：a1、a3')).toBeInTheDocument()
    expect(screen.getByText('a1 → a2 · 商业区 · 未结案')).toBeInTheDocument()
  })

  it('refreshes data when the refresh button is clicked', async () => {
    mockGetSafetyStats
      .mockResolvedValueOnce({
        safety_index: 0.8,
        average_safety_feeling: 0.8,
        total_crimes: 1,
        unresolved_crimes: 1,
        crimes_by_type: { theft: 1 },
        hotspots: [{ location: '商业区', count: 1, resolved_count: 0, intensity: 1 }],
        flagged_residents: ['a1'],
        patrol_zones: [],
      })
      .mockResolvedValueOnce({
        safety_index: 0.6,
        average_safety_feeling: 0.55,
        total_crimes: 2,
        unresolved_crimes: 1,
        crimes_by_type: { theft: 1, conflict: 1 },
        hotspots: [{ location: '住宅区', count: 2, resolved_count: 1, intensity: 1 }],
        flagged_residents: ['a1', 'a2'],
        patrol_zones: ['住宅区'],
      })
    mockGetCrimeLog
      .mockResolvedValueOnce([
        { type: 'theft', perpetrator: 'a1', victim: 'a2', location: '商业区', tick: 1, resolved: false },
      ])
      .mockResolvedValueOnce([
        { type: 'conflict', perpetrator: 'a2', victim: 'a3', location: '住宅区', tick: 2, resolved: true },
      ])

    const user = userEvent.setup()
    render(<SecurityPanel />)

    expect(await screen.findByText('安全指数')).toBeInTheDocument()
    expect(screen.getAllByText('0.80').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /刷新治安|Refresh safety/ }))

    await waitFor(() => {
      expect(mockGetSafetyStats).toHaveBeenCalledTimes(2)
      expect(mockGetCrimeLog).toHaveBeenCalledTimes(2)
    })
    expect(screen.getAllByText('0.60').length).toBeGreaterThan(0)
    expect(screen.getByText('住宅区')).toBeInTheDocument()
  })
})
