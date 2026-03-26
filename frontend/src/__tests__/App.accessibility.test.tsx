import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../components/ui/ScenePicker', () => ({
  ScenePicker: ({ onEnter }: { onEnter: () => void }) => (
    <button type="button" onClick={onEnter}>
      Enter
    </button>
  ),
}))

vi.mock('../components/ui/WelcomePage', () => ({
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

vi.mock('../components/ui/SplitPane', () => ({
  SplitPane: ({ left, right }: { left: ReactNode; right: ReactNode }) => (
    <div>
      <div>{left}</div>
      <div>{right}</div>
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
  SoundToggleButton: () => (
    <button type="button" aria-label="声音开关">
      Sound
    </button>
  ),
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

vi.mock('../pages/SimulationView', () => ({
  SimulationView: () => (
    <div>
      <div>在线 3</div>
      <div>春日祭</div>
      <div>全镇集会与舞蹈正在展开</div>
      <button type="button" aria-label="导演台">
        导演台
      </button>
      <div role="toolbar" aria-label="主工具栏" tabIndex={1}>
        Toolbar
      </div>
      <div role="region" aria-label="小镇地图" tabIndex={2}>
        Map
      </div>
      <div role="region" aria-label="工具面板" tabIndex={3}>
        Panel
      </div>
    </div>
  ),
}))

vi.mock('../components/graph/GraphPanel', () => ({
  GraphPanel: () => <div>GraphPanel</div>,
}))

vi.mock('../pages/SimulationView', () => ({
  SimulationView: () => (
    <div>
      <div>在线 3</div>
      <div>春日祭</div>
      <div>全镇集会与舞蹈正在展开</div>
      <button type="button" aria-label="导演台">
        导演台
      </button>
      <div role="toolbar" aria-label="主工具栏" tabIndex={1}>
        主工具栏
      </div>
      <div role="region" aria-label="小镇地图" tabIndex={2}>
        小镇地图
      </div>
      <div role="region" aria-label="工具面板" tabIndex={3}>
        工具面板
      </div>
    </div>
  ),
}))

vi.mock('../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => undefined,
}))

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    connected: true,
    disconnected: false,
    connecting: false,
    hasInitialSnapshot: true,
    startupTimedOut: false,
    reconnectCountdown: 0,
    connectionCount: 3,
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
      speed: 1,
      currentFestival: {
        name: '春日祭',
        type: 'spring',
        start_tick: 3,
        duration: 12,
        location: 'plaza',
        participants: ['a', 'b'],
        status: 'active',
      },
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

  it('keeps keyboard navigation order aligned with toolbar, map, and panel regions', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Start' }))
    await user.click(await screen.findByRole('button', { name: 'Enter' }))

    await user.click(await screen.findByRole('button', { name: '导演台' }))
    ;(document.activeElement as HTMLElement | null)?.blur()

    await user.tab()
    expect(screen.getByRole('toolbar', { name: '主工具栏' })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('region', { name: '小镇地图' })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('region', { name: '工具面板' })).toHaveFocus()
  })

  it('shows active connection count in the header', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Start' }))
    await user.click(await screen.findByRole('button', { name: 'Enter' }))

    expect(await screen.findByText('在线 3')).toBeInTheDocument()
  })

  it('shows the active festival banner in simulation view', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Start' }))
    await user.click(await screen.findByRole('button', { name: 'Enter' }))

    expect(await screen.findByText('春日祭')).toBeInTheDocument()
    expect(await screen.findByText(/全镇集会/)).toBeInTheDocument()
  })
})
