import i18n from '../../i18n/config'
import type { Building } from '../../types'
import type { ResidentPosition } from '../../stores/simulation'

export const TILE_SIZE = 32
export const MAP_WIDTH = 40
export const MAP_HEIGHT = 30
export const WORLD_WIDTH = MAP_WIDTH * TILE_SIZE
export const WORLD_HEIGHT = MAP_HEIGHT * TILE_SIZE

export type TileKind = 'grass' | 'road' | 'water' | 'mountain'

export interface PlaceholderBuilding {
  id: string
  tileX: number
  tileY: number
  label: string
}

export interface TileInspectionDetails {
  tileX: number
  tileY: number
  tileKind: TileKind
  buildingId: string | null
  buildingName: string | null
  residentCount: number
}

export interface BuildingFootprint {
  cols: number
  rows: number
}

export function clampTileCoordinate(value: number, upperBound: number): number {
  return Math.max(0, Math.min(upperBound, value))
}

// ── Tile override system (map editor) ────────────────────────────────
const STORAGE_KEY = 'populace:tile-overrides'
const _tileOverrides = new Map<string, TileKind>()

function _tileKey(x: number, y: number): string { return `${x},${y}` }

export function loadTileOverrides(): void {
  _tileOverrides.clear()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const entries = JSON.parse(raw) as Array<[string, TileKind]>
    for (const [key, kind] of entries) _tileOverrides.set(key, kind)
  } catch { /* ignore corrupt data */ }
}

export function saveTileOverrides(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([..._tileOverrides.entries()]))
}

export function setTileOverride(x: number, y: number, kind: TileKind): void {
  _tileOverrides.set(_tileKey(x, y), kind)
}

export function eraseTileOverride(x: number, y: number): void {
  _tileOverrides.delete(_tileKey(x, y))
}

export function clearAllTileOverrides(): void {
  _tileOverrides.clear()
  localStorage.removeItem(STORAGE_KEY)
}

export function hasTileOverrides(): boolean {
  return _tileOverrides.size > 0
}

// Load overrides on module init
loadTileOverrides()

export function getTileKind(x: number, y: number): TileKind {
  const override = _tileOverrides.get(_tileKey(x, y))
  if (override) return override

  const isCentralRoad = y === 14 || y === 15 || x === 18 || x === 19
  const isDiagonalRoad = y - x === 6 || x + y === 31
  const isLake = x >= 23 && x <= 29 && y >= 9 && y <= 14

  if (isLake) {
    return 'water'
  }

  if (isCentralRoad || (isDiagonalRoad && y > 10 && y < 22)) {
    return 'road'
  }

  return 'grass'
}

export function formatTileKind(tileKind: TileKind): string {
  switch (tileKind) {
    case 'road':
      return i18n.t('chrome.terrain_road')
    case 'water':
      return i18n.t('chrome.terrain_water')
    case 'mountain':
      return i18n.t('chrome.terrain_mountain', '\u5C71\u5730')
    default:
      return i18n.t('chrome.terrain_grass')
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getBuildingFootprint(_building: Building): BuildingFootprint {
  return { cols: 2, rows: 3 }
}

export function inspectTile(
  tileX: number,
  tileY: number,
  buildings: Array<Building & { occupants?: number }>,
  residents: ResidentPosition[],
): TileInspectionDetails {
  const building = buildings.find((candidate) => {
    const footprint = getBuildingFootprint(candidate)
    return (
      tileX >= candidate.position[0] &&
      tileX < candidate.position[0] + footprint.cols &&
      tileY >= candidate.position[1] &&
      tileY < candidate.position[1] + footprint.rows
    )
  })
  const residentCount = residents.filter((resident) => resident.targetX === tileX && resident.targetY === tileY).length

  return {
    tileX,
    tileY,
    tileKind: getTileKind(tileX, tileY),
    buildingId: building?.id ?? null,
    buildingName: building?.name ?? null,
    residentCount,
  }
}
