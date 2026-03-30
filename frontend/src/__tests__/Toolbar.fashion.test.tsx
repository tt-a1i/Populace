import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../components/toolbar/DirectorConsole', () => ({
  DirectorConsole: () => <div data-testid="director-console">DirectorConsole</div>,
}))
vi.mock('../components/toolbar/PersonaEditor', () => ({
  PersonaEditor: () => <div>PersonaEditor</div>,
}))
vi.mock('../components/toolbar/QuestPanel', () => ({
  QuestPanel: () => <div>QuestPanel</div>,
}))
vi.mock('../components/report', () => ({
  ReportsPanel: () => <div>ReportsPanel</div>,
}))
vi.mock('../components/toolbar/FashionPanel', () => ({
  FashionPanel: () => <div data-testid="fashion-panel">FashionPanel</div>,
}))

import { Toolbar } from '../components/toolbar/Toolbar'

describe('Toolbar fashion entry', () => {
  it('shows the fashion tool and opens FashionPanel', async () => {
    const user = userEvent.setup()
    render(<Toolbar />)

    await user.click(screen.getByTestId('more-toggle'))
    await user.click(screen.getByRole('button', { name: /时尚面板|fashion/i }))

    expect(await screen.findByTestId('fashion-panel')).toBeInTheDocument()
  })
})
