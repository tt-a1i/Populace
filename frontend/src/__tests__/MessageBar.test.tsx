import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Parameterisable mock — overridden per test via mockImplementation
const mockUseSimulationStore = vi.fn()

vi.mock('../stores/simulation', () => ({
  useSimulationStore: (selector: (s: { messageFeed: string[] }) => unknown) =>
    mockUseSimulationStore(selector),
}))

import { MessageBar } from '../components/ui/MessageBar'

describe('MessageBar', () => {
  it('renders the 消息流 label', () => {
    mockUseSimulationStore.mockImplementation(
      (sel: (s: { messageFeed: string[] }) => unknown) => sel({ messageFeed: [] }),
    )
    render(<MessageBar />)
    expect(screen.getByText('消息流')).toBeInTheDocument()
  })

  it('shows placeholder text when there are no messages', () => {
    mockUseSimulationStore.mockImplementation(
      (sel: (s: { messageFeed: string[] }) => unknown) => sel({ messageFeed: [] }),
    )
    render(<MessageBar />)
    expect(screen.getAllByText(/等待事件与对话流入消息栏/)[0]).toBeInTheDocument()
  })

  it('displays messages when messageFeed has items', () => {
    mockUseSimulationStore.mockImplementation(
      (sel: (s: { messageFeed: string[] }) => unknown) =>
        sel({ messageFeed: ['张三对李四说了句话', '王五到达了广场'] }),
    )
    render(<MessageBar />)
    expect(screen.getAllByText('张三对李四说了句话').length).toBeGreaterThan(0)
    expect(screen.getAllByText('王五到达了广场').length).toBeGreaterThan(0)
  })

  it('does not show the placeholder when messages exist', () => {
    mockUseSimulationStore.mockImplementation(
      (sel: (s: { messageFeed: string[] }) => unknown) =>
        sel({ messageFeed: ['一条真实消息'] }),
    )
    render(<MessageBar />)
    expect(screen.queryByText(/等待事件与对话流入消息栏/)).not.toBeInTheDocument()
  })
})
