import { describe, expect, it } from 'vitest'

import { generateResidentAvatarDataUrl } from '../lib/residentAvatar'

describe('residentAvatar fashion accents', () => {
  it('changes avatar output when clothing category and style score change', () => {
    const base = generateResidentAvatarDataUrl({
      id: 'resident-fashion',
      outfitColor: '#38bdf8',
      appearance: {
        hair: 'short',
        clothing: 'casual',
        style_score: 0.35,
      },
    } as any)

    const stylish = generateResidentAvatarDataUrl({
      id: 'resident-fashion',
      outfitColor: '#38bdf8',
      appearance: {
        hair: 'short',
        clothing: 'festive',
        style_score: 0.92,
      },
    } as any)

    expect(stylish).not.toEqual(base)
  })
})
