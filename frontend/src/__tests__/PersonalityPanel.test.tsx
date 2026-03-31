import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', () => ({
  getPersonalityStats: vi.fn().mockResolvedValue({
    extraversion: 0.72,
    optimism: 0.58,
    thrift: 0.41,
    adventurousness: 0.65,
  }),
}))

import { PersonalityPanel } from '../components/toolbar/PersonalityPanel'

describe('PersonalityPanel', () => {
  it('renders all four personality trait bars', async () => {
    render(<PersonalityPanel />)

    await waitFor(() => {
      // Each trait bar should render its percentage
      expect(screen.getByText('72%')).toBeTruthy()
      expect(screen.getByText('58%')).toBeTruthy()
      expect(screen.getByText('41%')).toBeTruthy()
      expect(screen.getByText('65%')).toBeTruthy()
    })
  })

  it('shows error message when API fails', async () => {
    const { getPersonalityStats } = await import('../services/api')
    ;(getPersonalityStats as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'))

    render(<PersonalityPanel />)

    await waitFor(() => {
      expect(screen.getByText(/加载失败|Failed/i)).toBeTruthy()
    })
  })
})
