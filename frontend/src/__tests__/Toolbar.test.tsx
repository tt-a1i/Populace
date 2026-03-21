import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// Mock all sub-components and APIs to keep tests focused on Toolbar logic
vi.mock('../components/toolbar/EventInjector', () => ({
  EventInjector: () => <div data-testid="event-injector">EventInjector</div>,
}))
vi.mock('../components/toolbar/PersonaEditor', () => ({
  PersonaEditor: () => <div data-testid="persona-editor">PersonaEditor</div>,
}))
vi.mock('../components/toolbar/SpeedControl', () => ({
  SpeedControl: () => <div data-testid="speed-control">SpeedControl</div>,
}))
vi.mock('../components/toolbar/SoundToggleButton', () => ({
  SoundToggleButton: () => <div data-testid="sound-toggle">SoundToggle</div>,
}))
vi.mock('../components/toolbar/SavesPanel', () => ({
  SavesPanel: () => <div data-testid="saves-panel">SavesPanel</div>,
}))
vi.mock('../components/toolbar/StatsPanel', () => ({
  StatsPanel: () => <div data-testid="stats-panel">StatsPanel</div>,
}))
vi.mock('../components/report', () => ({
  ReportsPanel: () => <div data-testid="reports-panel">ReportsPanel</div>,
}))
vi.mock('../components/ui', () => ({
  MessageBar: () => <div data-testid="message-bar">MessageBar</div>,
  LanguageSwitcher: () => <button>EN</button>,
}))
vi.mock('../components/toolbar/BuildPanel', () => ({
  BuildPanel: () => <div data-testid="build-panel">BuildPanel</div>,
}))
vi.mock('../components/toolbar/ExportPanel', () => ({
  ExportPanel: () => <div data-testid="export-panel">ExportPanel</div>,
}))
vi.mock('../components/toolbar/HeatmapPanel', () => ({
  HeatmapPanel: () => <div data-testid="heatmap-panel">HeatmapPanel</div>,
}))
vi.mock('../components/toolbar/ResidentCreationWizard', () => ({
  ResidentCreationWizard: () => <div data-testid="resident-creation-wizard">ResidentCreationWizard</div>,
}))

import { Toolbar } from '../components/toolbar/Toolbar'

describe('Toolbar', () => {
  it('renders the 事件投放 tool button', () => {
    render(<Toolbar />)
    expect(screen.getByRole('button', { name: /事件投放/ })).toBeInTheDocument()
  })

  it('renders the 人设编辑 tool button', () => {
    render(<Toolbar />)
    expect(screen.getByRole('button', { name: /人设编辑/ })).toBeInTheDocument()
  })

  it('renders the 建造模式 tool button', () => {
    render(<Toolbar />)
    expect(screen.getByRole('button', { name: /建造模式/ })).toBeInTheDocument()
  })

  it('renders the 小镇日报 tool button', () => {
    render(<Toolbar />)
    expect(screen.getByRole('button', { name: /小镇日报/ })).toBeInTheDocument()
  })

  it('renders the 数据统计 tool button', () => {
    render(<Toolbar />)
    expect(screen.getByRole('button', { name: /数据统计/ })).toBeInTheDocument()
  })

  it('shows EventInjector panel by default', () => {
    render(<Toolbar />)
    expect(screen.getByTestId('event-injector')).toBeInTheDocument()
  })

  it('renders the sound toggle button in the top controls', () => {
    render(<Toolbar />)
    expect(screen.getByTestId('sound-toggle')).toBeInTheDocument()
  })

  it('switches to PersonaEditor panel when 人设编辑 is clicked', async () => {
    render(<Toolbar />)
    await userEvent.click(screen.getByRole('button', { name: /人设编辑/ }))
    expect(screen.getByTestId('persona-editor')).toBeInTheDocument()
    expect(screen.queryByTestId('event-injector')).not.toBeInTheDocument()
  })

  it('switches to ReportsPanel when 小镇日报 is clicked', async () => {
    render(<Toolbar />)
    await userEvent.click(screen.getByRole('button', { name: /小镇日报/ }))
    expect(screen.getByTestId('reports-panel')).toBeInTheDocument()
  })

  it('switches to StatsPanel when 数据统计 is clicked', async () => {
    render(<Toolbar />)
    await userEvent.click(screen.getByRole('button', { name: /数据统计/ }))
    expect(screen.getByTestId('stats-panel')).toBeInTheDocument()
  })

  it('displays the active tool name in the status bar', () => {
    render(<Toolbar />)
    // Status bar contains "当前工具：事件投放"
    expect(screen.getByText(/当前工具/)).toBeInTheDocument()
    const statusBar = screen.getByText(/当前工具/)
    expect(statusBar.textContent).toContain('事件投放')
  })
})
