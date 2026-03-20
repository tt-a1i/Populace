import { fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ToastProvider, useToast } from '../components/ui/ToastProvider'

function ToastProbe() {
  const { pushToast } = useToast()

  return (
    <div>
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
        success
      </button>
      <button
        type="button"
        onClick={() =>
          pushToast({
            type: 'info',
            title: '同步中',
            description: '正在拉取最新数据',
          })
        }
      >
        info
      </button>
      <button
        type="button"
        onClick={() =>
          pushToast({
            type: 'warning',
            title: '连接波动',
            description: '正在尝试重新连接',
          })
        }
      >
        warning
      </button>
      <button
        type="button"
        onClick={() =>
          pushToast({
            type: 'error',
            title: '保存失败',
            description: '磁盘空间不足',
          })
        }
      >
        error
      </button>
    </div>
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

    fireEvent.click(screen.getByRole('button', { name: 'success' }))

    expect(screen.getByTestId('toast-viewport')).toHaveClass('top-4', 'right-4')
    expect(screen.getByTestId('toast-item')).toHaveClass(
      'border-emerald-300/30',
      'bg-emerald-400/12',
    )
    expect(screen.getByText('已连接')).toBeInTheDocument()
    expect(screen.getByText('WebSocket 连接恢复')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(screen.queryByText('已连接')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('renders different classes for info, warning, and error toasts', () => {
    render(
      <ToastProvider>
        <ToastProbe />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'info' }))
    fireEvent.click(screen.getByRole('button', { name: 'warning' }))
    fireEvent.click(screen.getByRole('button', { name: 'error' }))

    const infoToast = screen.getByText('同步中').closest('[data-testid="toast-item"]')
    const warningToast = screen.getByText('连接波动').closest('[data-testid="toast-item"]')
    const errorToast = screen.getByText('保存失败').closest('[data-testid="toast-item"]')

    expect(infoToast).toHaveClass('border-blue-300/30', 'bg-blue-400/12')
    expect(warningToast).toHaveClass('border-amber-300/30', 'bg-amber-400/14')
    expect(errorToast).toHaveClass('border-rose-300/30', 'bg-rose-400/14')
  })
})
