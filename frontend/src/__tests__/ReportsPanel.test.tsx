import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../components/report/DailyReport', () => ({
  DailyReport: () => <div data-testid="daily-report">DailyReport</div>,
}))

vi.mock('../components/report/ExperimentReport', () => ({
  ExperimentReport: () => <div data-testid="experiment-report">ExperimentReport</div>,
}))

import { ReportsPanel } from '../components/report/ReportsPanel'

describe('ReportsPanel', () => {
  it('switches between daily report and experiment report tabs', async () => {
    render(<ReportsPanel />)

    expect(screen.getByTestId('daily-report')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /实验报告/ }))
    expect(screen.getByTestId('experiment-report')).toBeInTheDocument()
  })
})
