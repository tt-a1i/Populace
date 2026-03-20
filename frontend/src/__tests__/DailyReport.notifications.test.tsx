import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const { mockPushToast, mockPlay, mockGenerateReport } = vi.hoisted(() => ({
  mockPushToast: vi.fn(),
  mockPlay: vi.fn(),
  mockGenerateReport: vi.fn().mockResolvedValue({
    title: '今日头条',
    generated_at: '2026-03-20T10:00:00Z',
    tick: 88,
    sections: [{ heading: '标题新闻', content: '今天的小镇非常热闹。' }],
  }),
}))

vi.mock('../components/ui/ToastProvider', () => ({
  useToast: () => ({ pushToast: mockPushToast }),
}))

vi.mock('../audio', () => ({
  useSound: () => ({ enabled: true, play: mockPlay, toggleEnabled: vi.fn() }),
}))

vi.mock('../services/api', () => ({
  generateReport: mockGenerateReport,
  getLatestReport: vi.fn().mockResolvedValue({
    title: '最近日报',
    generated_at: '2026-03-20T09:00:00Z',
    tick: 77,
    sections: [{ heading: '标题新闻', content: '最近日报内容。' }],
  }),
}))

vi.mock('../components/report/ReportShare', () => ({
  ReportShare: () => <div data-testid="report-share">ReportShare</div>,
}))

import { DailyReport } from '../components/report/DailyReport'

describe('DailyReport notifications', () => {
  it('plays the newspaper sound and shows a success toast after generation', async () => {
    mockPushToast.mockClear()
    mockPlay.mockClear()
    mockGenerateReport.mockClear()
    const user = userEvent.setup()

    render(<DailyReport />)

    await user.click(screen.getByRole('button', { name: '生成日报' }))

    await waitFor(() => {
      expect(screen.getByText('今日头条')).toBeInTheDocument()
    })

    expect(mockPlay).toHaveBeenCalledWith('report')
    expect(mockPushToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', title: '日报已生成' }),
    )
  })
})
