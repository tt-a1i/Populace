import { act, render, screen } from '@testing-library/react'
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
vi.mock('../components/toolbar/ComparePanel', () => ({
  ComparePanel: () => <div data-testid="compare-panel">ComparePanel</div>,
}))
vi.mock('../components/toolbar/TimelinePanel', () => ({
  TimelinePanel: () => <div data-testid="timeline-panel">TimelinePanel</div>,
}))
vi.mock('../components/toolbar/SettingsPanel', () => ({
  SettingsPanel: () => <div data-testid="settings-panel">SettingsPanel</div>,
}))

import { Toolbar } from '../components/toolbar/Toolbar'

describe('Toolbar', () => {
  // --- Primary tools render by default ---
  it('renders the 导演台 primary tool button', () => {
    render(<Toolbar />)
    expect(screen.getByRole('button', { name: /导演台/ })).toBeInTheDocument()
  })

  it('renders the 人设编辑 primary tool button', () => {
    render(<Toolbar />)
    expect(screen.getByRole('button', { name: /人设编辑/ })).toBeInTheDocument()
  })

  it('renders the 剧情任务 primary tool button', () => {
    render(<Toolbar />)
    expect(screen.getByRole('button', { name: /剧情任务/ })).toBeInTheDocument()
  })

  it('renders the 今日日报 primary tool button', () => {
    render(<Toolbar />)
    expect(screen.getByRole('button', { name: /今日日报/ })).toBeInTheDocument()
  })

  it('renders the "更多" toggle button', () => {
    render(<Toolbar />)
    expect(screen.getByTestId('more-toggle')).toBeInTheDocument()
    expect(screen.getByTestId('more-toggle')).toHaveTextContent(/更多/)
  })

  // --- Secondary tools are hidden initially ---
  it('does not show secondary tools by default', () => {
    render(<Toolbar />)
    expect(screen.queryByTestId('secondary-row')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /建造模式/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /数据统计/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /系统设置/ })).not.toBeInTheDocument()
  })

  // --- Clicking "更多" shows secondary tools ---
  it('shows secondary tools when "更多" is clicked', async () => {
    render(<Toolbar />)
    await userEvent.click(screen.getByTestId('more-toggle'))
    expect(screen.getByTestId('secondary-row')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /建造模式/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /数据统计/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /创建居民/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /存档管理/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /系统设置/ })).toBeInTheDocument()
  })

  it('toggles "更多" label to "收起" when secondary is expanded', async () => {
    render(<Toolbar />)
    const toggle = screen.getByTestId('more-toggle')
    expect(toggle).toHaveTextContent(/更多/)
    await userEvent.click(toggle)
    expect(toggle).toHaveTextContent(/收起/)
  })

  // --- Default panel and active state ---
  it('shows EventInjector panel by default (director tool)', () => {
    render(<Toolbar />)
    expect(screen.getByTestId('event-injector')).toBeInTheDocument()
  })

  it('marks the default director tool button as active', () => {
    render(<Toolbar />)
    const directorButton = screen.getByRole('button', { name: /导演台/ })
    expect(directorButton.dataset.active).toBe('true')
  })

  // --- Panel switching for primary tools ---
  it('switches to PersonaEditor panel when 人设编辑 is clicked', async () => {
    render(<Toolbar />)
    await userEvent.click(screen.getByRole('button', { name: /人设编辑/ }))
    expect(screen.getByTestId('persona-editor')).toBeInTheDocument()
    expect(screen.queryByTestId('event-injector')).not.toBeInTheDocument()
  })

  it('switches to ReportsPanel when 今日日报 is clicked', async () => {
    render(<Toolbar />)
    await userEvent.click(screen.getByRole('button', { name: /今日日报/ }))
    expect(screen.getByTestId('reports-panel')).toBeInTheDocument()
  })

  it('shows quest placeholder when 剧情任务 is clicked', async () => {
    render(<Toolbar />)
    await userEvent.click(screen.getByRole('button', { name: /剧情任务/ }))
    expect(screen.getByText(/剧情任务即将上线/)).toBeInTheDocument()
  })

  // --- Selecting a secondary tool auto-expands the secondary row ---
  it('auto-expands secondary row when a secondary tool is selected via settings event', async () => {
    render(<Toolbar />)
    // Secondary row should be hidden initially
    expect(screen.queryByTestId('secondary-row')).not.toBeInTheDocument()
    // Dispatch the open-settings event inside act to flush state updates
    act(() => {
      window.dispatchEvent(new Event('populace:open-settings'))
    })
    // Secondary row should now be visible with settings active
    expect(screen.getByTestId('secondary-row')).toBeInTheDocument()
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument()
  })

  it('auto-expands secondary row when clicking a secondary tool after expanding', async () => {
    render(<Toolbar />)
    // Expand secondary tools
    await userEvent.click(screen.getByTestId('more-toggle'))
    // Click a secondary tool
    await userEvent.click(screen.getByRole('button', { name: /数据统计/ }))
    expect(screen.getByTestId('stats-panel')).toBeInTheDocument()
    // Secondary row should remain visible
    expect(screen.getByTestId('secondary-row')).toBeInTheDocument()
  })

  // --- Sound toggle ---
  it('renders the sound toggle button in the top controls', () => {
    render(<Toolbar />)
    expect(screen.getByTestId('sound-toggle')).toBeInTheDocument()
  })
})
