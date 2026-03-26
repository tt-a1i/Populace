import { act, render, screen } from '@testing-library/react'
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

vi.mock('../pages/GuidePage', () => ({
  GuidePage: ({ onBack }: { onBack: () => void }) => (
    <div>
      <h1>Guide Page</h1>
      <button type="button" onClick={onBack}>
        Back
      </button>
    </div>
  ),
}))

vi.mock('../pages/SimulationView', () => ({
  SimulationView: () => <div>TownCanvas</div>,
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
  SoundToggleButton: () => <button type="button">Sound</button>,
}))

vi.mock('../components/toolbar/SpeedControl', () => ({
  SpeedControl: () => <div>Speed</div>,
}))

vi.mock('../components/toolbar/Toolbar', () => ({
  Toolbar: () => <div>Toolbar Panel</div>,
}))

vi.mock('../components/town/TownCanvas', () => ({
  TownCanvas: () => <div>TownCanvas</div>,
}))

vi.mock('../pages/SimulationView', () => ({
  SimulationView: () => <div>TownCanvas</div>,
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
      speed: 1,
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

describe('App guide navigation', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => store.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          store.set(key, value)
        }),
        removeItem: vi.fn((key: string) => {
          store.delete(key)
        }),
        clear: vi.fn(() => {
          store.clear()
        }),
      },
    })
  })

  it('opens the guide page from the welcome page and returns back', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Guide' }))
    expect(await screen.findByRole('heading', { name: 'Guide Page' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument()
  })

  it('opens the guide page from simulation settings events and returns to simulation', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Start' }))
    await user.click(await screen.findByRole('button', { name: 'Enter' }))

    act(() => {
      window.dispatchEvent(new CustomEvent('populace:open-guide'))
    })
    expect(await screen.findByRole('heading', { name: 'Guide Page' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText('TownCanvas')).toBeInTheDocument()
  })
})
