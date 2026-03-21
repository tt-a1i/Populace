import { ColorMatrixFilter } from 'pixi.js'

export function createWeatherFilter(weather: string): ColorMatrixFilter | null {
  const filter = new ColorMatrixFilter()

  switch (weather) {
    case 'sunny':
      filter.matrix = [
        1.08, 0.05, 0, 0, 0.02,
        0.02, 1.05, 0, 0, 0.01,
        0, 0, 0.92, 0, 0,
        0, 0, 0, 1, 0,
      ]
      return filter

    case 'cloudy':
      filter.desaturate()
      filter.matrix[4] = 0.03
      filter.matrix[9] = 0.03
      filter.matrix[14] = 0.03
      return filter

    case 'rainy':
      filter.matrix = [
        0.88, 0, 0.05, 0, 0,
        0, 0.90, 0.05, 0, 0,
        0.02, 0.05, 1.05, 0, 0.03,
        0, 0, 0, 1, 0,
      ]
      return filter

    case 'stormy':
      filter.matrix = [
        0.7, 0, 0.05, 0, -0.02,
        0, 0.72, 0.05, 0, -0.02,
        0.05, 0.05, 0.9, 0, 0.02,
        0, 0, 0, 1, 0,
      ]
      return filter

    case 'snowy':
      filter.matrix = [
        0.95, 0.05, 0.1, 0, 0.04,
        0.03, 0.95, 0.1, 0, 0.04,
        0.05, 0.08, 1.1, 0, 0.06,
        0, 0, 0, 1, 0,
      ]
      return filter

    default:
      return null
  }
}
