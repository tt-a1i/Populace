import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', () => ({
  getWorldFashion: vi.fn().mockResolvedValue({
    current_trend: {
      color_name: 'rose',
      color: '#FB7185',
      style: 'artisan',
      category: 'festive',
      started_tick: 200,
    },
    trend_history: [
      { color_name: 'sky', color: '#38BDF8', style: 'classic', category: 'casual', started_tick: 0 },
      { color_name: 'rose', color: '#FB7185', style: 'artisan', category: 'festive', started_tick: 200 },
    ],
    rankings: [
      {
        resident_id: 'a1',
        resident_name: '阿青',
        style_score: 0.92,
        clothing: 'festive',
        current_outfit: 'Rose Artisan 节日装',
        accent_color: '#FB7185',
        trend_match: true,
        designed_by_tailor: true,
      },
    ],
    consumption: {
      total_purchases: 4,
      total_spent: 62.5,
      average_spend: 15.63,
      top_category: 'festive',
      top_color: 'rose',
      recent_purchases: [
        {
          tick: 220,
          resident_id: 'a1',
          resident_name: '阿青',
          price: 18.5,
          category: 'festive',
          color_name: 'rose',
          style: 'artisan',
          item_name: 'Rose Artisan 节日装',
          designed_by: '阿裁',
        },
      ],
    },
  }),
}))

import { FashionPanel } from '../components/toolbar/FashionPanel'

describe('FashionPanel', () => {
  it('renders trend, rankings, and fashion spending metrics', async () => {
    render(<FashionPanel />)

    await waitFor(() => {
      // Trend color name and ranking resident name are data, not i18n
      expect(screen.getAllByText(/rose/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/阿青/).length).toBeGreaterThan(0)
      // Total spent metric value
      expect(screen.getByText('62.5')).toBeInTheDocument()
    })
  })
})
