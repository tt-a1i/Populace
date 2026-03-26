import { describe, expect, it } from 'vitest'

import { getBuildingVisualProfile } from '../components/town/buildingVisuals'

describe('getBuildingVisualProfile', () => {
  it('amplifies footprint and glow as building level increases', () => {
    const base = getBuildingVisualProfile({ type: 'cafe', level: 1, decoration_score: 0.1 })
    const upgraded = getBuildingVisualProfile({ type: 'cafe', level: 3, decoration_score: 0.8 })

    expect(upgraded.widthScale).toBeGreaterThan(base.widthScale)
    expect(upgraded.heightScale).toBeGreaterThan(base.heightScale)
    expect(upgraded.glowAlpha).toBeGreaterThan(base.glowAlpha)
  })
})
