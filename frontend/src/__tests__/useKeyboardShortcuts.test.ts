import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useSimulationStore } from '../stores/simulation'

// Mock the API module
vi.mock('../services/api', () => ({
  startSimulation: vi.fn().mockResolvedValue(undefined),
  stopSimulation: vi.fn().mockResolvedValue(undefined),
  setSpeed: vi.fn().mockResolvedValue(undefined),
}))

function fireKey(code: string, key: string, extra?: Partial<KeyboardEventInit>) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true, ...extra }))
}

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    useSimulationStore.setState({ speed: 1, running: true, selectedResidentId: null })
  })

  it('registers and unregisters the listener', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useKeyboardShortcuts(true))
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('does not register listener when disabled', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    renderHook(() => useKeyboardShortcuts(false))
    expect(addSpy).not.toHaveBeenCalledWith('keydown', expect.any(Function))
    addSpy.mockRestore()
  })

  it('Escape clears selectedResidentId', async () => {
    useSimulationStore.setState({ selectedResidentId: 'r-abc' })
    renderHook(() => useKeyboardShortcuts(true))
    await act(async () => {
      fireKey('Escape', 'Escape')
    })
    expect(useSimulationStore.getState().selectedResidentId).toBeNull()
  })

  it('ignores keydown on input elements', async () => {
    useSimulationStore.setState({ selectedResidentId: 'r-abc' })
    renderHook(() => useKeyboardShortcuts(true))
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }))
    })
    // selectedResidentId should NOT have been cleared since event came from input
    expect(useSimulationStore.getState().selectedResidentId).toBe('r-abc')
    document.body.removeChild(input)
  })
})
