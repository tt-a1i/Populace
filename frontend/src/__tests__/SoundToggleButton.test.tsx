import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { SoundProvider } from '../audio'
import { SoundToggleButton } from '../components/toolbar/SoundToggleButton'

describe('SoundToggleButton', () => {
  it('defaults to muted and toggles enabled state', async () => {
    const user = userEvent.setup()

    render(
      <SoundProvider>
        <SoundToggleButton />
      </SoundProvider>,
    )

    expect(screen.getByRole('button', { name: '开启音效' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '开启音效' }))

    expect(screen.getByRole('button', { name: '关闭音效' })).toBeInTheDocument()
  })
})
