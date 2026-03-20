import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const { mockPushToast, mockPlay, mockInjectEvent } = vi.hoisted(() => ({
  mockPushToast: vi.fn(),
  mockPlay: vi.fn(),
  mockInjectEvent: vi.fn().mockResolvedValue({}),
}))

vi.mock('../components/ui/ToastProvider', () => ({
  useToast: () => ({ pushToast: mockPushToast }),
}))

vi.mock('../audio', () => ({
  useSound: () => ({ enabled: true, play: mockPlay, toggleEnabled: vi.fn() }),
}))

vi.mock('../services/api', () => ({
  getPresetEvents: vi.fn().mockResolvedValue([]),
  getActiveEvents: vi.fn().mockResolvedValue([]),
  injectPresetEvent: vi.fn().mockResolvedValue({}),
  injectEvent: mockInjectEvent,
}))

import { EventInjector } from '../components/toolbar/EventInjector'

describe('EventInjector notifications', () => {
  it('plays a sound and shows a success toast when a custom event is injected', async () => {
    mockPushToast.mockClear()
    mockPlay.mockClear()
    mockInjectEvent.mockClear()
    const user = userEvent.setup()

    render(<EventInjector />)

    await user.type(screen.getByPlaceholderText('例如：广场突然下起玫瑰花雨'), '广场突然响起钟声')
    await user.click(screen.getByRole('button', { name: '投放事件' }))

    await waitFor(() => {
      expect(mockInjectEvent).toHaveBeenCalledWith({ description: '广场突然响起钟声' })
    })

    expect(mockPlay).toHaveBeenCalledWith('event')
    expect(mockPushToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', title: '事件已投放' }),
    )
  })
})
