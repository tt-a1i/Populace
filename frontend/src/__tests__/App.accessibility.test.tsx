import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../components/ui', () => ({
  FirstRunGuide: () => null,
  LanguageSwitcher: () => <button type="button" aria-label="切换语言">Lang</button>,
  LoadingTransition: () => <div>Loading</div>,
  MessageBar: () => <div>MessageBar</div>,
  ScenePicker: ({ onEnter }: { onEnter: () => void }) => (
    <button type="button" onClick={onEnter}>
      Enter
    </button>
  ),
  ThemeToggle: () => <button type="button" aria-label="切换主题">Theme</button>,
  WelcomePage: ({ onStart, onGuide }: { onStart: () => void; onGuide: () => void }) => (
    <div>
      <button type="button" onClick={onStart}>
        Start
      </button>
      <button type="button" onClick={onGuide}>
        Guide
      </button>
    </div>
  ),
}))

vi.mock('../components/ui/OnboardingDrama', () => ({
  OnboardingDrama: () => null,
}))

vi.mock('../components/ui/TutorialOverlay', () => ({
  TutorialOverlay: () => null,
}))

vi.mock('../components/toolbar/SoundToggleButton', () => ({
  SoundToggleButton: () => <button type="button" aria-label="声音开关">Sound</button>,
}))

vi.mock('../components/toolbar/SpeedControl', () => ({
  SpeedControl: () => <div>Speed</div>,
}))

vi.mock('../components/toolbar/Toolbar', () => ({
  Toolbar: () => <div>Toolbar Panel</div>,
}))

vi.mock('../components/town/TownCanvas', () => ({
  TownCanvas: () => <div data-testid="town-canvas-mock">TownCanvas</div>,
}))

vi.mock('../components/graph/GraphPanel', () => ({
  GraphPanel: () => <div>GraphPanel</div>,
}))

vi.mock('../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => undefined,
}))

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    connected: true,
    disconnected: false,
    hasInitialSnapshot: true,
    startupTimedOut: false,
    reconnectCountdown: 0,
    maxRetriesExceeded: false,
    retry: vi.fn(),
  }),
}))

vi.mock('../stores/simulation', () => ({
  useSimulationStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      selectedResidentId: null,
      time: 'Day 1, 08:00',
      weather: 'sunny',
      season: 'spring',
    }),
}))

vi.mock('../stores/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../stores/theme')>()
  return {
    ...actual,
    useThemeStore: (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        theme: 'dark',
        accent: 'blue',
      }),
  }
})

import App from '../App'

describe('App accessibility flow', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue('1'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
  })

  it('keeps keyboard navigation order aligned with toolbar, map, graph, and panel regions', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Start' }))
    await user.click(screen.getByRole('button', { name: 'Enter' }))

    await user.click(screen.getByRole('button', { name: '导演台' }))
    await user.click(screen.getByRole('button', { name: '关系图谱' }))
    ;(document.activeElement as HTMLElement | null)?.blur()

    await user.tab()
    expect(screen.getByRole('toolbar', { name: '主工具栏' })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('region', { name: '小镇地图' })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('region', { name: '关系图谱面板' })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('region', { name: '工具面板' })).toHaveFocus()
  })
})
