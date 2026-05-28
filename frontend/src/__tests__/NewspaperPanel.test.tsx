import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetWorldNewspaper, mockGetWorldNewspaperArchive } = vi.hoisted(() => ({
  mockGetWorldNewspaper: vi.fn(),
  mockGetWorldNewspaperArchive: vi.fn(),
}))

vi.mock('../services/api', () => ({
  getWorldNewspaper: mockGetWorldNewspaper,
  getWorldNewspaperArchive: mockGetWorldNewspaperArchive,
}))

import { NewspaperPanel } from '../components/toolbar/NewspaperPanel'

const EMPTY_LATEST = { issue: null }
const EMPTY_ARCHIVE = { issues: [] }

const SAMPLE_ISSUE = {
  issue_id: 'issue-1-t20',
  tick: 20,
  headlines: ['头条新闻一号', '副条新闻二号', '三号副标题'],
  sections: {
    economy: '经济稳步增长',
    society: '社区和谐共处',
    gossip: '坊间流传佳话',
    events: '近日无重大事件',
  },
  generated_at: 20,
}

describe('NewspaperPanel', () => {
  beforeEach(() => {
    mockGetWorldNewspaper.mockReset()
    mockGetWorldNewspaperArchive.mockReset()
    mockGetWorldNewspaper.mockResolvedValue(EMPTY_LATEST)
    mockGetWorldNewspaperArchive.mockResolvedValue(EMPTY_ARCHIVE)
  })

  it('renders masthead 《小镇日报》', async () => {
    render(<NewspaperPanel />)
    expect(await screen.findByText('《小镇日报》')).toBeInTheDocument()
  })

  it('shows empty state when no issue available', async () => {
    render(<NewspaperPanel />)
    expect(await screen.findByText(/日报尚未发行/)).toBeInTheDocument()
  })

  it('displays main headline and sub-headlines when issue is present', async () => {
    mockGetWorldNewspaper.mockResolvedValue({ issue: SAMPLE_ISSUE })

    render(<NewspaperPanel />)

    expect(await screen.findByText('头条新闻一号')).toBeInTheDocument()
    expect(screen.getByText('副条新闻二号')).toBeInTheDocument()
    expect(screen.getByText('三号副标题')).toBeInTheDocument()
  })

  it('displays all four section contents', async () => {
    mockGetWorldNewspaper.mockResolvedValue({ issue: SAMPLE_ISSUE })

    render(<NewspaperPanel />)

    expect(await screen.findByText('经济稳步增长')).toBeInTheDocument()
    expect(screen.getByText('社区和谐共处')).toBeInTheDocument()
    expect(screen.getByText('坊间流传佳话')).toBeInTheDocument()
    expect(screen.getByText('近日无重大事件')).toBeInTheDocument()
  })

  it('toggles archive list on button click', async () => {
    mockGetWorldNewspaperArchive.mockResolvedValue({
      issues: [
        { issue_id: 'issue-1-t20', tick: 20, headlines: ['往期头条'], sections: {} },
      ],
    })

    const user = userEvent.setup()
    render(<NewspaperPanel />)

    // Archive is hidden initially
    expect(screen.queryByText('往期头条')).not.toBeInTheDocument()

    // Click to expand archive
    const archiveBtn = await screen.findByRole('button', { name: /查看往期/ })
    await user.click(archiveBtn)

    await waitFor(() => {
      expect(screen.getByText('往期头条')).toBeInTheDocument()
    })
  })
})
