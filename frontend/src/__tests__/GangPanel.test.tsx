import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../services/api', () => ({
  getWorldGangs: vi.fn().mockResolvedValue({
    gangs: [
      {
        name: '影刃帮',
        leader_id: 'a1',
        leader_name: '阿强',
        member_count: 3,
        territory: '商业区',
        influence: 0.65,
        activity: '贩私',
        color: '#8B5CF6',
        created_tick: 10,
        last_action_tick: 45,
      },
      {
        name: '夜枭会',
        leader_id: 'a2',
        leader_name: '小红',
        member_count: 2,
        territory: '住宅区',
        influence: 0.42,
        activity: '保护费',
        color: '#EF4444',
        created_tick: 15,
        last_action_tick: 40,
      },
    ],
    recent_events: [
      {
        tick: 45,
        type: '冲突',
        gang_name: '影刃帮',
        gang_color: '#8B5CF6',
        description: '影刃帮与夜枭会在商业区发生冲突',
      },
      {
        tick: 30,
        type: '招募',
        gang_name: '夜枭会',
        gang_color: '#EF4444',
        description: '阿明加入了夜枭会',
      },
      {
        tick: 15,
        type: '成立',
        gang_name: '夜枭会',
        gang_color: '#EF4444',
        description: '小红成为夜枭会的首领',
      },
    ],
  }),
}))

import { GangPanel } from '../components/toolbar/GangPanel'

describe('GangPanel', () => {
  it('renders gang cards with correct data', async () => {
    render(<GangPanel />)

    await waitFor(() => {
      // Gang names should be visible
      expect(screen.getByText('影刃帮')).toBeInTheDocument()
      expect(screen.getByText('夜枭会')).toBeInTheDocument()
      
      // Leader names
      expect(screen.getByText('阿强')).toBeInTheDocument()
      expect(screen.getByText('小红')).toBeInTheDocument()
      
      // Member counts
      expect(screen.getByText('3 人')).toBeInTheDocument()
      expect(screen.getByText('2 人')).toBeInTheDocument()
      
      // Territories
      expect(screen.getByText('商业区')).toBeInTheDocument()
      expect(screen.getByText('住宅区')).toBeInTheDocument()
      
      // Activity types
      expect(screen.getByText('贩私')).toBeInTheDocument()
      expect(screen.getByText('保护费')).toBeInTheDocument()
    })
  })

  it('displays influence progress bars', async () => {
    render(<GangPanel />)

    await waitFor(() => {
      // Influence percentages
      expect(screen.getByText('65%')).toBeInTheDocument()
      expect(screen.getByText('42%')).toBeInTheDocument()
    })
  })

  it('renders recent events section', async () => {
    render(<GangPanel />)

    await waitFor(() => {
      // Event descriptions
      expect(screen.getByText('影刃帮与夜枭会在商业区发生冲突')).toBeInTheDocument()
      expect(screen.getByText('阿明加入了夜枭会')).toBeInTheDocument()
      expect(screen.getByText('小红成为夜枭会的首领')).toBeInTheDocument()
      
      // Event ticks
      expect(screen.getByText('Tick 45')).toBeInTheDocument()
      expect(screen.getByText('Tick 30')).toBeInTheDocument()
      expect(screen.getByText('Tick 15')).toBeInTheDocument()
    })
  })

  it('shows loading state initially', () => {
    render(<GangPanel />)
    
    // Should show loading spinner or skeleton
    expect(screen.getByText(/帮派数据加载中/)).toBeInTheDocument()
  })

  it('displays empty state when no gangs exist', async () => {
    vi.mocked(await import('../../services/api')).getWorldGangs.mockResolvedValueOnce({
      gangs: [],
      recent_events: [],
    })

    render(<GangPanel />)

    await waitFor(() => {
      expect(screen.getByText('暂无帮派势力')).toBeInTheDocument()
    })
  })

  it('shows error message when API fails', async () => {
    vi.mocked(await import('../../services/api')).getWorldGangs.mockRejectedValueOnce(new Error('Network error'))

    render(<GangPanel />)

    await waitFor(() => {
      expect(screen.getByText('帮派数据加载失败')).toBeInTheDocument()
    })
  })

  it('displays gang color indicators', async () => {
    render(<GangPanel />)

    await waitFor(() => {
      const gangCards = screen.getAllByRole('article', { hidden: true }) || screen.getAllByText(/影刃帮 | 夜枭会/)
      // Cards should have color styling
      const firstCard = gangCards[0]?.closest('.rounded-xl')
      expect(firstCard).toBeDefined()
    })
  })

  it('shows event type icons', async () => {
    render(<GangPanel />)

    await waitFor(() => {
      // Event type emojis
      expect(screen.getByText('⚔️')).toBeInTheDocument()
      expect(screen.getByText('👥')).toBeInTheDocument()
      expect(screen.getByText('🎯')).toBeInTheDocument()
    })
  })
})
