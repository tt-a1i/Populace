import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { ThemeToggle } from '../components/ui/ThemeToggle'
import { useThemeStore } from '../stores/theme'

describe('ThemeToggle', () => {
  beforeEach(() => {
    // Reset to dark theme before each test
    useThemeStore.setState({ theme: 'dark' })
    document.documentElement.classList.remove('theme-light')
  })

  it('renders the sun icon in dark theme', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button')).toHaveTextContent('☀️')
  })

  it('renders the moon icon in light theme', () => {
    useThemeStore.setState({ theme: 'light' })
    render(<ThemeToggle />)
    expect(screen.getByRole('button')).toHaveTextContent('🌙')
  })

  it('toggles theme from dark to light on click', async () => {
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('button'))
    expect(useThemeStore.getState().theme).toBe('light')
  })

  it('toggles theme from light to dark on click', async () => {
    useThemeStore.setState({ theme: 'light' })
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('button'))
    expect(useThemeStore.getState().theme).toBe('dark')
  })

  it('has correct aria-label in dark mode', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', '亮色')
  })

  it('has correct aria-label in light mode', () => {
    useThemeStore.setState({ theme: 'light' })
    render(<ThemeToggle />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', '暗色')
  })
})

describe('useThemeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: 'dark' })
  })

  it('starts in dark theme', () => {
    expect(useThemeStore.getState().theme).toBe('dark')
  })

  it('toggleTheme flips dark→light', () => {
    useThemeStore.getState().toggleTheme()
    expect(useThemeStore.getState().theme).toBe('light')
  })

  it('toggleTheme flips light→dark', () => {
    useThemeStore.setState({ theme: 'light' })
    useThemeStore.getState().toggleTheme()
    expect(useThemeStore.getState().theme).toBe('dark')
  })
})
