import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { FeedMessage } from '../stores/simulation'

// Parameterisable mock — overridden per test via mockImplementation
const mockUseSimulationStore = vi.fn()

vi.mock('../stores/simulation', () => ({
  useSimulationStore: (selector: (s: { messageFeed: FeedMessage[] }) => unknown) =>
    mockUseSimulationStore(selector),
}))

import { MessageBar } from '../components/ui/MessageBar'

describe('MessageBar', () => {
  it('renders the 消息流 label', () => {
    mockUseSimulationStore.mockImplementation(
      (sel: (s: { messageFeed: FeedMessage[] }) => unknown) => sel({ messageFeed: [] }),
    )
    render(<MessageBar />)
    expect(screen.getByText('消息流')).toBeInTheDocument()
  })

  it('shows placeholder text when there are no messages', () => {
    mockUseSimulationStore.mockImplementation(
      (sel: (s: { messageFeed: FeedMessage[] }) => unknown) => sel({ messageFeed: [] }),
    )
    render(<MessageBar />)
    expect(screen.getByText(/等待事件与对话流入消息栏/)).toBeInTheDocument()
  })

  it('displays messages when messageFeed has items', () => {
    mockUseSimulationStore.mockImplementation(
      (sel: (s: { messageFeed: FeedMessage[] }) => unknown) =>
        sel({
          messageFeed: [
            { id: '1', kind: 'dialogue', text: '张三对李四说了句话' },
            { id: '2', kind: 'event', text: '王五到达了广场' },
          ],
        }),
    )
    render(<MessageBar />)
    expect(screen.getByText('张三对李四说了句话')).toBeInTheDocument()
    expect(screen.getByText('王五到达了广场')).toBeInTheDocument()
  })

  it('does not show the placeholder when messages exist', () => {
    mockUseSimulationStore.mockImplementation(
      (sel: (s: { messageFeed: FeedMessage[] }) => unknown) =>
        sel({ messageFeed: [{ id: '1', kind: 'system', text: '一条真实消息' }] }),
    )
    render(<MessageBar />)
    expect(screen.queryByText(/等待事件与对话流入消息栏/)).not.toBeInTheDocument()
  })
})
