import { fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ToastProvider, useToast } from '../components/ui/ToastProvider'

function ToastProbe() {
  const { pushToast } = useToast()

  return (
    <button
      type="button"
      onClick={() =>
        pushToast({
          type: 'success',
          title: '已连接',
          description: 'WebSocket 连接恢复',
        })
      }
    >
      notify
    </button>
  )
}

describe('ToastProvider', () => {
  it('renders a toast and auto dismisses it after three seconds', async () => {
    vi.useFakeTimers()

    render(
      <ToastProvider>
        <ToastProbe />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'notify' }))

    expect(screen.getByText('已连接')).toBeInTheDocument()
    expect(screen.getByText('WebSocket 连接恢复')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(screen.queryByText('已连接')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})
