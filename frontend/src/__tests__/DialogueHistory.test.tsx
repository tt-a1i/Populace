import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  getDialogueHistory: vi.fn(),
  getResidents: vi.fn(),
}))

vi.mock('../services/api', () => apiMocks)

import { DialogueHistory } from '../components/toolbar/DialogueHistory'

function makeEntry(index: number) {
  const fromPrimaryResident = index % 2 === 0
  return {
    id: `dlg-${index}`,
    tick: index,
    time: `Day 1, ${String(index % 24).padStart(2, '0')}:00`,
    from_id: fromPrimaryResident ? 'a1' : 'a2',
    from_name: fromPrimaryResident ? '小明' : '小红',
    to_id: fromPrimaryResident ? 'a2' : 'a3',
    to_name: fromPrimaryResident ? '小红' : '阿强',
    text: `对话 ${index}`,
    kind: 'dialogue',
  }
}

describe('DialogueHistory', () => {
  beforeEach(() => {
    apiMocks.getResidents.mockResolvedValue([
      { id: 'a1', name: '小明' },
      { id: 'a2', name: '小红' },
      { id: 'a3', name: '阿强' },
    ])
    apiMocks.getDialogueHistory.mockResolvedValue(Array.from({ length: 55 }, (_, index) => makeEntry(index + 1)))
  })

  it('shows only the latest 50 dialogue records', async () => {
    render(<DialogueHistory />)

    await waitFor(() => expect(apiMocks.getDialogueHistory).toHaveBeenCalledTimes(1))

    expect(screen.getAllByTestId('dialogue-history-item')).toHaveLength(50)
    expect(screen.queryByText('对话 1')).not.toBeInTheDocument()
    expect(screen.getByText('对话 55')).toBeInTheDocument()
  })

  it('filters dialogue records by resident', async () => {
    const user = userEvent.setup()
    render(<DialogueHistory />)

    await waitFor(() => expect(screen.getAllByTestId('dialogue-history-item')).toHaveLength(50))
    await user.selectOptions(screen.getByLabelText(/筛选居民/i), 'a1')

    expect(screen.getAllByTestId('dialogue-history-item')).toHaveLength(25)
    expect(screen.queryByText('小红 → 阿强')).not.toBeInTheDocument()
  })
})
