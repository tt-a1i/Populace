import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const { mockGetResidentFamily, mockSelectResident } = vi.hoisted(() => ({
  mockGetResidentFamily: vi.fn().mockResolvedValue({
    family_name: '林家',
    resident: { id: 'r1', name: '林明', relation: 'self', age_days: 800, deceased: false },
    members: [
      { id: 'r-parent', name: '林伯', relation: 'parent', age_days: 2200, deceased: false },
      { id: 'r1', name: '林明', relation: 'self', age_days: 800, deceased: false },
      { id: 'r-sibling', name: '林雨', relation: 'sibling', age_days: 780, deceased: false },
      { id: 'r-child', name: '林安', relation: 'child', age_days: 120, deceased: false },
    ],
    tree: {
      root: { id: 'r1', name: '林明', relation: 'self', age_days: 800, deceased: false },
      parents: [{ id: 'r-parent', name: '林伯', relation: 'parent', age_days: 2200, deceased: false }],
      siblings: [{ id: 'r-sibling', name: '林雨', relation: 'sibling', age_days: 780, deceased: false }],
      spouse: null,
      children: [{ id: 'r-child', name: '林安', relation: 'child', age_days: 120, deceased: false }],
    },
  }),
  mockSelectResident: vi.fn(),
}))

vi.mock('../services/api', () => ({
  getResidentFamily: mockGetResidentFamily,
}))

vi.mock('../stores/simulation', () => ({
  useSimulationStore: Object.assign(
    (selector: (state: { selectResident: (id: string | null) => void }) => unknown) =>
      selector({ selectResident: mockSelectResident }),
    { getState: () => ({ selectResident: mockSelectResident }) },
  ),
}))

import { FamilyTreePanel } from '../components/town/FamilyTreePanel'

describe('FamilyTreePanel', () => {
  it('renders family members and jumps to another member on click', async () => {
    const user = userEvent.setup()
    render(<FamilyTreePanel residentId="r1" />)

    await waitFor(() => {
      expect(mockGetResidentFamily).toHaveBeenCalledWith('r1')
    })

    expect(await screen.findByText('林家')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /林雨/ }))

    expect(mockSelectResident).toHaveBeenCalledWith('r-sibling')
  })
})
