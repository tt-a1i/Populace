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
vi.mock('../components/toolbar/BuildPanel', () => ({
  BuildPanel: () => <div data-testid="build-panel">BuildPanel</div>,
}))
vi.mock('../components/toolbar/VotePanel', () => ({
  VotePanel: () => <div data-testid="vote-panel">VotePanel</div>,
}))
vi.mock('../components/toolbar/SettingsPanel', () => ({
  SettingsPanel: () => <div data-testid="settings-panel">SettingsPanel</div>,
}))
vi.mock('../components/toolbar/DialogueHistory', () => ({
  DialogueHistory: () => <div data-testid="dialogue-panel">DialogueHistory</div>,
}))
vi.mock('../components/toolbar/SavesPanel', () => ({
  SavesPanel: () => <div data-testid="saves-panel">SavesPanel</div>,
}))
vi.mock('../components/toolbar/ComparePanel', () => ({
  ComparePanel: () => <div data-testid="compare-panel">ComparePanel</div>,
}))
vi.mock('../components/toolbar/TimelinePanel', () => ({
  TimelinePanel: () => <div data-testid="timeline-panel">TimelinePanel</div>,
}))
vi.mock('../components/toolbar/ExportPanel', () => ({
  ExportPanel: () => <div data-testid="export-panel">ExportPanel</div>,
}))
vi.mock('../components/toolbar/DashboardView', () => ({
  DashboardView: () => <div data-testid="dashboard-panel">Dashboard</div>,
}))
vi.mock('../components/toolbar/LeaderboardPanel', () => ({
  LeaderboardPanel: () => <div data-testid="leaderboard-panel">Leaderboard</div>,
}))
vi.mock('../components/toolbar/AchievementWall', () => ({
  AchievementWall: () => <div data-testid="achievements-panel">Achievements</div>,
}))
vi.mock('../components/toolbar/NewspaperPanel', () => ({
  NewspaperPanel: () => <div data-testid="newspaper-panel">Newspaper</div>,
}))
vi.mock('../components/toolbar/WhatIfPanel', () => ({
  WhatIfPanel: () => <div data-testid="whatif-panel">WhatIf</div>,
}))
vi.mock('../components/town/MapEditor', () => ({
  MapEditor: () => <div data-testid="map-editor">MapEditor</div>,
}))
vi.mock('../components/toolbar/RulesPanel', () => ({
  RulesPanel: () => <div data-testid="rules-panel">Rules</div>,
}))
vi.mock('../components/toolbar/KnowledgeGraphPanel', () => ({
  KnowledgeGraphPanel: () => <div data-testid="knowledge-panel">Knowledge</div>,
}))
vi.mock('../components/toolbar/FamilyPanel', () => ({
  FamilyPanel: () => <div data-testid="family-panel">FamilyPanel</div>,
}))
vi.mock('../components/report', () => ({
  ReportsPanel: () => <div data-testid="reports-panel">Reports</div>,
}))
vi.mock('../components/ui/ActivityLog', () => ({
  ActivityLog: () => <div data-testid="activity-panel">ActivityLog</div>,
}))
vi.mock('../components/toolbar/ResidentCreationWizard', () => ({
  ResidentCreationWizard: () => <div data-testid="create-panel">Create</div>,
}))
vi.mock('../components/toolbar/StatsPanel', () => ({
  StatsPanel: () => <div data-testid="stats-panel">Stats</div>,
}))
vi.mock('../components/toolbar/HeatmapPanel', () => ({
  HeatmapPanel: () => <div data-testid="heatmap-panel">Heatmap</div>,
}))

import { Toolbar } from '../components/toolbar/Toolbar'

describe('Toolbar family tool', () => {
  it('shows the family panel from the secondary toolbar row', async () => {
    render(<Toolbar />)
    await userEvent.click(screen.getByTestId('more-toggle'))
    await userEvent.click(screen.getByRole('button', { name: /家族谱系/i }))
    expect(screen.getByTestId('family-panel')).toBeInTheDocument()
  })
})
