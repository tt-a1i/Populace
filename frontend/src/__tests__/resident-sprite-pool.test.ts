import { describe, expect, it, vi } from 'vitest'

import { ResidentSpritePool } from '../components/town/ResidentSpritePool'

describe('ResidentSpritePool', () => {
  it('reuses released sprites instead of creating new ones', () => {
    const factory = vi.fn(() => ({ id: Symbol('sprite') }))
    const pool = new ResidentSpritePool(factory)

    const first = pool.acquire()
    pool.release(first)
    const second = pool.acquire()

    expect(factory).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
  })
})
