import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetWorldMarket } = vi.hoisted(() => ({
  mockGetWorldMarket: vi.fn(),
}))

vi.mock('../services/api', () => ({
  getWorldMarket: mockGetWorldMarket,
}))

import { MarketPanel } from '../components/toolbar/MarketPanel'

const MOCK_GOODS = [
  {
    id: 'food',
    name: '食物',
    emoji: '🌾',
    current_price: 5.50,
    base_price: 5.0,
    inventory: 90,
    demand_trend: 0.1,
    price_history: [5.0, 5.2, 5.5],
    trend: 'up' as const,
    change_pct: 10.0,
  },
  {
    id: 'cloth',
    name: '布料',
    emoji: '🧵',
    current_price: 7.20,
    base_price: 8.0,
    inventory: 75,
    demand_trend: -0.1,
    price_history: [8.0, 7.6, 7.2],
    trend: 'down' as const,
    change_pct: -10.0,
  },
]

describe('MarketPanel', () => {
  beforeEach(() => {
    mockGetWorldMarket.mockReset()
  })

  it('renders goods with name and price', async () => {
    mockGetWorldMarket.mockResolvedValue({ goods: MOCK_GOODS })
    render(<MarketPanel />)

    expect(await screen.findByText('食物')).toBeInTheDocument()
    expect(screen.getByText('布料')).toBeInTheDocument()
    expect(screen.getByText('5.50')).toBeInTheDocument()
    expect(screen.getByText('7.20')).toBeInTheDocument()
  })

  it('renders trend arrows for up and down trends', async () => {
    mockGetWorldMarket.mockResolvedValue({ goods: MOCK_GOODS })
    render(<MarketPanel />)

    await screen.findByText('食物')
    // up arrow for food
    expect(screen.getByText('↑')).toBeInTheDocument()
    // down arrow for cloth
    expect(screen.getByText('↓')).toBeInTheDocument()
  })

  it('renders change percentage badges', async () => {
    mockGetWorldMarket.mockResolvedValue({ goods: MOCK_GOODS })
    render(<MarketPanel />)

    await screen.findByText('食物')
    expect(screen.getByText('+10.0%')).toBeInTheDocument()
    expect(screen.getByText('-10.0%')).toBeInTheDocument()
  })

  it('renders emoji icons for goods', async () => {
    mockGetWorldMarket.mockResolvedValue({ goods: MOCK_GOODS })
    render(<MarketPanel />)

    await screen.findByText('🌾')
    expect(screen.getByText('🧵')).toBeInTheDocument()
  })

  it('refreshes goods on refresh button click', async () => {
    mockGetWorldMarket
      .mockResolvedValueOnce({ goods: MOCK_GOODS })
      .mockResolvedValueOnce({
        goods: [
          {
            ...MOCK_GOODS[0],
            current_price: 6.00,
            price_history: [5.0, 5.5, 6.0],
          },
          MOCK_GOODS[1],
        ],
      })

    const user = userEvent.setup()
    render(<MarketPanel />)

    await screen.findByText('食物')
    await user.click(screen.getByRole('button', { name: /刷新市场|Refresh/i }))

    await waitFor(() => {
      expect(mockGetWorldMarket).toHaveBeenCalledTimes(2)
    })
    expect(screen.getByText('6.00')).toBeInTheDocument()
  })

  it('renders inventory information', async () => {
    mockGetWorldMarket.mockResolvedValue({ goods: MOCK_GOODS })
    render(<MarketPanel />)

    await screen.findByText('食物')
    expect(screen.getByText(/90/)).toBeInTheDocument()
  })
})
