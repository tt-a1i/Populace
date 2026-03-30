import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../components/toolbar/DirectorConsole', () => ({
  DirectorConsole: () => <div data-testid="director-console">DirectorConsole</div>,
}))
vi.mock('../components/toolbar/PersonaEditor', () => ({
  PersonaEditor: () => <div data-testid="persona-editor">PersonaEditor</div>,
}))
vi.mock('../components/toolbar/QuestPanel', () => ({
  QuestPanel: () => <div data-testid="quest-panel">QuestPanel</div>,
}))
vi.mock('../components/report', () => ({
  ReportsPanel: () => <div data-testid="reports-panel">ReportsPanel</div>,
}))
vi.mock('../components/toolbar/EmergencyPanel', () => ({
  EmergencyPanel: () => <div data-testid="emergency-panel">EmergencyPanel</div>,
}))

import { Toolbar } from '../components/toolbar/Toolbar'

describe('Toolbar emergency entry', () => {
  it('shows the emergency button and opens EmergencyPanel', async () => {
    render(<Toolbar />)

    await userEvent.click(screen.getByTestId('more-toggle'))
    expect(screen.getByRole('button', { name: /应急面板|应急/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /应急面板|应急/ }))
    expect(await screen.findByTestId('emergency-panel')).toBeInTheDocument()
  })
})
