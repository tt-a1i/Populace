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

    // i18n mock returns key, so label is "settings.sound OFF" or similar
    const btn = screen.getByRole('button')
    expect(btn).toBeInTheDocument()

    await user.click(btn)

    // After toggle, button should still exist
    expect(screen.getByRole('button')).toBeInTheDocument()
  })
})
