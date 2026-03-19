import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('html-to-image', () => ({
  toPng: vi.fn().mockResolvedValue('data:image/png;base64,aaa'),
}))

vi.mock('../services/api', () => ({
  generateExperimentReport: vi.fn().mockResolvedValue({
    title: '实验报告：关系网络升温',
    generated_at: '2026-03-20T00:05:00Z',
    stats: {
      days: 3,
      start_tick: 48,
      end_tick: 144,
      node_count: 6,
      edge_count: 8,
      density_start: 0.31,
      density_end: 0.44,
      density_change: 0.13,
      triangle_count: 2,
      dominant_mood: 'happy',
      relation_type_distribution: { friendship: 4, rivalry: 2 },
      social_hotspots: [{ name: '晨曦咖啡馆', visits: 9, interaction_score: 5.5 }],
    },
    sections: [
      { heading: '实验摘要', content: '## 概览\n最近三天网络密度明显上升。' },
      { heading: '伦理思考', content: '- 高频干预可能放大偏见。' },
    ],
  }),
}))

import { ExperimentReport } from '../components/report/ExperimentReport'

describe('ExperimentReport', () => {
  it('generates, renders, and exports an experiment report', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {
      return {
        document: {
          open: vi.fn(),
          write: vi.fn(),
          close: vi.fn(),
        },
        focus: vi.fn(),
        print: vi.fn(),
        close: vi.fn(),
      } as unknown as Window
    })

    render(<ExperimentReport />)

    await userEvent.click(screen.getByRole('button', { name: /生成实验报告/ }))

    await waitFor(() => {
      expect(screen.getByText('实验报告：关系网络升温')).toBeInTheDocument()
    })

    expect(screen.getByText(/最近三天网络密度明显上升/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /导出 PDF/ }))

    expect(openSpy).toHaveBeenCalled()
    openSpy.mockRestore()
  })
})
