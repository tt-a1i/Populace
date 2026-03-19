import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', () => ({
  startSimulation: vi.fn().mockResolvedValue({}),
  generateScenario: vi.fn().mockResolvedValue({
    name: '测试场景',
    description: '测试',
    buildings: [
      { id: 'b1', type: 'home', name: '民居A', capacity: 4, position: [5, 8] },
    ],
    residents: [
      { id: 'r1', name: '张三', personality: '善良', home_id: 'b1', x: 5, y: 14 },
    ],
  }),
  startCustomSimulation: vi.fn().mockResolvedValue({}),
}))

import { ScenePicker } from '../components/ui/ScenePicker'

describe('ScenePicker', () => {
  it('renders the preset scene card', () => {
    render(<ScenePicker onEnter={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('现代小区')).toBeInTheDocument()
  })

  it('renders the custom scene section without "coming soon"', () => {
    render(<ScenePicker onEnter={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('描述你的小镇')).toBeInTheDocument()
    expect(screen.queryByText('即将推出')).not.toBeInTheDocument()
  })

  it('custom textarea is enabled', () => {
    render(<ScenePicker onEnter={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByPlaceholderText(/例如：一个海边渔村/)).not.toBeDisabled()
  })

  it('generate button is enabled after typing a description', async () => {
    render(<ScenePicker onEnter={vi.fn()} onBack={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/例如：一个海边渔村/), '一个测试小镇')
    expect(screen.getByRole('button', { name: /生成场景/ })).not.toBeDisabled()
  })

  it('shows scenario name and residents in preview after generation', async () => {
    render(<ScenePicker onEnter={vi.fn()} onBack={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/例如：一个海边渔村/), '测试')
    await userEvent.click(screen.getByRole('button', { name: /生成场景/ }))
    expect(await screen.findByText('测试场景')).toBeInTheDocument()
    expect(screen.getByText('张三')).toBeInTheDocument()
  })

  it('"使用此场景" button calls onEnter after starting custom simulation', async () => {
    const onEnter = vi.fn()
    render(<ScenePicker onEnter={onEnter} onBack={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/例如：一个海边渔村/), '测试')
    await userEvent.click(screen.getByRole('button', { name: /生成场景/ }))
    await screen.findByText('测试场景')
    await userEvent.click(screen.getByRole('button', { name: /使用此场景/ }))
    expect(await screen.findByText(/使用此场景|启动中/, { exact: false })).toBeInTheDocument()
    // onEnter is called after startCustomSimulation resolves
    await vi.waitFor(() => expect(onEnter).toHaveBeenCalledTimes(1), { timeout: 3000 })
  })

  it('renders the back button', () => {
    render(<ScenePicker onEnter={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByRole('button', { name: /返回/ })).toBeInTheDocument()
  })

  it('back button calls onBack', async () => {
    const onBack = vi.fn()
    render(<ScenePicker onEnter={vi.fn()} onBack={onBack} />)
    await userEvent.click(screen.getByRole('button', { name: /返回/ }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
