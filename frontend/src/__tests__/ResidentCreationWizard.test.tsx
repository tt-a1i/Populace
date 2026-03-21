import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', () => ({
  createResident: vi.fn().mockResolvedValue({
    id: 'new-resident-id',
    name: 'TestResident',
    personality: '外向开朗，热爱社交',
    mood: 'neutral',
    x: 5,
    y: 5,
  }),
  getResidents: vi.fn().mockResolvedValue([
    { id: 'res-1', name: '小红', personality: '活泼', mood: 'happy' },
    { id: 'res-2', name: '小明', personality: '安静', mood: 'neutral' },
  ]),
}))

vi.mock('../stores', () => ({
  useSimulationStore: (selector: (s: { buildings: Array<{ id: string; name: string; type: string; capacity: number; position: [number, number]; occupants: number }> }) => unknown) =>
    selector({
      buildings: [
        { id: 'b1', name: '阳光公寓', type: 'home', capacity: 4, position: [2, 3], occupants: 0 },
      ],
    }),
}))

import * as api from '../services/api'
import { ResidentCreationWizard } from '../components/toolbar/ResidentCreationWizard'

describe('ResidentCreationWizard', () => {
  it('renders step 1 with badge and title', () => {
    render(<ResidentCreationWizard />)
    expect(screen.getByText('Resident Creator')).toBeInTheDocument()
    expect(screen.getByText('创建新居民')).toBeInTheDocument()
  })

  it('renders name input on step 1', () => {
    render(<ResidentCreationWizard />)
    expect(screen.getByPlaceholderText('输入居民姓名')).toBeInTheDocument()
  })

  it('next button is disabled when name is empty', () => {
    render(<ResidentCreationWizard />)
    const nextBtn = screen.getByRole('button', { name: /下一步/ })
    expect(nextBtn).toBeDisabled()
  })

  it('next button enables after entering name', async () => {
    render(<ResidentCreationWizard />)
    const input = screen.getByPlaceholderText('输入居民姓名')
    await userEvent.type(input, 'TestName')
    const nextBtn = screen.getByRole('button', { name: /下一步/ })
    expect(nextBtn).not.toBeDisabled()
  })

  it('advances to step 2 (personality) after clicking next', async () => {
    render(<ResidentCreationWizard />)
    await userEvent.type(screen.getByPlaceholderText('输入居民姓名'), 'TestName')
    await userEvent.click(screen.getByRole('button', { name: /下一步/ }))
    expect(screen.getByText('选择性格模板')).toBeInTheDocument()
  })

  it('back button on step 2 returns to step 1', async () => {
    render(<ResidentCreationWizard />)
    await userEvent.type(screen.getByPlaceholderText('输入居民姓名'), 'TestName')
    await userEvent.click(screen.getByRole('button', { name: /下一步/ }))
    await userEvent.click(screen.getByRole('button', { name: /返回/ }))
    expect(screen.getByPlaceholderText('输入居民姓名')).toBeInTheDocument()
  })

  it('renders personality preset buttons on step 2', async () => {
    render(<ResidentCreationWizard />)
    await userEvent.type(screen.getByPlaceholderText('输入居民姓名'), 'TestName')
    await userEvent.click(screen.getByRole('button', { name: /下一步/ }))
    expect(screen.getByText('外向开朗，热爱社交，充满活力')).toBeInTheDocument()
  })

  it('advances to step 3 (relationships) after selecting personality', async () => {
    render(<ResidentCreationWizard />)
    await userEvent.type(screen.getByPlaceholderText('输入居民姓名'), 'TestName')
    await userEvent.click(screen.getByRole('button', { name: /下一步/ }))
    await userEvent.click(screen.getByText('外向开朗，热爱社交，充满活力'))
    await userEvent.click(screen.getAllByRole('button', { name: /下一步/ })[0])
    await waitFor(() => {
      expect(screen.getByText('初始社交关系（可选）')).toBeInTheDocument()
    })
  })

  it('shows existing residents as checkboxes on step 3', async () => {
    render(<ResidentCreationWizard />)
    await userEvent.type(screen.getByPlaceholderText('输入居民姓名'), 'TestName')
    await userEvent.click(screen.getByRole('button', { name: /下一步/ }))
    await userEvent.click(screen.getByText('外向开朗，热爱社交，充满活力'))
    await userEvent.click(screen.getAllByRole('button', { name: /下一步/ })[0])
    await waitFor(() => {
      expect(screen.getByText('小红')).toBeInTheDocument()
      expect(screen.getByText('小明')).toBeInTheDocument()
    })
  })

  it('calls createResident on confirm click', async () => {
    render(<ResidentCreationWizard />)
    await userEvent.type(screen.getByPlaceholderText('输入居民姓名'), 'TestResident')
    await userEvent.click(screen.getByRole('button', { name: /下一步/ }))
    await userEvent.click(screen.getByText('外向开朗，热爱社交，充满活力'))
    await userEvent.click(screen.getAllByRole('button', { name: /下一步/ })[0])
    await waitFor(() => screen.getByRole('button', { name: /创建居民/ }))
    await userEvent.click(screen.getByRole('button', { name: /创建居民/ }))
    await waitFor(() => {
      expect(api.createResident).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'TestResident', personality: '外向开朗，热爱社交，充满活力' }),
      )
    })
  })

  it('shows success screen after creation', async () => {
    render(<ResidentCreationWizard />)
    await userEvent.type(screen.getByPlaceholderText('输入居民姓名'), 'TestResident')
    await userEvent.click(screen.getByRole('button', { name: /下一步/ }))
    await userEvent.click(screen.getByText('外向开朗，热爱社交，充满活力'))
    await userEvent.click(screen.getAllByRole('button', { name: /下一步/ })[0])
    await waitFor(() => screen.getByRole('button', { name: /创建居民/ }))
    await userEvent.click(screen.getByRole('button', { name: /创建居民/ }))
    await waitFor(() => {
      expect(screen.getByText('居民已创建！')).toBeInTheDocument()
    })
  })

  it('add another button resets wizard', async () => {
    render(<ResidentCreationWizard />)
    await userEvent.type(screen.getByPlaceholderText('输入居民姓名'), 'TestResident')
    await userEvent.click(screen.getByRole('button', { name: /下一步/ }))
    await userEvent.click(screen.getByText('外向开朗，热爱社交，充满活力'))
    await userEvent.click(screen.getAllByRole('button', { name: /下一步/ })[0])
    await waitFor(() => screen.getByRole('button', { name: /创建居民/ }))
    await userEvent.click(screen.getByRole('button', { name: /创建居民/ }))
    await waitFor(() => screen.getByText('居民已创建！'))
    await userEvent.click(screen.getByRole('button', { name: /再创建一位/ }))
    expect(screen.getByPlaceholderText('输入居民姓名')).toBeInTheDocument()
  })
})
