import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const { mockPushToast, mockPlay, mockListSaves, mockSaveGame, mockLoadSave, mockDeleteSave } = vi.hoisted(() => ({
  mockPushToast: vi.fn(),
  mockPlay: vi.fn(),
  mockListSaves: vi.fn().mockResolvedValue([
    {
      id: 'save-1',
      name: '自动存档',
      created_at: '2026-03-20T00:00:00Z',
      tick: 12,
    },
  ]),
  mockSaveGame: vi.fn().mockResolvedValue({
    id: 'save-1',
    name: '我的存档',
    created_at: '2026-03-20T00:00:00Z',
    tick: 12,
  }),
  mockLoadSave: vi.fn().mockResolvedValue({}),
  mockDeleteSave: vi.fn().mockResolvedValue({}),
}))

vi.mock('../components/ui/ToastProvider', () => ({
  useToast: () => ({ pushToast: mockPushToast }),
}))

vi.mock('../audio', () => ({
  useSound: () => ({ enabled: true, play: mockPlay, toggleEnabled: vi.fn() }),
}))

vi.mock('../services/api', () => ({
  listSaves: mockListSaves,
  saveGame: mockSaveGame,
  loadSave: mockLoadSave,
  deleteSave: mockDeleteSave,
}))

import { SavesPanel } from '../components/toolbar/SavesPanel'

describe('SavesPanel notifications', () => {
  it('shows a success toast after saving', async () => {
    mockPushToast.mockClear()
    mockPlay.mockClear()
    mockListSaves.mockClear()
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
    expect(mockPlay).toHaveBeenCalledWith('dialogue')
  })

  it('plays a confirmation sound after load and delete succeed', async () => {
    mockPushToast.mockClear()
    mockPlay.mockClear()
    mockListSaves.mockClear()
    mockLoadSave.mockClear()
    mockDeleteSave.mockClear()
    const user = userEvent.setup()

    render(<SavesPanel />)

    const loadButton = await screen.findByRole('button', { name: '加载' })
    await user.click(loadButton)

    await waitFor(() => {
      expect(mockLoadSave).toHaveBeenCalledWith('save-1')
    })

    const deleteButton = await screen.findByRole('button', { name: '删除' })
    await user.click(deleteButton)

    await waitFor(() => {
      expect(mockDeleteSave).toHaveBeenCalledWith('save-1')
    })

    expect(mockPlay).toHaveBeenCalledTimes(2)
    expect(mockPlay).toHaveBeenNthCalledWith(1, 'dialogue')
    expect(mockPlay).toHaveBeenNthCalledWith(2, 'dialogue')
  })
})
