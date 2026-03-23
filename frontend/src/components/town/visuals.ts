import type { TileKind } from './townMap'

export interface DayLighting {
  brightness: number
  overlayAlpha: number
  overlayColor: number | null
  accentAlpha: number
}

function hashValue(x: number, y: number): number {
  return ((x * 7 + y * 13) & 0xff) / 255
}

function parseHour(time: string): number {
  const match = time.match(/(\d{1,2}):(\d{2})/)
  if (!match) {
    return 12
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 12
  }

  return hours + minutes / 60
}

export function getDayLightingFromTime(time: string): DayLighting {
  const hour = parseHour(time)

  if (hour >= 6 && hour < 18) {
    if (hour < 8) {
      return { brightness: 1.05, overlayAlpha: 0.08, overlayColor: 0xffd089, accentAlpha: 0.12 }
    }
    if (hour >= 16) {
      return { brightness: 0.96, overlayAlpha: 0.12, overlayColor: 0xff9f5c, accentAlpha: 0.09 }
    }
    return { brightness: 1.08, overlayAlpha: 0, overlayColor: null, accentAlpha: 0.15 }
  }

  return { brightness: 0.76, overlayAlpha: 0.28, overlayColor: 0x10213f, accentAlpha: 0.04 }
}

export function getSeasonTilePalette(
  kind: TileKind,
  x: number,
  y: number,
  season: string | undefined,
): { fillColor: number; strokeColor: number } {
  const h = hashValue(x, y)
  const activeSeason = season ?? 'spring'

  if (kind === 'water') {
    const bySeason: Record<string, number[]> = {
      spring: [0x2563eb, 0x1d4ed8, 0x3b82f6, 0x1e40af],
      summer: [0x1d4ed8, 0x2563eb, 0x0f766e, 0x1e40af],
      autumn: [0x2563eb, 0x1e3a8a, 0x475569, 0x1d4ed8],
      winter: [0x93c5fd, 0x60a5fa, 0xbfdbfe, 0x7dd3fc],
    }

    const blues = bySeason[activeSeason] ?? bySeason.spring
    return {
      fillColor: blues[Math.floor(h * blues.length)],
      strokeColor: activeSeason === 'winter' ? 0xe0f2fe : 0x60a5fa,
    }
  }

  if (kind === 'road') {
    const bySeason: Record<string, number[]> = {
      spring: [0x57534e, 0x4a4542, 0x52504c, 0x5c5955],
      summer: [0x57534e, 0x44403c, 0x52453b, 0x5b5149],
      autumn: [0x6b5b4d, 0x7c5f3d, 0x665247, 0x725a49],
      winter: [0x64748b, 0x5b6778, 0x708090, 0x6b7280],
    }
    const roads = bySeason[activeSeason] ?? bySeason.spring
    return {
      fillColor: roads[Math.floor(h * roads.length)],
      strokeColor: activeSeason === 'winter' ? 0xcbd5e1 : 0x78716c,
    }
  }

  if (kind === 'mountain') {
    const bySeason: Record<string, number[]> = {
      spring: [0x6b7280, 0x78716c, 0x71717a, 0x64748b],
      summer: [0x6b7280, 0x737373, 0x7a7a7a, 0x64748b],
      autumn: [0x8b7355, 0x7a6b50, 0x806850, 0x8f7d60],
      winter: [0xd1d5db, 0xc4c8cf, 0xe5e7eb, 0xcfd3da],
    }
    const rocks = bySeason[activeSeason] ?? bySeason.spring
    return {
      fillColor: rocks[Math.floor(h * rocks.length)],
      strokeColor: activeSeason === 'winter' ? 0xf3f4f6 : 0x9ca3af,
    }
  }

  const grassBySeason: Record<string, number[]> = {
    spring: [0x3f9d48, 0x48ad50, 0x5cb85c, 0x43a047, 0x4caf50, 0x57b95a],
    summer: [0x2d7a3a, 0x348a42, 0x3b9348, 0x2e8040, 0x38863e, 0x2a7236],
    autumn: [0x7a8f36, 0x8f9d3b, 0x9f9f45, 0x7b8740, 0x96863a, 0xb59a3b],
    winter: [0xb7d2dc, 0xc7dbe4, 0xd9e7ef, 0xa7c7d7, 0xc2d8e2, 0xdfeef7],
  }

  const strokeBySeason: Record<string, number> = {
    spring: 0x2f7a32,
    summer: 0x1a5c28,
    autumn: 0x6f742b,
    winter: 0x7aa2b6,
  }

  const grass = grassBySeason[activeSeason] ?? grassBySeason.spring
  return {
    fillColor: grass[Math.floor(h * grass.length)],
    strokeColor: strokeBySeason[activeSeason] ?? strokeBySeason.spring,
  }
}

// ── Grass decoration data (deterministic per tile) ────────────────────────

export interface GrassDecoration {
  /** Relative positions (0-1) of small dots/patches within the tile */
  dots: Array<{ rx: number; ry: number; size: number; darken: boolean }>
}

export function getGrassDecoration(x: number, y: number): GrassDecoration {
  const h1 = ((x * 31 + y * 17) & 0xff)
  const h2 = ((x * 11 + y * 23) & 0xff)
  const h3 = ((x * 41 + y * 7) & 0xff)

  const dots: GrassDecoration['dots'] = []

  // ~60% of tiles get 1-3 small detail dots
  if (h1 > 100) {
    dots.push({ rx: (h1 & 0x1f) / 31, ry: (h2 & 0x1f) / 31, size: 1 + (h3 % 2), darken: (h1 & 1) === 0 })
  }
  if (h2 > 140) {
    dots.push({ rx: (h3 & 0x1f) / 31, ry: (h1 & 0x1f) / 31, size: 1, darken: (h2 & 1) === 0 })
  }
  if (h3 > 180) {
    dots.push({ rx: (h2 & 0x1f) / 31, ry: (h3 & 0x1f) / 31, size: 1.5, darken: true })
  }

  return { dots }
}

// ── Occupation color map ──────────────────────────────────────────────────

export const OCCUPATION_OUTLINE_COLOR: Record<string, number> = {
  barista: 0x92400e,
  teacher: 0xca8a04,
  shopkeeper: 0x1d4ed8,
  doctor: 0xbe123c,
  librarian: 0x0369a1,
}

// ── Building shape helpers ────────────────────────────────────────────────

export const BUILDING_SHAPE: Record<string, 'rect' | 'arch' | 'peaked' | 'round'> = {
  cafe: 'arch',
  park: 'round',
  school: 'peaked',
  shop: 'rect',
  home: 'rect',
  gym: 'peaked',
  library: 'arch',
  hospital: 'peaked',
}
