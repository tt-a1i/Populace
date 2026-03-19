import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { WelcomePage } from '../components/ui/WelcomePage'

describe('WelcomePage', () => {
  it('renders the POPULACE title', () => {
    render(<WelcomePage onStart={vi.fn()} />)
    expect(screen.getByText('POPULACE')).toBeInTheDocument()
  })

  it('renders the English slogan', () => {
    render(<WelcomePage onStart={vi.fn()} />)
    expect(
      screen.getByText(/Create a pixel town, watch AI residents live their drama/i),
    ).toBeInTheDocument()
  })

  it('renders the Chinese slogan', () => {
    render(<WelcomePage onStart={vi.fn()} />)
    expect(screen.getByText(/创造一个像素小镇/)).toBeInTheDocument()
  })

  it('renders the start button', () => {
    render(<WelcomePage onStart={vi.fn()} />)
    expect(screen.getByRole('button', { name: /开始模拟/ })).toBeInTheDocument()
  })

  it('calls onStart when the start button is clicked', async () => {
    const onStart = vi.fn()
    render(<WelcomePage onStart={onStart} />)
    await userEvent.click(screen.getByRole('button', { name: /开始模拟/ }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('renders all 4 feature cards', () => {
    render(<WelcomePage onStart={vi.fn()} />)
    expect(screen.getByText('AI 自主社交')).toBeInTheDocument()
    expect(screen.getByText('实时关系图谱')).toBeInTheDocument()
    expect(screen.getByText('上帝模式干预')).toBeInTheDocument()
    expect(screen.getByText('小镇日报')).toBeInTheDocument()
  })
})
