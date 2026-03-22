import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import * as api from '../services/api'
import { ScenePicker } from '../components/ui/ScenePicker'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true })

describe('ScenePicker', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('renders the preset scene card', () => {
    render(<ScenePicker onEnter={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('现代小区')).toBeInTheDocument()
  })

  it('renders the mountain village preset scene card', () => {
    render(<ScenePicker onEnter={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('云岚山村')).toBeInTheDocument()
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
    await waitFor(() => expect(onEnter).toHaveBeenCalledTimes(1), { timeout: 3000 })
  })

  it('can save an edited preset scene to localStorage and select it', async () => {
    render(<ScenePicker onEnter={vi.fn()} onBack={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: '编辑预设场景' }))
    await userEvent.selectOptions(screen.getByRole('combobox'), 'mountain_village')

    const sceneNameInput = screen.getAllByDisplayValue('云岚山村')[1]
    await userEvent.clear(sceneNameInput)
    await userEvent.type(sceneNameInput, '自定义山村')

    const residentNameInput = screen.getByDisplayValue('山木')
    await userEvent.clear(residentNameInput)
    await userEvent.type(residentNameInput, '阿木')

    await userEvent.click(screen.getByRole('button', { name: '保存到本地场景' }))

    expect(await screen.findByText('已保存的自定义场景')).toBeInTheDocument()
    expect(screen.getByText('自定义山村')).toBeInTheDocument()
    expect(localStorageMock.getItem('populace:custom-scenes')).toContain('阿木')
  })

  it('starts a saved custom scene from localStorage', async () => {
    localStorageMock.setItem(
      'populace:custom-scenes',
      JSON.stringify([
        {
          id: 'custom_1',
          name: '本地山村',
          basedOn: 'mountain_village',
          createdAt: '2026-03-22T00:00:00.000Z',
          scenario: {
            name: '本地山村',
            description: '测试',
            buildings: [{ id: 'b1', type: 'home', name: '木屋', capacity: 2, position: [5, 5] }],
            residents: [{ id: 'r1', name: '阿木', personality: '沉稳', home_id: 'b1', x: 5, y: 5 }],
          },
        },
      ]),
    )

    const onEnter = vi.fn()
    render(<ScenePicker onEnter={onEnter} onBack={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: /本地山村/ }))
    await userEvent.click(screen.getByRole('button', { name: /进入小镇/ }))

    await waitFor(() => {
      expect(api.startCustomSimulation).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '本地山村',
          residents: [expect.objectContaining({ name: '阿木' })],
        }),
      )
      expect(onEnter).toHaveBeenCalledTimes(1)
    })
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
