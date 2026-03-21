import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// All mock factories must be pure (no outer variable references — vi.mock is hoisted)
vi.mock('../services/api', () => ({
  setSpeed: vi.fn().mockResolvedValue({}),
  startSimulation: vi.fn().mockResolvedValue({}),
  stopSimulation: vi.fn().mockResolvedValue({}),
}))

vi.mock('../stores', () => ({
  useSimulationStore: (selector: (s: { speed: number; setSpeed: () => void; setRunning: () => void }) => unknown) =>
    selector({ speed: 1, setSpeed: vi.fn(), setRunning: vi.fn() }),
}))

import * as api from '../services/api'
import { SpeedControl } from '../components/toolbar/SpeedControl'

describe('SpeedControl', () => {
  it('renders the pause button', () => {
    render(<SpeedControl />)
    expect(screen.getByRole('button', { name: /暂停/ })).toBeInTheDocument()
  })

  it('renders the 1x speed button', () => {
    render(<SpeedControl />)
    expect(screen.getByRole('button', { name: '1x' })).toBeInTheDocument()
  })

  it('renders the 2x speed button', () => {
    render(<SpeedControl />)
    expect(screen.getByRole('button', { name: '2x' })).toBeInTheDocument()
  })

  it('renders the 5x speed button', () => {
    render(<SpeedControl />)
    expect(screen.getByRole('button', { name: '5x' })).toBeInTheDocument()
  })

  it('renders the 10x speed button', () => {
    render(<SpeedControl />)
    expect(screen.getByRole('button', { name: '10x' })).toBeInTheDocument()
  })

  it('renders the 50x speed button', () => {
    render(<SpeedControl />)
    expect(screen.getByRole('button', { name: '50x' })).toBeInTheDocument()
  })

  it('renders all 4 speed control buttons', () => {
    render(<SpeedControl />)
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(4)
  })

  it('clicking pause calls stopSimulation', async () => {
    render(<SpeedControl />)
    await userEvent.click(screen.getByRole('button', { name: /暂停/ }))
    expect(api.stopSimulation).toHaveBeenCalled()
  })

  it('clicking 2x calls startSimulation then setSpeed with 2', async () => {
    render(<SpeedControl />)
    await userEvent.click(screen.getByRole('button', { name: '2x' }))
    expect(api.startSimulation).toHaveBeenCalled()
    expect(api.setSpeed).toHaveBeenCalledWith({ speed: 2 })
  })

  it('clicking 50x calls startSimulation then setSpeed with 50', async () => {
    render(<SpeedControl />)
    await userEvent.click(screen.getByRole('button', { name: '50x' }))
    expect(api.startSimulation).toHaveBeenCalled()
    expect(api.setSpeed).toHaveBeenCalledWith({ speed: 50 })
  })
})
