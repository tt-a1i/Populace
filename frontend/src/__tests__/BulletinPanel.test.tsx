import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetWorldBulletin } = vi.hoisted(() => ({
  mockGetWorldBulletin: vi.fn(),
}))

vi.mock('../services/api', () => ({
  getWorldBulletin: mockGetWorldBulletin,
}))

import { BulletinPanel } from '../components/toolbar/BulletinPanel'

describe('BulletinPanel', () => {
  beforeEach(() => {
    mockGetWorldBulletin.mockReset()
  })

  it('renders bulletin posts and hot topics', async () => {
    mockGetWorldBulletin.mockResolvedValue({
      posts: [
        {
          id: 'post-1',
          author_id: 'a1',
          author_name: '小明',
          content: '春日祭太棒了，今晚广场全是笑声。',
          tick: 96,
          likes: ['a2', 'a3'],
          category: 'festival',
          topic: 'spring_festival',
          subject_id: 'a1',
          tone: 'positive',
        },
      ],
      hot_topics: [
        {
          topic: 'spring_festival',
          label: '春日祭',
          category: 'festival',
          post_count: 3,
          heat: 1,
          sentiment: 'positive',
        },
      ],
    })

    render(<BulletinPanel />)

    expect(await screen.findByText('春日祭太棒了，今晚广场全是笑声。')).toBeInTheDocument()
    expect(screen.getAllByText('#春日祭').length).toBeGreaterThan(0)
    expect(screen.getByText('2 likes')).toBeInTheDocument()
    expect(screen.getByText('小明')).toBeInTheDocument()
  })

  it('refreshes the board', async () => {
    mockGetWorldBulletin
      .mockResolvedValueOnce({
        posts: [],
        hot_topics: [{ topic: 'old', label: '旧话题', category: 'social', post_count: 1, heat: 0.3, sentiment: 'neutral' }],
      })
      .mockResolvedValueOnce({
        posts: [
          {
            id: 'post-2',
            author_id: 'a2',
            author_name: '小红',
            content: '终于买到了限量咖啡豆。',
            tick: 100,
            likes: ['a1'],
            category: 'market',
            topic: 'limited_coffee',
            subject_id: 'a2',
            tone: 'positive',
          },
        ],
        hot_topics: [{ topic: 'limited_coffee', label: '限量咖啡豆', category: 'market', post_count: 2, heat: 0.8, sentiment: 'positive' }],
      })

    const user = userEvent.setup()
    render(<BulletinPanel />)

    expect((await screen.findAllByText('#旧话题')).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /刷新公告板|Refresh bulletin/i }))

    await waitFor(() => {
      expect(mockGetWorldBulletin).toHaveBeenCalledTimes(2)
    })
    expect(screen.getByText('终于买到了限量咖啡豆。')).toBeInTheDocument()
    expect(screen.getAllByText('#限量咖啡豆').length).toBeGreaterThan(0)
  })
})
