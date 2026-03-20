import type { Building } from '../../types'
import type { ResidentPosition } from '../../stores/simulation'

export const TILE_SIZE = 32
export const MAP_WIDTH = 40
export const MAP_HEIGHT = 30
export const WORLD_WIDTH = MAP_WIDTH * TILE_SIZE
export const WORLD_HEIGHT = MAP_HEIGHT * TILE_SIZE

export type TileKind = 'grass' | 'road' | 'water'

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

export function getTileKind(x: number, y: number): TileKind {
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
      return '道路'
    case 'water':
      return '水域'
    default:
      return '草地'
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
    buildingName: building?.name ?? null,
    residentCount,
  }
}
