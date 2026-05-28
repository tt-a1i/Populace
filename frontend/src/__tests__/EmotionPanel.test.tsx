import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const { mockGetEmotionHeatmap, mockGetEmotionHistory } = vi.hoisted(() => ({
  mockGetEmotionHeatmap: vi.fn().mockResolvedValue({
    grid: [[0.5, 0.3], [0.2, -0.1]],
    hotspots: [
      { x: 5, y: 5, mood: 'happy', avg_emotion: 0.6, resident_count: 5 },
      { x: 10, y: 10, mood: 'sad', avg_emotion: -0.4, resident_count: 3 },
    ],
    mood_distribution: { happy: 10, sad: 5, neutral: 3 },
    avg_happiness: 0.45,
  }),
  mockGetEmotionHistory: vi.fn().mockResolvedValue({
    history: Array.from({ length: 20 }, (_, i) => ({
      tick: i,
      avg_happiness: 0.3 + (i * 0.02),
    })),
  }),
}))

vi.mock('../../services/api', () => ({
  getEmotionHeatmap: mockGetEmotionHeatmap,
  getEmotionHistory: mockGetEmotionHistory,
}))

import { EmotionPanel } from '../components/toolbar/EmotionPanel'

describe('EmotionPanel', () => {
  it('renders happiness gauge', async () => {
    render(<EmotionPanel />)

    await waitFor(() => {
      expect(screen.getByText('全镇幸福度')).toBeInTheDocument()
    })
  })

  it('renders mood distribution section', async () => {
    render(<EmotionPanel />)

    await waitFor(() => {
      expect(screen.getByText('情绪分布')).toBeInTheDocument()
    })
  })

  it('has heatmap toggle button', async () => {
    render(<EmotionPanel />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /显示热力图/ })).toBeInTheDocument()
    })
  })

  it('toggles heatmap visibility on button click', async () => {
    render(<EmotionPanel />)

    await waitFor(() => screen.getByRole('button', { name: /显示热力图/ }))

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /显示热力图/ }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /隐藏热力图/ })).toBeInTheDocument()
    })
  })
})
