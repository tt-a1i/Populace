import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const { mockPushToast, mockSaveGame } = vi.hoisted(() => ({
  mockPushToast: vi.fn(),
  mockSaveGame: vi.fn().mockResolvedValue({
    id: 'save-1',
    name: '我的存档',
    created_at: '2026-03-20T00:00:00Z',
    tick: 12,
  }),
}))

vi.mock('../components/ui/ToastProvider', () => ({
  useToast: () => ({ pushToast: mockPushToast }),
}))

vi.mock('../services/api', () => ({
  listSaves: vi.fn().mockResolvedValue([]),
  saveGame: mockSaveGame,
  loadSave: vi.fn().mockResolvedValue({}),
  deleteSave: vi.fn().mockResolvedValue({}),
}))

import { SavesPanel } from '../components/toolbar/SavesPanel'

describe('SavesPanel notifications', () => {
  it('shows a success toast after saving', async () => {
    mockPushToast.mockClear()
    mockSaveGame.mockClear()
    const user = userEvent.setup()

    render(<SavesPanel />)

    await user.type(screen.getByPlaceholderText('存档名称（可留空）'), '我的存档')
    await user.click(screen.getByRole('button', { name: /保存/ }))

    await waitFor(() => {
      expect(mockSaveGame).toHaveBeenCalledWith('我的存档')
    })

    expect(mockPushToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', title: '存档成功' }),
    )
  })
})
