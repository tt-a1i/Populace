import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetWorldDiplomacy } = vi.hoisted(() => ({
  mockGetWorldDiplomacy: vi.fn(),
}))

vi.mock('../services/api', () => ({
  getWorldDiplomacy: mockGetWorldDiplomacy,
}))

import { DiplomacyPanel } from '../components/toolbar/DiplomacyPanel'

describe('DiplomacyPanel', () => {
  beforeEach(() => {
    mockGetWorldDiplomacy.mockReset()
  })

  it('renders neighboring towns, trade routes, and ledger entries', async () => {
    mockGetWorldDiplomacy.mockResolvedValue({
      towns: [
        {
          name: '海雾港',
          relation_score: 0.62,
          relation_status: 'friendly',
          trade_balance: 41.5,
          ambassador_id: 'a1',
          ambassador_name: '小明',
          specialties: ['海盐', '珍珠'],
        },
      ],
      trade_routes: [
        {
          id: 'Populace->海雾港',
          from_town: 'Populace',
          to_town: '海雾港',
          goods: ['coffee', 'silk'],
          profit_per_tick: 13.5,
          merchant_id: 'a2',
          merchant_name: '阿商',
          relation_status: 'friendly',
          rare_goods: ['珍珠'],
        },
      ],
      summary: {
        active_routes: 1,
        total_profit: 16.2,
        total_trade_balance: 41.5,
      },
      ledger: [
        {
          tick: 24,
          type: 'profit',
          town_name: '海雾港',
          route_id: 'Populace->海雾港',
          amount: 16.2,
          description: '海雾港 本轮送来了高利润海盐订单。',
        },
      ],
    })

    render(<DiplomacyPanel />)

    expect(await screen.findByText('海雾港')).toBeInTheDocument()
    expect(screen.getAllByText(/friendly/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/coffee/i)).toBeInTheDocument()
    expect(screen.getByText(/高利润海盐订单/)).toBeInTheDocument()
  })

  it('refreshes diplomacy data', async () => {
    mockGetWorldDiplomacy
      .mockResolvedValueOnce({
        towns: [],
        trade_routes: [],
        summary: { active_routes: 0, total_profit: 0, total_trade_balance: 0 },
        ledger: [],
      })
      .mockResolvedValueOnce({
        towns: [
          {
            name: '松风镇',
            relation_score: 0.08,
            relation_status: 'neutral',
            trade_balance: 8.4,
            ambassador_id: null,
            ambassador_name: null,
            specialties: ['木材'],
          },
        ],
        trade_routes: [],
        summary: { active_routes: 0, total_profit: 8.4, total_trade_balance: 8.4 },
        ledger: [],
      })

    const user = userEvent.setup()
    render(<DiplomacyPanel />)

    expect(await screen.findByText(/0 条路线|0 routes/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /刷新外交|刷新贸易/ }))

    await waitFor(() => {
      expect(mockGetWorldDiplomacy).toHaveBeenCalledTimes(2)
    })
    expect(screen.getByText('松风镇')).toBeInTheDocument()
  })
})
