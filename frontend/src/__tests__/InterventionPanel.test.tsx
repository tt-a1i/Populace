import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const { mockPushToast, mockPlay, mockIntervene, mockGetInterventionLog, mockGetResidents } = vi.hoisted(() => ({
  mockPushToast: vi.fn(),
  mockPlay: vi.fn(),
  mockIntervene: vi.fn().mockResolvedValue({ success: true, effect_description: '测试效果' }),
  mockGetInterventionLog: vi.fn().mockResolvedValue({ interventions: [] }),
  mockGetResidents: vi.fn().mockResolvedValue([]),
}))

vi.mock('../components/ui/ToastProvider', () => ({
  useToast: () => ({ pushToast: mockPushToast }),
}))

vi.mock('../audio', () => ({
  useSound: () => ({ enabled: true, play: mockPlay, toggleEnabled: vi.fn() }),
}))

vi.mock('../services/api', () => ({
  getResidents: mockGetResidents,
  getInterventionLog: mockGetInterventionLog,
  intervene: mockIntervene,
}))

import { InterventionPanel } from '../components/toolbar/InterventionPanel'

describe('InterventionPanel', () => {
  it('renders global event buttons', async () => {
    render(<InterventionPanel />)

    expect(screen.getByText('引发节庆')).toBeInTheDocument()
    expect(screen.getByText('召唤灾难')).toBeInTheDocument()
  })

  it('renders resident intervention section', async () => {
    mockGetResidents.mockResolvedValueOnce([
      { id: 'r1', name: '居民 A', mood: 'happy' },
      { id: 'r2', name: '居民 B', mood: 'neutral' },
    ])

    render(<InterventionPanel />)

    // Check for select elements (resident and action selectors)
    const selects = screen.getAllByRole('combobox')
    expect(selects.length).toBeGreaterThanOrEqual(1)

    // Check for execute button
    expect(screen.getByRole('button', { name: /intervention_panel.execute/i })).toBeInTheDocument()
  })

  it('calls intervene API when resident action is executed', async () => {
    mockGetResidents.mockResolvedValueOnce([
      { id: 'r1', name: '居民 A', mood: 'happy' },
    ])
    mockGetInterventionLog.mockResolvedValueOnce({ interventions: [] })

    const user = userEvent.setup()
    render(<InterventionPanel />)

    // Wait for resident select to be populated
    await waitFor(() => {
      const selects = screen.getAllByRole('combobox')
      expect(selects.length).toBeGreaterThanOrEqual(1)
    })

    // Get the action select (second combobox)
    const selects = screen.getAllByRole('combobox')
    const actionSelect = selects[1]

    // Select action (bless_resident is default, but let's explicitly select it)
    await user.selectOptions(actionSelect, 'bless_resident')

    // Click execute button
    const executeButton = screen.getByRole('button', { name: /intervention_panel.execute/i })
    await user.click(executeButton)

    await waitFor(() => {
      expect(mockIntervene).toHaveBeenCalledWith({
        action: 'bless_resident',
        target_id: 'r1',
      })
    })

    expect(mockPlay).toHaveBeenCalledWith('event')
    expect(mockPushToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    )
  })

  it('calls intervene API for global actions', async () => {
    mockGetInterventionLog.mockResolvedValueOnce({ interventions: [] })

    const user = userEvent.setup()
    render(<InterventionPanel />)

    await user.click(screen.getByText('引发节庆'))

    await waitFor(() => {
      expect(mockIntervene).toHaveBeenCalledWith({ action: 'trigger_festival' })
    })

    expect(mockPlay).toHaveBeenCalledWith('event')
    expect(mockPushToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    )
  })

  it('shows cooldown timer after global action', async () => {
    mockGetInterventionLog.mockResolvedValueOnce({ interventions: [] })

    const user = userEvent.setup()
    render(<InterventionPanel />)

    await user.click(screen.getByText('引发节庆'))

    await waitFor(() => {
      expect(screen.getByText('30s')).toBeInTheDocument()
    })
  })

  it('displays intervention history', async () => {
    mockGetInterventionLog.mockResolvedValueOnce({
      interventions: [
        {
          id: '1',
          tick: 5,
          action: 'bless_resident',
          target_id: 'r1',
          target_name: '居民 A',
          value: null,
          effect_description: '祝福效果',
          timestamp: '2024-01-01T00:00:00Z',
        },
      ],
    })

    render(<InterventionPanel />)

    await waitFor(() => {
      expect(screen.getByText('祝福效果')).toBeInTheDocument()
    })
  })
})
