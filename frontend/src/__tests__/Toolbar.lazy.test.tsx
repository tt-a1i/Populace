import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('Toolbar lazy loading', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('shows a suspense fallback before a lazy panel resolves', async () => {
    vi.doMock('../components/toolbar/DirectorConsole', () => ({
      DirectorConsole: () => <div>DirectorConsole</div>,
    }))
    vi.doMock('../components/toolbar/PersonaEditor', () => ({
      PersonaEditor: () => <div>PersonaEditor</div>,
    }))
    vi.doMock('../components/toolbar/QuestPanel', () => ({
      QuestPanel: () => <div>QuestPanel</div>,
    }))
    vi.doMock('../components/report', () => ({
      ReportsPanel: () => <div>ReportsPanel</div>,
    }))
    vi.doMock('../components/toolbar/SettingsPanel', async () => {
      await new Promise((resolve) => setTimeout(resolve, 25))
      return { SettingsPanel: () => <div data-testid="settings-panel">SettingsPanel</div> }
    })

    const { Toolbar } = await import('../components/toolbar/Toolbar')
    const user = userEvent.setup()

    render(<Toolbar />)

    await user.click(screen.getByTestId('more-toggle'))
    await user.click(screen.getByRole('button', { name: /系统设置/ }))

    expect(screen.getByText('模块正在按需加载…')).toBeInTheDocument()
    expect(await screen.findByTestId('settings-panel')).toBeInTheDocument()
  })
})
