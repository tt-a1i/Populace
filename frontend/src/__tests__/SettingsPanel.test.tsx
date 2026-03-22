import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUseThemeStore, mockSetAccent } = vi.hoisted(() => ({
  mockUseThemeStore: vi.fn(),
  mockSetAccent: vi.fn(),
}))

vi.mock('../services/api', () => ({
  getLlmKeyStatus: vi.fn().mockResolvedValue({ configured: false }),
  setLlmKey: vi.fn().mockResolvedValue({ configured: true }),
}))

vi.mock('../audio', () => ({
  useSound: () => ({
    enabled: true,
    toggleEnabled: vi.fn(),
  }),
}))

vi.mock('../stores/theme', () => ({
  THEME_ACCENTS: {
    blue: { key: 'blue', hex: '#3b82f6' },
    green: { key: 'green', hex: '#22c55e' },
    purple: { key: 'purple', hex: '#a855f7' },
    red: { key: 'red', hex: '#ef4444' },
    orange: { key: 'orange', hex: '#f97316' },
    cyan: { key: 'cyan', hex: '#06b6d4' },
  },
  useThemeStore: mockUseThemeStore,
}))

vi.mock('../components/ui/TutorialOverlay', () => ({
  resetTutorial: vi.fn(),
}))

import { SettingsPanel } from '../components/toolbar/SettingsPanel'

describe('SettingsPanel', () => {
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

    mockSetAccent.mockReset()
    mockUseThemeStore.mockImplementation((selector: (state: {
      theme: 'dark' | 'light'
      accent: 'blue' | 'green' | 'purple' | 'red' | 'orange' | 'cyan'
      toggleTheme: () => void
      setAccent: (accent: string) => void
    }) => unknown) =>
      selector({
        theme: 'dark',
        accent: 'blue',
        toggleTheme: vi.fn(),
        setAccent: mockSetAccent,
      }))
  })

  it('dispatches the guide event from the guide entry button', async () => {
    const user = userEvent.setup()
    const listener = vi.fn()
    window.addEventListener('populace:open-guide', listener)

    render(<SettingsPanel />)

    await user.click(screen.getByRole('button', { name: /打开用户指南/i }))

    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener('populace:open-guide', listener)
  })

  it('renders six preset accent choices and updates the selected accent', async () => {
    const user = userEvent.setup()

    render(<SettingsPanel />)

    expect(screen.getByRole('button', { name: /蓝/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /绿/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /紫/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /红/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /橙/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /青/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /橙/i }))

    expect(mockSetAccent).toHaveBeenCalledWith('orange')
  })
})
