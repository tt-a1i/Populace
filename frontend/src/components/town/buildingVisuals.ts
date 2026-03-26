export interface BuildingVisualProfileInput {
  type: string
  level?: number
  decoration_score?: number
}

export interface BuildingVisualProfile {
  widthScale: number
  heightScale: number
  glowAlpha: number
}

export function getBuildingVisualProfile(building: BuildingVisualProfileInput): BuildingVisualProfile {
  const level = Math.max(1, Math.min(3, building.level ?? 1))
  const decoration = Math.max(0, Math.min(1, building.decoration_score ?? 0))

  return {
    widthScale: 1 + (level - 1) * 0.12,
    heightScale: 1 + (level - 1) * 0.1,
    glowAlpha: 0.08 + (level - 1) * 0.08 + decoration * 0.1,
  }
}
