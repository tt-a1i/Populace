import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { FirstRunGuide } from '../components/ui/FirstRunGuide'

const STORAGE_KEY = 'populace:first-run-guide-seen'

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

describe('FirstRunGuide', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('renders nothing when enabled=false', () => {
    render(<FirstRunGuide enabled={false} />)
    expect(screen.queryByText('第一次进入操作提示')).not.toBeInTheDocument()
  })

  it('renders the guide when enabled=true and not seen', async () => {
    render(<FirstRunGuide enabled={true} />)
    await waitFor(() =>
      expect(screen.getByText('第一次进入操作提示')).toBeInTheDocument(),
    )
  })

  it('does not show when localStorage flag is already set', async () => {
    localStorageMock.setItem(STORAGE_KEY, '1')
    render(<FirstRunGuide enabled={true} />)
    // Small wait to ensure no async show fires
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText('第一次进入操作提示')).not.toBeInTheDocument()
  })

  it('dismiss button hides the guide', async () => {
    render(<FirstRunGuide enabled={true} />)
    await waitFor(() => screen.getByText('第一次进入操作提示'))
    await userEvent.click(screen.getByRole('button', { name: /关闭/ }))
    await waitFor(() =>
      expect(screen.queryByText('第一次进入操作提示')).not.toBeInTheDocument(),
    )
  })

  it('dismiss button sets localStorage flag', async () => {
    render(<FirstRunGuide enabled={true} />)
    await waitFor(() => screen.getByText('第一次进入操作提示'))
    await userEvent.click(screen.getByRole('button', { name: /关闭/ }))
    expect(localStorageMock.getItem(STORAGE_KEY)).toBe('1')
  })
})
