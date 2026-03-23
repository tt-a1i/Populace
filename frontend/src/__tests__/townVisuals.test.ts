import { describe, expect, it } from 'vitest'

import { createWeatherFilter } from '../components/town/effects/WeatherFilter'
import {
  getDayLightingFromTime,
  getSeasonTilePalette,
} from '../components/town/visuals'

describe('town weather visuals', () => {
  it('creates a distinct sunny filter with stronger warm highlights', () => {
    const filter = createWeatherFilter('sunny')

    expect(filter).not.toBeNull()
    expect(filter?.matrix[0]).toBeGreaterThan(1)
    expect(filter?.matrix[4]).toBeGreaterThan(0)
  })

  it('creates a darker storm filter than the rainy filter', () => {
    const rainy = createWeatherFilter('rainy')
    const stormy = createWeatherFilter('stormy')

    expect(rainy).not.toBeNull()
    expect(stormy).not.toBeNull()
    expect((stormy?.matrix[0] ?? 0)).toBeLessThan(rainy?.matrix[0] ?? 0)
    expect((stormy?.matrix[4] ?? 0)).toBeLessThan(rainy?.matrix[4] ?? 0)
    expect((stormy?.matrix[9] ?? 0)).toBeLessThan(rainy?.matrix[9] ?? 0)
  })
})

describe('town season visuals', () => {
  it('makes spring grass more vivid than autumn grass', () => {
    const spring = getSeasonTilePalette('grass', 4, 7, 'spring')
    const autumn = getSeasonTilePalette('grass', 4, 7, 'autumn')

    expect(spring.fillColor).not.toBe(autumn.fillColor)
    expect(spring.strokeColor).not.toBe(autumn.strokeColor)
  })

  it('makes winter grass cooler than summer grass', () => {
    const winter = getSeasonTilePalette('grass', 10, 3, 'winter')
    const summer = getSeasonTilePalette('grass', 10, 3, 'summer')

    expect(winter.fillColor).not.toBe(summer.fillColor)
  })
})

describe('town day lighting', () => {
  it('treats 08:00 as daytime brightness', () => {
    const lighting = getDayLightingFromTime('Day 1, 08:00')

    expect(lighting.overlayAlpha).toBe(0)
    expect(lighting.brightness).toBeGreaterThan(1)
  })

  it('treats 22:00 as night with darker overlay', () => {
    const lighting = getDayLightingFromTime('Day 1, 22:00')

    expect(lighting.overlayAlpha).toBeGreaterThan(0.2)
    expect(lighting.brightness).toBeLessThan(1)
  })
})
