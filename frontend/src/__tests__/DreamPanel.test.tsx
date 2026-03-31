import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetWorldDreamStats } = vi.hoisted(() => ({
  mockGetWorldDreamStats: vi.fn(),
}))

vi.mock('../services/api', () => ({
  getWorldDreamStats: mockGetWorldDreamStats,
}))

import { DreamPanel } from '../components/toolbar/DreamPanel'

const EMPTY_STATS = {
  dreams_fulfilled_total: 0,
  top_dreams: [],
  avg_progress: 0,
  recent_fulfillments: [],
}

describe('DreamPanel', () => {
  beforeEach(() => {
    mockGetWorldDreamStats.mockReset()
    mockGetWorldDreamStats.mockResolvedValue(EMPTY_STATS)
  })

  it('renders fulfilled count and avg progress', async () => {
    mockGetWorldDreamStats.mockResolvedValue({
      dreams_fulfilled_total: 7,
      top_dreams: [],
      avg_progress: 0.42,
      recent_fulfillments: [],
    })

    render(<DreamPanel />)

    expect(await screen.findByText('7')).toBeInTheDocument()
    expect(screen.getByText('平均进度 42%')).toBeInTheDocument()
  })

  it('renders top 3 dreams ranking', async () => {
    mockGetWorldDreamStats.mockResolvedValue({
      dreams_fulfilled_total: 3,
      top_dreams: [
        { dream: '成为富翁', count: 5 },
        { dream: '找到真爱', count: 3 },
        { dream: '环游世界', count: 2 },
      ],
      avg_progress: 0.3,
      recent_fulfillments: [],
    })

    render(<DreamPanel />)

    expect(await screen.findByText('成为富翁')).toBeInTheDocument()
    expect(screen.getByText('找到真爱')).toBeInTheDocument()
    expect(screen.getByText('环游世界')).toBeInTheDocument()
    expect(screen.getByText('5 人')).toBeInTheDocument()
  })

  it('renders recent fulfillment events', async () => {
    mockGetWorldDreamStats.mockResolvedValue({
      dreams_fulfilled_total: 2,
      top_dreams: [],
      avg_progress: 0.6,
      recent_fulfillments: [
        { resident_id: 'r1', resident_name: '小明', dream: '留下传说', tick: 50 },
        { resident_id: 'r2', resident_name: '小红', dream: '成为名人', tick: 60 },
      ],
    })

    render(<DreamPanel />)

    expect(await screen.findByText('小明')).toBeInTheDocument()
    expect(screen.getByText('「留下传说」')).toBeInTheDocument()
    expect(screen.getByText('小红')).toBeInTheDocument()
    expect(screen.getByText('「成为名人」')).toBeInTheDocument()
  })

  it('shows empty state message when no data', async () => {
    mockGetWorldDreamStats.mockResolvedValue(EMPTY_STATS)

    render(<DreamPanel />)

    expect(await screen.findByText(/居民们正在追逐梦想/)).toBeInTheDocument()
  })

  it('refreshes on button click', async () => {
    mockGetWorldDreamStats
      .mockResolvedValueOnce(EMPTY_STATS)
      .mockResolvedValueOnce({
        dreams_fulfilled_total: 1,
        top_dreams: [{ dream: '保卫家园', count: 1 }],
        avg_progress: 0.5,
        recent_fulfillments: [],
      })

    const user = userEvent.setup()
    render(<DreamPanel />)

    // Wait for initial load
    await screen.findByText('居民们正在追逐梦想，耐心等待…')

    await user.click(screen.getByRole('button', { name: /刷新/i }))

    await waitFor(() => {
      expect(mockGetWorldDreamStats).toHaveBeenCalledTimes(2)
    })
    expect(screen.getByText('1')).toBeInTheDocument()
  })
})
