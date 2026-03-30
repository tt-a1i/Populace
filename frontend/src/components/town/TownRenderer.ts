import { Application, Container, Graphics, Rectangle, Text } from 'pixi.js'

import type { WorldTransportPayload } from '../../services/api'
import { useSimulationStore, type ResidentPosition, type SimulationSpeed } from '../../stores/simulation'
import type { Building, Disaster, Festival, Zone } from '../../types'
import { ResidentSprite, type ResidentHoverInfo } from './ResidentSprite'
import { ResidentSpritePool } from './ResidentSpritePool'
import { MilestoneEffect } from './effects/MilestoneEffect'
import { CloudEffect } from './effects/CloudEffect'
import { RainEffect } from './effects/RainEffect'
import { SnowEffect } from './effects/SnowEffect'
import { StormEffect } from './effects/StormEffect'
import { createWeatherFilter } from './effects/WeatherFilter'
import { getBuildingVisualProfile } from './buildingVisuals'
import { BUILDING_SHAPE, getDayLightingFromTime, getGrassDecoration, getSeasonTilePalette } from './visuals'
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_SIZE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  clampTileCoordinate,
  getTileKind,
  type PlaceholderBuilding,
  type TileKind,
} from './townMap'

type WeatherEffect = RainEffect | SnowEffect | StormEffect | CloudEffect

const CAMERA_PADDING = 56
const MOOD_EMOJI_MAP: Record<string, string> = {
  happy: '\uD83D\uDE0A', content: '\uD83D\uDE42', sad: '\uD83D\uDE22', angry: '\uD83D\uDE20',
  excited: '\uD83E\uDD29', fearful: '\uD83D\uDE28', neutral: '\uD83D\uDE10', calm: '\uD83D\uDE0C',
  tired: '\uD83D\uDE34', ecstatic: '\uD83E\uDD73',
}
const POOLED_RESIDENT_PLACEHOLDER: ResidentPosition = {
  id: '__pool__',
  name: '',
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0,
  color: 0x94a3b8,
  status: 'idle',
  currentBuildingId: null,
  dialogueText: null,
}

interface SimulationMeta {
  running: boolean
  speed: SimulationSpeed
  tick: number
  tickPerDay: number
  time: string
  season?: string
}

interface TownRendererOptions {
  onViewportChange?: (viewport: { centerX: number; centerY: number; zoom: number }) => void
}

export class TownRenderer {
  private readonly app: Application
  private readonly world = new Container()
  private readonly tileLayer = new Container()
  private readonly zoneLayer = new Container()
  private readonly buildingLayer = new Container()
  private readonly residentLayer = new Container()
  private readonly petLayer = new Container()
  private readonly effectLayer = new Container()
  private readonly uiLayer = new Container()
  private readonly residents = new Map<string, ResidentSprite>()
  private readonly petSprites = new Map<string, Text>()
  private readonly residentSpritePool = new ResidentSpritePool<ResidentSprite>(
    () =>
      new ResidentSprite(POOLED_RESIDENT_PLACEHOLDER, {
        onFocusRequest: this.followResident,
        onSelectRequest: this.selectResident,
        onHoverStart: this.showTooltip,
        onHoverEnd: this.hideTooltip,
      }),
  )
  private readonly tileGraphics = new Graphics()
  private readonly zoneGraphics = new Graphics()
  private readonly transportGraphics = new Graphics()
  private readonly buildingGraphics = new Graphics()
  private readonly buildingLabelLayer = new Container()
  private readonly buildingCapacityLayer = new Container()
  private readonly buildingHoverTooltip = new Container()
  private readonly buildingHoverBg = new Graphics()
  private readonly buildingHoverTitle: Text = null!
  private readonly buildingHoverType: Text = null!
  private readonly buildingHoverOccupancy: Text = null!
  private hoveredBuildingId: string | null = null
  private buildingHoverAlpha = 0
  private readonly placeholderGraphics = new Graphics()
  private readonly placeholderLabelLayer = new Container()
  private readonly ambientAccent = new Graphics()
  private readonly sunnyGlow = new Graphics()
  private readonly dayNightOverlay = new Graphics()
  private readonly weatherContainer = new Container()
  private readonly disasterOverlay = new Graphics()
  private readonly festivalMarker = new Container()
  private readonly festivalPulse = new Graphics()
  private readonly festivalCore = new Graphics()
  private readonly festivalLabel = new Text({
    text: '',
    style: { fill: 0xfffbeb, fontFamily: 'Avenir Next, Helvetica Neue, sans-serif', fontSize: 10, fontWeight: '700' },
  })
  private currentWeatherEffect: WeatherEffect | null = null
  private currentWeather = 'sunny'
  private readonly onViewportChange?: TownRendererOptions['onViewportChange']
  private milestoneEffects: MilestoneEffect[] = []
  private readonly eventRadiusGraphics = new Graphics()
  private readonly hudLabel: Text
  private readonly hintLabel: Text
  private highlightedResidentIds = new Set<string>()
  private currentBuildings: Array<Building & { occupants?: number }> = []
  private currentZones: Zone[] = []
  private selectedZoneId: string | null = null
  private placeholderBuildings: PlaceholderBuilding[] = []
  private readonly vignetteGraphics = new Graphics()
  private readonly waterOverlay = new Graphics()
  private waterTime = 0
  // Hover tooltip
  private readonly tooltipContainer = new Container()
  private readonly tooltipBg = new Graphics()
  private readonly tooltipName: Text
  private readonly tooltipDetails: Text
  private readonly tooltipEnergyBar = new Graphics()
  private tooltipVisible = false
  // Relationship connection lines
  private readonly relationLineGraphics = new Graphics()
  private relationLinePulse = 0
  // Path visualization
  private readonly pathGraphics = new Graphics()
  private readonly pathTargetGraphics = new Graphics()
  private pathPulse = 0
  private currentResidentPositions: ResidentPosition[] = []
  // Heatmap
  private readonly heatmapGraphics = new Graphics()
  private heatmapEnabled = false
  private heatmapFilterResidentId: string | null = null
  private readonly heatmapHistory: Array<{ id: string; x: number; y: number }[]> = []
  private readonly MAX_HEATMAP_TICKS = 100
  private activeFestival: Festival | null = null
  private activeDisasters: Disaster[] = []
  private currentTransport: WorldTransportPayload = {
    roads: [],
    stats: { mode_share: {}, average_travel_ticks: 0, congestion_hotspots: [] },
  }
  private festivalPulseTime = 0
  private disasterPulseTime = 0
  private buildingSignature = ''
  private transportSignature = ''
  private zoneSignature = ''
  private tileVisualSignature = ''

  private dragging = false
  private dragPointerId: number | null = null
  private dragStartX = 0
  private dragStartY = 0
  private dragLastX = 0
  private dragLastY = 0
  private dragLastTime = 0
  private inertiaVx = 0
  private inertiaVy = 0
  private inertiaRaf: number | null = null
  private worldStartX = 0
  private worldStartY = 0
  private hasUserCameraOverride = false
  private viewportWidth = 0
  private viewportHeight = 0
  private zoom = 1
  private readonly minZoom = 0.45
  private readonly maxZoom = 2.4
  private pinchActive = false
  private pinchStartDistance = 0
  private pinchStartZoom = 1
  private followedResidentId: string | null = null
  private simulationMeta: SimulationMeta = {
    running: true,
    speed: 1,
    tick: 16,
    tickPerDay: 48,
    time: 'Day 1, 08:00',
  }

  constructor(app: Application, options: TownRendererOptions = {}) {
    this.app = app
    this.onViewportChange = options.onViewportChange

    this.app.stage.sortableChildren = true
    this.app.stage.addChild(this.world, this.uiLayer)
    this.world.sortableChildren = true
    this.world.hitArea = new Rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.world.addChild(this.tileLayer, this.zoneLayer, this.buildingLayer, this.residentLayer, this.petLayer, this.effectLayer)

    this.tileLayer.zIndex = 0
    this.zoneLayer.zIndex = 1
    this.buildingLayer.zIndex = 2
    this.residentLayer.zIndex = 3
    this.petLayer.zIndex = 4
    this.effectLayer.zIndex = 5
    this.uiLayer.zIndex = 4
    this.residentLayer.sortableChildren = true

    this.tileLayer.addChild(this.tileGraphics)
    this.zoneLayer.addChild(this.zoneGraphics)
    this.buildingLayer.addChild(
      this.transportGraphics,
      this.buildingGraphics,
      this.placeholderGraphics,
      this.buildingCapacityLayer,
      this.buildingLabelLayer,
      this.placeholderLabelLayer,
    )
    this.tileLayer.addChild(this.waterOverlay)
    this.effectLayer.addChild(
      this.ambientAccent, this.sunnyGlow, this.dayNightOverlay,
      this.eventRadiusGraphics, this.heatmapGraphics, this.weatherContainer, this.disasterOverlay, this.festivalMarker, this.vignetteGraphics,
    )
    this.festivalMarker.addChild(this.festivalPulse, this.festivalCore, this.festivalLabel)
    this.festivalMarker.visible = false
    this.festivalLabel.anchor = { x: 0.5, y: 1.8 }

    // Path + relationship lines below residents
    this.residentLayer.addChild(this.pathGraphics, this.pathTargetGraphics, this.relationLineGraphics)
    this.pathGraphics.zIndex = -2
    this.pathTargetGraphics.zIndex = -2
    this.relationLineGraphics.zIndex = -1

    // Tooltip container — in uiLayer so it's above everything
    this.tooltipName = new Text({
      text: '',
      style: { fill: 0xf8fafc, fontFamily: 'Avenir Next, Helvetica Neue, sans-serif', fontSize: 10, fontWeight: '700' },
    })
    this.tooltipDetails = new Text({
      text: '',
      style: { fill: 0x94a3b8, fontFamily: 'Avenir Next, Helvetica Neue, sans-serif', fontSize: 9, fontWeight: '500' },
    })
    this.tooltipName.position.set(8, 6)
    this.tooltipDetails.position.set(8, 20)
    this.tooltipEnergyBar.position.set(8, 34)
    this.tooltipContainer.addChild(this.tooltipBg, this.tooltipName, this.tooltipDetails, this.tooltipEnergyBar)
    this.tooltipContainer.visible = false
    this.tooltipContainer.zIndex = 100

    // Building hover tooltip — in uiLayer above world
    this.buildingHoverTitle = new Text({
      text: '',
      style: { fill: 0xf8fafc, fontFamily: 'Avenir Next, Helvetica Neue, sans-serif', fontSize: 11, fontWeight: '700' },
    })
    this.buildingHoverType = new Text({
      text: '',
      style: { fill: 0x94a3b8, fontFamily: 'Avenir Next, Helvetica Neue, sans-serif', fontSize: 9, fontWeight: '500' },
    })
    this.buildingHoverOccupancy = new Text({
      text: '',
      style: { fill: 0xfbbf24, fontFamily: 'Avenir Next, Helvetica Neue, sans-serif', fontSize: 9, fontWeight: '600' },
    })
    this.buildingHoverTitle.position.set(10, 8)
    this.buildingHoverType.position.set(10, 24)
    this.buildingHoverOccupancy.position.set(10, 38)
    this.buildingHoverTooltip.addChild(
      this.buildingHoverBg, this.buildingHoverTitle, this.buildingHoverType, this.buildingHoverOccupancy,
    )
    this.buildingHoverTooltip.visible = false
    this.buildingHoverTooltip.zIndex = 101

    this.tileLayer.eventMode = 'static'
    this.tileLayer.hitArea = new Rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.tileLayer.on('pointertap', this.handleBackgroundTap)

    this.hudLabel = new Text({
      text: '',
      style: {
        fill: 0xe2e8f0,
        fontFamily: 'Avenir Next, Helvetica Neue, sans-serif',
        fontSize: 12,
        fontWeight: '600',
        stroke: { color: 0x020617, width: 4 },
      },
    })
    this.hudLabel.position.set(16, 16)
    this.hudLabel.visible = false  // Hidden — HTML HUD overlay replaces this

    this.hintLabel = new Text({
      text: '',
      style: {
        fill: 0xcbd5e1,
        fontFamily: 'Avenir Next, Helvetica Neue, sans-serif',
        fontSize: 12,
        fontWeight: '500',
        stroke: { color: 0x020617, width: 3 },
      },
      anchor: { x: 1, y: 0 },
    })
    this.hintLabel.visible = false  // Hidden — HTML HUD overlay replaces this
    this.uiLayer.addChild(this.hudLabel, this.hintLabel, this.tooltipContainer, this.buildingHoverTooltip)

    this.drawTiles()
    this.drawZones()
    this.drawBuildings()
    this.drawTransport()
    this.drawAmbientAccent()
    this.drawVignette()
    this.updateDayNightOverlay()
    this.bindCameraControls()
    this.app.ticker.add(this.animate)
    this.renderHud()
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) {
      return
    }

    this.viewportWidth = width
    this.viewportHeight = height
    this.app.renderer.resize(width, height)

    if (this.followedResidentId) {
      this.centerOnResident(this.followedResidentId, true)
    } else if (this.hasUserCameraOverride) {
      this.clampPan()
    } else {
      this.zoom = this.getFitZoom(width, height)
      this.world.scale.set(this.zoom)
      this.centerWorld()
    }

    this.hintLabel.position.set(width - 16, 16)
    this.updateBuildingLabelsForZoom()
    this.renderHud()
    this.emitViewportChange()
  }

  private static readonly BUILDING_TYPE_COLOR: Record<string, number> = {
    cafe: 0xb45309, park: 0x15803d, school: 0x7c3aed, shop: 0xdc2626,
    home: 0x1e40af, gym: 0xea580c, library: 0x0369a1, hospital: 0xbe123c, default: 0x475569,
  }

  private static readonly BUILDING_TYPE_ICON: Record<string, string> = {
    cafe: '☕', park: '🌳', school: '📖',
    shop: '🛍️', home: '🏠', gym: '🏋',
    library: '📚', hospital: '🏥',
  }

  syncBuildings(buildings: Array<Building & { occupants?: number }>): void {
    const nextSignature = JSON.stringify(
      buildings.map((building) => ({
        id: building.id,
        name: building.name,
        type: building.type,
        position: building.position,
        capacity: building.capacity,
        occupants: building.occupants ?? 0,
        level: building.level ?? 1,
        decoration_score: building.decoration_score ?? 0,
        upgrades: building.upgrades ?? [],
      })),
    )
    this.currentBuildings = buildings

    if (this.buildingSignature === nextSignature) {
      this.drawTransport()
      this.drawDisasterOverlay()
      this.drawFestivalMarker()
      return
    }
    this.buildingSignature = nextSignature

    while (this.buildingLabelLayer.children.length > 0) {
      const child = this.buildingLabelLayer.children[0]
      this.buildingLabelLayer.removeChild(child)
      child.destroy()
    }
    while (this.buildingCapacityLayer.children.length > 0) {
      const child = this.buildingCapacityLayer.children[0]
      this.buildingCapacityLayer.removeChild(child)
      child.destroy()
    }

    this.buildingGraphics.clear()

    if (!buildings.length) {
      this.drawBuildings()
      this.drawTransport()
      this.drawDisasterOverlay()
      this.drawFestivalMarker()
      return
    }

    for (const b of buildings) {
      const [bx, by] = b.position
      const profile = getBuildingVisualProfile(b)
      const baseWidth = TILE_SIZE * 2
      const baseHeight = TILE_SIZE * 3
      const width = baseWidth * profile.widthScale
      const height = baseHeight * profile.heightScale
      const x = bx * TILE_SIZE - (width - baseWidth) / 2
      const y = by * TILE_SIZE - (height - baseHeight)
      const color = TownRenderer.BUILDING_TYPE_COLOR[b.type] ?? TownRenderer.BUILDING_TYPE_COLOR.default
      const shape = BUILDING_SHAPE[b.type] ?? 'rect'

      // Building shadow
      this.buildingGraphics.roundRect(x + 2, y + 2, width, height, 6)
      this.buildingGraphics.fill({ color: 0x000000, alpha: 0.25 })
      this.buildingGraphics.roundRect(x - 4, y - 4, width + 8, height + 8, 10)
      this.buildingGraphics.fill({ color, alpha: profile.glowAlpha })

      // Building body
      if (shape === 'peaked') {
        this.buildingGraphics.moveTo(x, y + 10)
        this.buildingGraphics.lineTo(x + width / 2, y)
        this.buildingGraphics.lineTo(x + width, y + 10)
        this.buildingGraphics.lineTo(x + width, y + height)
        this.buildingGraphics.lineTo(x, y + height)
        this.buildingGraphics.closePath()
        this.buildingGraphics.fill({ color, alpha: 0.88 })
        this.buildingGraphics.stroke({ color: 0xffffff, alpha: 0.12, width: 1.5 })
      } else if (shape === 'arch') {
        this.buildingGraphics.roundRect(x, y, width, height, 16)
        this.buildingGraphics.fill({ color, alpha: 0.88 })
        this.buildingGraphics.stroke({ color: 0xffffff, alpha: 0.12, width: 1.5 })
      } else if (shape === 'round') {
        this.buildingGraphics.ellipse(x + width / 2, y + height / 2, width / 2, height / 2)
        this.buildingGraphics.fill({ color, alpha: 0.72 })
        this.buildingGraphics.stroke({ color: 0xffffff, alpha: 0.12, width: 1.5 })
      } else {
        this.buildingGraphics.roundRect(x, y, width, height, 6)
        this.buildingGraphics.fill({ color, alpha: 0.88 })
        this.buildingGraphics.stroke({ color: 0xffffff, alpha: 0.12, width: 1.5 })
      }

      // Entrance marker
      const entranceX = x + width / 2
      const entranceY = y + height
      this.buildingGraphics.moveTo(entranceX - 4, entranceY)
      this.buildingGraphics.lineTo(entranceX, entranceY + 5)
      this.buildingGraphics.lineTo(entranceX + 4, entranceY)
      this.buildingGraphics.closePath()
      this.buildingGraphics.fill({ color: 0xfbbf24, alpha: 0.7 })

      // POI label (icon + name) above building
      const icon = TownRenderer.BUILDING_TYPE_ICON[b.type] ?? ''
      const labelContainer = new Container()
      labelContainer.label = b.id

      const iconText = new Text({
        text: icon || '?',
        style: { fill: 0xffffff, fontFamily: 'Avenir Next, Helvetica Neue, sans-serif', fontSize: 14, align: 'center' },
        anchor: { x: 0.5, y: 0.5 },
      })
      iconText.label = 'poi-icon'

      const nameText = new Text({
        text: `${b.name}${(b.level ?? 1) > 1 ? ` · Lv.${b.level}` : ''}`,
        style: {
          fill: 0xf8fafc, fontFamily: 'Avenir Next, Helvetica Neue, sans-serif',
          fontSize: 9, fontWeight: '700', wordWrap: true, wordWrapWidth: width + 20, align: 'center',
        },
        anchor: { x: 0.5, y: 0 },
      })
      nameText.label = 'poi-name'

      const labelCenterX = x + width / 2
      const labelTopY = y - 16
      iconText.position.set(labelCenterX, labelTopY)
      nameText.position.set(labelCenterX, labelTopY + 10)

      const bgGraphics = new Graphics()
      bgGraphics.label = 'poi-bg'
      labelContainer.addChild(bgGraphics, iconText, nameText)
      this.buildingLabelLayer.addChild(labelContainer)

      // Capacity progress bar at entrance
      const occupants = b.occupants ?? 0
      const cap = b.type === 'park' ? 0 : b.capacity
      const barWidth = width - 8
      const barHeight = 3
      const barX = x + 4
      const barY = entranceY + 6
      const barContainer = new Container()
      barContainer.label = b.id
      const barGraphics = new Graphics()

      barGraphics.roundRect(barX, barY, barWidth, barHeight, 1.5)
      barGraphics.fill({ color: 0x1e293b, alpha: 0.7 })

      if (cap > 0) {
        const fillRatio = Math.min(occupants / cap, 1)
        const fillWidth = Math.max(fillRatio * barWidth, fillRatio > 0 ? 2 : 0)
        const fillColor = fillRatio >= 0.9 ? 0xef4444 : fillRatio >= 0.6 ? 0xfbbf24 : 0x22c55e
        if (fillWidth > 0) {
          barGraphics.roundRect(barX, barY, fillWidth, barHeight, 1.5)
          barGraphics.fill({ color: fillColor, alpha: 0.9 })
        }
      }

      const countText = new Text({
        text: cap > 0 ? `${occupants}/${cap}` : `${occupants}`,
        style: { fill: 0xcbd5e1, fontFamily: 'Avenir Next, Helvetica Neue, sans-serif', fontSize: 7, fontWeight: '600' },
        anchor: { x: 0.5, y: 0 },
      })
      countText.position.set(x + width / 2, barY + barHeight + 1)
      barContainer.addChild(barGraphics, countText)
      this.buildingCapacityLayer.addChild(barContainer)
    }

    this.updateBuildingLabelsForZoom()
    this.drawPlaceholderBuildings()
    this.drawTransport()
    this.drawDisasterOverlay()
    this.drawFestivalMarker()
  }

  syncTransport(transport: WorldTransportPayload, buildings: Array<Building & { occupants?: number }> = this.currentBuildings): void {
    const nextSignature = JSON.stringify({
      roads: transport.roads,
      hotspots: transport.stats.congestion_hotspots,
    })
    this.currentTransport = transport
    this.currentBuildings = buildings
    if (this.transportSignature === nextSignature) {
      return
    }
    this.transportSignature = nextSignature
    this.drawTransport()
  }

  private drawTransport(): void {
    this.transportGraphics.clear()
    if (!this.currentTransport.roads.length || !this.currentBuildings.length) {
      return
    }

    const buildingById = new Map(this.currentBuildings.map((building) => [building.id, building]))
    for (const road of this.currentTransport.roads) {
      const from = buildingById.get(road.from_building)
      const to = buildingById.get(road.to_building)
      if (!from || !to) {
        continue
      }

      const x1 = from.position[0] * TILE_SIZE + TILE_SIZE
      const y1 = from.position[1] * TILE_SIZE + TILE_SIZE * 1.5
      const x2 = to.position[0] * TILE_SIZE + TILE_SIZE
      const y2 = to.position[1] * TILE_SIZE + TILE_SIZE * 1.5
      const width = 1.5 + Math.min(4, road.traffic * 0.8)
      const alpha = 0.2 + Math.min(0.45, road.traffic * 0.08)
      const color = road.traffic >= 4 ? 0xf97316 : road.traffic >= 2 ? 0xfbbf24 : 0x38bdf8

      this.transportGraphics.moveTo(x1, y1)
      this.transportGraphics.lineTo(x2, y2)
      this.transportGraphics.stroke({ color, width, alpha })
    }
  }

  syncZones(zones: Zone[]): void {
    const nextSignature = JSON.stringify(
      zones.map((zone) => ({
        id: zone.id,
        type: zone.type,
        bounds: zone.bounds,
      })),
    )
    this.currentZones = zones
    if (this.zoneSignature === nextSignature) {
      return
    }
    this.zoneSignature = nextSignature
    this.drawZones()
  }

  setSelectedZone(zoneId: string | null): void {
    this.selectedZoneId = zoneId
    this.drawZones()
  }

  /** Adapt building POI labels to current zoom level */
  private updateBuildingLabelsForZoom(): void {
    const showName = this.zoom >= 0.75

    for (const child of this.buildingLabelLayer.children) {
      if (!(child instanceof Container) || !child.label) continue

      let iconNode: Text | null = null
      let nameNode: Text | null = null
      let bgNode: Graphics | null = null

      for (const sub of child.children) {
        if (sub.label === 'poi-icon' && sub instanceof Text) iconNode = sub
        if (sub.label === 'poi-name' && sub instanceof Text) nameNode = sub
        if (sub.label === 'poi-bg' && sub instanceof Graphics) bgNode = sub
      }

      if (nameNode) nameNode.visible = showName
      if (iconNode) {
        iconNode.style.fontSize = showName ? 14 : 18
      }

      // Draw semi-transparent background pill
      if (bgNode && iconNode) {
        bgNode.clear()
        const pad = 4
        const tw = showName && nameNode?.visible ? Math.max(iconNode.width, nameNode?.width ?? 0) : iconNode.width
        const th = showName && nameNode?.visible
          ? (iconNode.height + (nameNode?.height ?? 0) + 2)
          : iconNode.height
        const bx = iconNode.x - tw / 2 - pad
        const by = iconNode.y - iconNode.height / 2 - pad
        bgNode.roundRect(bx, by, tw + pad * 2, th + pad * 2, 6)
        bgNode.fill({ color: 0x0f172a, alpha: 0.65 })
      }
    }

    // Show/hide capacity bars based on zoom
    this.buildingCapacityLayer.visible = this.zoom >= 0.6
  }

  /** Check if a screen coordinate hits a building, returns the building or null */
  private getBuildingAtScreen(screenX: number, screenY: number): (Building & { occupants?: number }) | null {
    const worldX = (screenX - this.world.x) / this.zoom
    const worldY = (screenY - this.world.y) / this.zoom

    for (const b of this.currentBuildings) {
      const [bx, by] = b.position
      const profile = getBuildingVisualProfile(b)
      const baseWidth = TILE_SIZE * 2
      const baseHeight = TILE_SIZE * 3
      const w = baseWidth * profile.widthScale
      const h = baseHeight * profile.heightScale
      const x = bx * TILE_SIZE - (w - baseWidth) / 2
      const y = by * TILE_SIZE - (h - baseHeight)
      if (worldX >= x && worldX <= x + w && worldY >= y && worldY <= y + h) {
        return b
      }
    }
    return null
  }

  /** Update building hover tooltip position and visibility */
  private updateBuildingHover(): void {
    if (!this.hoveredBuildingId) {
      this.buildingHoverAlpha = Math.max(0, this.buildingHoverAlpha - 0.1)
      if (this.buildingHoverAlpha <= 0) {
        this.buildingHoverTooltip.visible = false
      } else {
        this.buildingHoverTooltip.alpha = this.buildingHoverAlpha
      }
      // Reset label scale for previously hovered buildings
      for (const child of this.buildingLabelLayer.children) {
        if (child instanceof Container) {
          child.scale.set(1)
        }
      }
      return
    }

    this.buildingHoverAlpha = Math.min(1, this.buildingHoverAlpha + 0.15)
    this.buildingHoverTooltip.visible = true
    this.buildingHoverTooltip.alpha = this.buildingHoverAlpha

    // Enlarge hovered building's label
    for (const child of this.buildingLabelLayer.children) {
      if (child instanceof Container) {
        child.scale.set(child.label === this.hoveredBuildingId ? 1.25 : 1)
      }
    }
  }

  syncResidents(residents: ResidentPosition[]): void {
    this.currentResidentPositions = residents
    const activeIds = new Set(residents.map((resident) => resident.id))
    const activePetIds = new Set<string>()

    for (const resident of residents) {
      const sprite = this.residents.get(resident.id)

      if (sprite) {
        sprite.setSimulationSpeed(this.simulationMeta.speed)
        sprite.setExternalHighlight(this.highlightedResidentIds.has(resident.id))
        sprite.applyResident(resident)
        sprite.alpha = resident.currentBuildingId ? 0.18 : 1
      } else {
        const newSprite = this.residentSpritePool.acquire()
        newSprite.reuse(resident, {
          onFocusRequest: this.followResident,
          onSelectRequest: this.selectResident,
          onHoverStart: this.showTooltip,
          onHoverEnd: this.hideTooltip,
        })
        newSprite.setSimulationSpeed(this.simulationMeta.speed)
        newSprite.setExternalHighlight(this.highlightedResidentIds.has(resident.id))
        newSprite.alpha = resident.currentBuildingId ? 0.18 : 1

        this.residentLayer.addChild(newSprite)
        this.residents.set(resident.id, newSprite)
      }

      for (const pet of resident.pets ?? []) {
        const petId = pet.id
        const icon = pet.species === 'dog' ? '🐕' : pet.species === 'cat' ? '🐈' : pet.species === 'bird' ? '🐦' : '🐇'
        let petSprite = this.petSprites.get(petId)
        if (!petSprite) {
          petSprite = new Text({
            text: icon,
            style: { fontFamily: 'Apple Color Emoji, Segoe UI Emoji, sans-serif', fontSize: 14 },
            anchor: { x: 0.5, y: 1 },
          })
          this.petLayer.addChild(petSprite)
          this.petSprites.set(petId, petSprite)
        }
        petSprite.text = icon
        petSprite.position.set((resident.targetX + 0.75) * TILE_SIZE, (resident.targetY + 0.95) * TILE_SIZE)
        petSprite.alpha = resident.currentBuildingId ? 0.18 : 1
        activePetIds.add(petId)
      }
    }

    for (const [residentId, sprite] of this.residents.entries()) {
      if (activeIds.has(residentId)) {
        continue
      }

      this.residentLayer.removeChild(sprite)
      sprite.prepareForPool()
      this.residentSpritePool.release(sprite)
      this.residents.delete(residentId)
    }

    for (const [petId, petSprite] of this.petSprites.entries()) {
      if (activePetIds.has(petId)) {
        continue
      }
      this.petLayer.removeChild(petSprite)
      petSprite.destroy()
      this.petSprites.delete(petId)
    }

    if (this.followedResidentId && !activeIds.has(this.followedResidentId)) {
      this.clearFollowMode()
    }
  }

  updateSimulationMeta(meta: SimulationMeta): void {
    const previousMeta = this.simulationMeta
    this.simulationMeta = meta
    for (const sprite of this.residents.values()) {
      sprite.setSimulationSpeed(meta.speed)
    }
    if (previousMeta.season !== meta.season) {
      this.drawTiles()
    }
    this.updateDayNightOverlay()
    this.renderHud()
  }

  setActiveFestival(festival: Festival | null): void {
    this.activeFestival = festival
    this.drawFestivalMarker()
  }

  setActiveDisasters(disasters: Disaster[]): void {
    this.activeDisasters = [...disasters]
    this.drawDisasterOverlay()
  }

  updateWeather(weather: string): void {
    if (weather === this.currentWeather) return
    this.currentWeather = weather

    // Tear down existing effect
    if (this.currentWeatherEffect) {
      this.weatherContainer.removeChild(this.currentWeatherEffect.container)
      this.currentWeatherEffect.destroy()
      this.currentWeatherEffect = null
    }

    // Spawn new effect
    let effect: WeatherEffect | null = null
    if (weather === 'rainy') {
      effect = new RainEffect()
    } else if (weather === 'snowy') {
      effect = new SnowEffect()
    } else if (weather === 'stormy') {
      effect = new StormEffect()
    } else if (weather === 'cloudy') {
      effect = new CloudEffect()
    }

    if (effect) {
      this.weatherContainer.addChild(effect.container)
      this.currentWeatherEffect = effect
    }

    // Apply color tint filter for the weather
    const weatherFilter = createWeatherFilter(weather)
    this.world.filters = weatherFilter ? [weatherFilter] : []
    this.drawAmbientAccent()
  }

  tickWeatherEffect(deltaMs: number): void {
    this.currentWeatherEffect?.update(deltaMs)
  }

  setPlaceholderBuildings(placeholders: PlaceholderBuilding[]): void {
    this.placeholderBuildings = placeholders
    this.drawPlaceholderBuildings()
  }

  /** Draw translucent circles showing active event influence radii.
   *
   * @param events  Array of active events with x/y tile origin and radius.
   *                Pass an empty array to clear all circles.
   *                radius=-1 means whole-map (no circle drawn).
   */
  showEventRadii(events: Array<{ x: number; y: number; radius: number; color?: number }>): void {
    this.eventRadiusGraphics.clear()
    for (const ev of events) {
      if (ev.radius <= 0) continue
      const cx = (ev.x + 0.5) * TILE_SIZE
      const cy = (ev.y + 0.5) * TILE_SIZE
      const r = ev.radius * TILE_SIZE
      const col = ev.color ?? 0xfbbf24
      this.eventRadiusGraphics.circle(cx, cy, r)
      this.eventRadiusGraphics.fill({ color: col, alpha: 0.12 })
      this.eventRadiusGraphics.circle(cx, cy, r)
      this.eventRadiusGraphics.stroke({ color: col, width: 2, alpha: 0.35 })
    }
  }

  // ── Heatmap API ──────────────────────────────────────────────

  setHeatmapEnabled(enabled: boolean): void {
    this.heatmapEnabled = enabled
    if (!enabled) {
      this.heatmapGraphics.clear()
    } else {
      this.renderHeatmap()
    }
  }

  setHeatmapFilter(residentId: string | null): void {
    this.heatmapFilterResidentId = residentId
    if (this.heatmapEnabled) this.renderHeatmap()
  }

  recordHeatmapTick(residents: ResidentPosition[]): void {
    const snapshot = residents.map((r) => ({ id: r.id, x: r.targetX, y: r.targetY }))
    this.heatmapHistory.push(snapshot)
    if (this.heatmapHistory.length > this.MAX_HEATMAP_TICKS) {
      this.heatmapHistory.shift()
    }
    if (this.heatmapEnabled) this.renderHeatmap()
  }

  private renderHeatmap(): void {
    this.heatmapGraphics.clear()
    if (!this.heatmapEnabled || this.heatmapHistory.length === 0) return

    const grid = new Float32Array(MAP_WIDTH * MAP_HEIGHT)
    let maxDensity = 0

    for (const snap of this.heatmapHistory) {
      for (const pos of snap) {
        if (this.heatmapFilterResidentId && pos.id !== this.heatmapFilterResidentId) continue
        const gx = clampTileCoordinate(pos.x, MAP_WIDTH - 1)
        const gy = clampTileCoordinate(pos.y, MAP_HEIGHT - 1)
        const idx = gy * MAP_WIDTH + gx
        grid[idx] += 1
        if (grid[idx] > maxDensity) maxDensity = grid[idx]
      }
    }

    if (maxDensity === 0) return

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const density = grid[y * MAP_WIDTH + x]
        if (density === 0) continue
        const intensity = density / maxDensity
        const r = intensity > 0.5 ? 1 : intensity * 2
        const g = intensity < 0.5 ? intensity * 2 : 2 - intensity * 2
        const b = intensity < 0.3 ? 1 - intensity * 3 : 0
        const color = (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255)
        const alpha = 0.08 + intensity * 0.35
        this.heatmapGraphics
          .rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
          .fill({ color, alpha })
      }
    }
  }

  triggerMilestone(fromId: string, toId: string, eventType: string): void {
    const fromSprite = this.residents.get(fromId)
    const toSprite = this.residents.get(toId)
    if (!fromSprite || !toSprite) return

    const effect = new MilestoneEffect(fromSprite.x, fromSprite.y, toSprite.x, toSprite.y, eventType)
    this.effectLayer.addChild(effect.container)
    this.milestoneEffects.push(effect)
  }

  getFollowedResidentId(): string | null {
    return this.followedResidentId
  }

  setFollowTarget(residentId: string | null): void {
    this.followedResidentId = residentId

    if (residentId) {
      this.hasUserCameraOverride = true
      this.centerOnResident(residentId, true)
    }

    this.renderHud()
  }

  setHighlightedResidents(residentIds: string[] | null): void {
    this.highlightedResidentIds = new Set(residentIds ?? [])

    for (const [residentId, sprite] of this.residents.entries()) {
      sprite.setExternalHighlight(this.highlightedResidentIds.has(residentId))
    }
  }

  redrawTiles(): void {
    this.tileVisualSignature = ''
    this.drawTiles()
    this.drawZones()
  }

  destroy(): void {
    this.app.ticker.remove(this.animate)

    const canvas = this.app.canvas

    canvas.removeEventListener('wheel', this.onWheel)
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    canvas.removeEventListener('mousemove', this.onCanvasMouseMove)
    canvas.removeEventListener('mouseleave', this.onCanvasMouseLeave)
    canvas.removeEventListener('touchstart', this.onTouchStart)
    canvas.removeEventListener('touchmove', this.onTouchMove)
    canvas.removeEventListener('touchend', this.onTouchEnd)
    canvas.removeEventListener('touchcancel', this.onTouchEnd)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerUp)
    this.tileLayer.off('pointertap', this.handleBackgroundTap)

    for (const effect of this.milestoneEffects) {
      this.effectLayer.removeChild(effect.container)
      effect.destroy()
    }
    this.milestoneEffects = []

    for (const sprite of this.residents.values()) {
      sprite.destroy({ children: true })
    }
    for (const sprite of this.petSprites.values()) {
      sprite.destroy()
    }

    this.residents.clear()
    this.petSprites.clear()
    this.residentSpritePool.drain((sprite) => {
      sprite.destroy({ children: true })
    })
  }

  private readonly animate = (): void => {
    const deltaMs = this.app.ticker.deltaMS

    for (const sprite of this.residents.values()) {
      sprite.update(deltaMs)
    }

    // Animate weather particles
    this.tickWeatherEffect(deltaMs)
    this.tickDisasterOverlay(deltaMs)
    this.tickFestivalMarker(deltaMs)

    // Animate water ripple overlay
    this.waterTime += deltaMs * 0.001
    this.updateWaterRipple()

    // Animate milestone effects
    for (let i = this.milestoneEffects.length - 1; i >= 0; i--) {
      const effect = this.milestoneEffects[i]
      effect.update(deltaMs)
      if (effect.done) {
        this.effectLayer.removeChild(effect.container)
        effect.destroy()
        this.milestoneEffects.splice(i, 1)
      }
    }

    // Tooltip fade in/out
    this.updateTooltip()

    // Building hover tooltip fade
    this.updateBuildingHover()

    // Relationship line pulse
    this.relationLinePulse += deltaMs * 0.003

    // Path visualization pulse + update
    this.pathPulse += deltaMs * 0.004
    this.updatePathVisualization()

    if (this.followedResidentId) {
      this.centerOnResident(this.followedResidentId)
    }
  }

  private tickFestivalMarker(deltaMs: number): void {
    if (!this.activeFestival || !this.festivalMarker.visible) {
      return
    }

    this.festivalPulseTime += deltaMs * 0.004
    const scale = 1 + Math.sin(this.festivalPulseTime) * 0.08
    this.festivalPulse.scale.set(scale, scale)
    this.festivalPulse.alpha = 0.24 + (Math.sin(this.festivalPulseTime) + 1) * 0.14
  }

  private tickDisasterOverlay(deltaMs: number): void {
    if (this.activeDisasters.length === 0) {
      this.disasterOverlay.alpha = 1
      return
    }
    this.disasterPulseTime += deltaMs * 0.004
    this.disasterOverlay.alpha = 0.6 + (Math.sin(this.disasterPulseTime) + 1) * 0.18
  }

  private drawFestivalMarker(): void {
    this.festivalPulse.clear()
    this.festivalCore.clear()

    if (!this.activeFestival) {
      this.festivalMarker.visible = false
      this.festivalLabel.text = ''
      return
    }

    const hostBuilding = this.currentBuildings.find((building) => building.id === this.activeFestival?.location)
    if (!hostBuilding) {
      this.festivalMarker.visible = false
      return
    }

    const x = hostBuilding.position[0] * TILE_SIZE + TILE_SIZE
    const y = hostBuilding.position[1] * TILE_SIZE - 4
    this.festivalMarker.position.set(x, y)
    this.festivalMarker.visible = true
    this.festivalLabel.text = this.activeFestival.name
    this.festivalPulse.circle(0, 0, 20)
    this.festivalPulse.fill({ color: 0xf59e0b, alpha: 0.3 })
    this.festivalCore.circle(0, 0, 10)
    this.festivalCore.fill({ color: 0xf97316, alpha: 0.95 })
    this.festivalCore.circle(0, 0, 4)
    this.festivalCore.fill({ color: 0xfffbeb, alpha: 0.95 })
  }

  private drawDisasterOverlay(): void {
    this.disasterOverlay.clear()
    if (this.activeDisasters.length === 0) {
      return
    }

    const affectedIds = new Set(
      this.activeDisasters.flatMap((disaster) => disaster.affected_buildings ?? []),
    )
    for (const building of this.currentBuildings) {
      if (!affectedIds.has(building.id)) {
        continue
      }
      const x = building.position[0] * TILE_SIZE
      const y = building.position[1] * TILE_SIZE
      const width = TILE_SIZE * 2
      const height = TILE_SIZE * 3
      this.disasterOverlay.roundRect(x - 2, y - 2, width + 4, height + 4, 10)
      this.disasterOverlay.fill({ color: 0xef4444, alpha: 0.14 })
      this.disasterOverlay.roundRect(x - 2, y - 2, width + 4, height + 4, 10)
      this.disasterOverlay.stroke({ color: 0xf87171, width: 3, alpha: 0.9 })
    }
  }

  private bindCameraControls(): void {
    const canvas = this.app.canvas

    canvas.style.cursor = 'grab'
    canvas.style.touchAction = 'none'
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('mousemove', this.onCanvasMouseMove)
    canvas.addEventListener('mouseleave', this.onCanvasMouseLeave)
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false })
    canvas.addEventListener('touchend', this.onTouchEnd, { passive: false })
    canvas.addEventListener('touchcancel', this.onTouchEnd, { passive: false })
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
  }

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.viewportWidth || !this.viewportHeight) {
      return
    }

    event.preventDefault()
    this.hasUserCameraOverride = true
    this.clearFollowMode()

    const rect = this.app.canvas.getBoundingClientRect()
    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top
    const scaleFactor = event.deltaY < 0 ? 1.12 : 0.9
    const nextZoom = this.clamp(this.zoom * scaleFactor, this.minZoom, this.maxZoom)

    this.zoomToPoint(pointerX, pointerY, nextZoom)
    this.emitViewportChange()
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return
    }

    if (this.pinchActive) {
      return
    }

    this.stopInertia()
    this.dragging = true
    this.dragPointerId = event.pointerId
    this.dragStartX = event.clientX
    this.dragStartY = event.clientY
    this.dragLastX = event.clientX
    this.dragLastY = event.clientY
    this.dragLastTime = performance.now()
    this.inertiaVx = 0
    this.inertiaVy = 0
    this.worldStartX = this.world.x
    this.worldStartY = this.world.y
    this.hasUserCameraOverride = true
    this.app.canvas.style.cursor = 'grabbing'
    this.app.canvas.setPointerCapture(event.pointerId)
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.pinchActive) {
      return
    }

    if (!this.dragging || this.dragPointerId !== event.pointerId) {
      return
    }

    this.clearFollowMode()
    const deltaX = event.clientX - this.dragStartX
    const deltaY = event.clientY - this.dragStartY

    // Track velocity for inertia
    const now = performance.now()
    const dt = now - this.dragLastTime
    if (dt > 0) {
      const alpha = 0.4
      this.inertiaVx = alpha * ((event.clientX - this.dragLastX) / dt) + (1 - alpha) * this.inertiaVx
      this.inertiaVy = alpha * ((event.clientY - this.dragLastY) / dt) + (1 - alpha) * this.inertiaVy
    }
    this.dragLastX = event.clientX
    this.dragLastY = event.clientY
    this.dragLastTime = now

    this.world.position.set(this.worldStartX + deltaX, this.worldStartY + deltaY)
    this.clampPan()
    this.emitViewportChange()
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.dragging || this.dragPointerId !== event.pointerId) {
      return
    }

    this.cancelDrag(event.pointerId)
  }

  private readonly onCanvasMouseMove = (event: MouseEvent): void => {
    if (this.dragging) return

    const rect = this.app.canvas.getBoundingClientRect()
    const sx = event.clientX - rect.left
    const sy = event.clientY - rect.top
    const building = this.getBuildingAtScreen(sx, sy)

    if (building) {
      if (this.hoveredBuildingId !== building.id) {
        this.hoveredBuildingId = building.id
        const icon = TownRenderer.BUILDING_TYPE_ICON[building.type] ?? ''
        const cap = building.type === 'park' ? 0 : building.capacity
        const occ = building.occupants ?? 0
        this.buildingHoverTitle.text = `${icon} ${building.name}`
        this.buildingHoverType.text = `Type: ${building.type}`
        this.buildingHoverOccupancy.text = cap > 0 ? `Occupancy: ${occ}/${cap}` : `Visitors: ${occ}`

        // Size background
        const w = Math.max(this.buildingHoverTitle.width, this.buildingHoverType.width, this.buildingHoverOccupancy.width) + 20
        const h = 56
        this.buildingHoverBg.clear()
        this.buildingHoverBg.roundRect(0, 0, w, h, 8)
        this.buildingHoverBg.fill({ color: 0x0f172a, alpha: 0.88 })
        this.buildingHoverBg.stroke({ color: 0x334155, width: 1, alpha: 0.6 })
      }

      // Position tooltip near cursor (screen space, in uiLayer)
      this.buildingHoverTooltip.position.set(
        Math.min(sx + 16, this.viewportWidth - 160),
        Math.max(sy - 64, 8),
      )
      this.app.canvas.style.cursor = 'pointer'
    } else {
      if (this.hoveredBuildingId) {
        this.hoveredBuildingId = null
        this.app.canvas.style.cursor = this.dragging ? 'grabbing' : 'grab'
      }
    }
  }

  private readonly onCanvasMouseLeave = (): void => {
    this.hoveredBuildingId = null
    this.app.canvas.style.cursor = 'grab'
  }

  private readonly onTouchStart = (event: TouchEvent): void => {
    if (event.touches.length < 2) {
      return
    }

    event.preventDefault()
    this.cancelDrag()
    this.clearFollowMode()
    this.hasUserCameraOverride = true
    this.pinchActive = true
    this.pinchStartDistance = this.touchDistance(event.touches[0], event.touches[1])
    this.pinchStartZoom = this.zoom
  }

  private readonly onTouchMove = (event: TouchEvent): void => {
    if (!this.pinchActive || event.touches.length < 2) {
      return
    }

    event.preventDefault()

    const distance = this.touchDistance(event.touches[0], event.touches[1])
    if (distance <= 0 || this.pinchStartDistance <= 0) {
      return
    }

    const targetZoom = this.clamp(
      this.pinchStartZoom * (distance / this.pinchStartDistance),
      this.minZoom,
      this.maxZoom,
    )
    // Smooth interpolation for fluid pinch feel
    const nextZoom = this.zoom + (targetZoom - this.zoom) * 0.6
    const rect = this.app.canvas.getBoundingClientRect()
    const midpointX = (event.touches[0].clientX + event.touches[1].clientX) / 2 - rect.left
    const midpointY = (event.touches[0].clientY + event.touches[1].clientY) / 2 - rect.top

    this.zoomToPoint(midpointX, midpointY, nextZoom)
  }

  private readonly onTouchEnd = (event: TouchEvent): void => {
    if (!this.pinchActive) {
      return
    }

    if (event.touches.length >= 2) {
      this.pinchStartDistance = this.touchDistance(event.touches[0], event.touches[1])
      this.pinchStartZoom = this.zoom
      return
    }

    this.pinchActive = false
  }

  private readonly handleBackgroundTap = (): void => {
    this.clearFollowMode()
  }

  screenToTile(screenX: number, screenY: number): { tileX: number; tileY: number; tileKind: TileKind } | null {
    const worldX = (screenX - this.world.x) / this.zoom
    const worldY = (screenY - this.world.y) / this.zoom

    if (worldX < 0 || worldY < 0 || worldX > WORLD_WIDTH || worldY > WORLD_HEIGHT) {
      return null
    }

    const tileX = clampTileCoordinate(Math.floor(worldX / TILE_SIZE), MAP_WIDTH - 1)
    const tileY = clampTileCoordinate(Math.floor(worldY / TILE_SIZE), MAP_HEIGHT - 1)

    return {
      tileX,
      tileY,
      tileKind: getTileKind(tileX, tileY),
    }
  }

  private readonly selectResident = (residentId: string): void => {
    useSimulationStore.getState().selectResident(residentId)
    this.renderHud()
  }

  private readonly followResident = (residentId: string): void => {
    this.followedResidentId = residentId
    this.hasUserCameraOverride = true
    this.selectResident(residentId)
    this.centerOnResident(residentId, true)
    this.renderHud()
  }

  private clearFollowMode(): void {
    if (!this.followedResidentId && useSimulationStore.getState().selectedResidentId === null) {
      return
    }

    this.followedResidentId = null
    useSimulationStore.getState().selectResident(null)
    this.renderHud()
  }

  private cancelDrag(pointerId?: number): void {
    if (pointerId !== undefined && this.app.canvas.hasPointerCapture(pointerId)) {
      this.app.canvas.releasePointerCapture(pointerId)
    } else if (
      this.dragPointerId !== null &&
      this.app.canvas.hasPointerCapture(this.dragPointerId)
    ) {
      this.app.canvas.releasePointerCapture(this.dragPointerId)
    }

    // Start inertia if velocity is significant
    const speed = Math.hypot(this.inertiaVx, this.inertiaVy)
    if (speed > 0.15) {
      this.startInertia()
    }

    this.dragging = false
    this.dragPointerId = null
    this.app.canvas.style.cursor = 'grab'
  }

  private startInertia(): void {
    this.stopInertia()
    const friction = 0.94
    const minSpeed = 0.08
    const step = () => {
      this.inertiaVx *= friction
      this.inertiaVy *= friction
      if (Math.hypot(this.inertiaVx, this.inertiaVy) < minSpeed) {
        this.inertiaRaf = null
        return
      }
      this.world.x += this.inertiaVx * 16
      this.world.y += this.inertiaVy * 16
      this.clampPan()
      this.emitViewportChange()
      this.inertiaRaf = requestAnimationFrame(step)
    }
    this.inertiaRaf = requestAnimationFrame(step)
  }

  private stopInertia(): void {
    if (this.inertiaRaf !== null) {
      cancelAnimationFrame(this.inertiaRaf)
      this.inertiaRaf = null
    }
    this.inertiaVx = 0
    this.inertiaVy = 0
  }

  private centerOnResident(residentId: string, immediate = false): void {
    const sprite = this.residents.get(residentId)

    if (!sprite || !this.viewportWidth || !this.viewportHeight) {
      return
    }

    const desiredX = this.viewportWidth / 2 - sprite.x * this.zoom
    const desiredY = this.viewportHeight / 2 - sprite.y * this.zoom

    if (immediate) {
      this.world.position.set(desiredX, desiredY)
    } else {
      this.world.x += (desiredX - this.world.x) * 0.14
      this.world.y += (desiredY - this.world.y) * 0.14
    }

    this.clampPan()
    this.emitViewportChange()
  }

  private zoomToPoint(pointerX: number, pointerY: number, nextZoom: number): void {
    if (nextZoom === this.zoom) {
      return
    }

    const worldX = (pointerX - this.world.x) / this.zoom
    const worldY = (pointerY - this.world.y) / this.zoom

    this.zoom = nextZoom
    this.world.scale.set(nextZoom)
    this.world.position.set(pointerX - worldX * nextZoom, pointerY - worldY * nextZoom)
    this.clampPan()
    this.updateBuildingLabelsForZoom()
    this.emitViewportChange()
    this.renderHud()
  }

  private touchDistance(a: Touch, b: Touch): number {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  }

  private drawTiles(): void {
    const nextSignature = JSON.stringify({
      season: this.simulationMeta.season ?? 'spring',
      weather: this.currentWeather,
    })
    if (this.tileVisualSignature === nextSignature) {
      return
    }
    this.tileVisualSignature = nextSignature
    this.tileGraphics.clear()

    for (let y = 0; y < MAP_HEIGHT; y += 1) {
      for (let x = 0; x < MAP_WIDTH; x += 1) {
        const tileKind = this.getTileKind(x, y)
        const { fillColor, strokeColor } = this.getTilePalette(tileKind, x, y)
        const tileX = x * TILE_SIZE
        const tileY = y * TILE_SIZE

        this.tileGraphics.rect(tileX, tileY, TILE_SIZE, TILE_SIZE)
        this.tileGraphics.fill({ color: fillColor })
        this.tileGraphics.stroke({ color: strokeColor, width: 0.5, alpha: 0.15 })

        // Grass decorations — small dots for visual depth
        if (tileKind === 'grass') {
          const deco = getGrassDecoration(x, y)
          for (const dot of deco.dots) {
            const dx = tileX + dot.rx * TILE_SIZE
            const dy = tileY + dot.ry * TILE_SIZE
            this.tileGraphics.circle(dx, dy, dot.size)
            this.tileGraphics.fill({
              color: dot.darken ? 0x1a5c28 : 0x6dd87a,
              alpha: dot.darken ? 0.25 : 0.2,
            })
          }
        }

        // Road edge transitions — soften border where road meets grass
        if (tileKind === 'road') {
          const neighbors: Array<[number, number, 'top' | 'bottom' | 'left' | 'right']> = [
            [x, y - 1, 'top'], [x, y + 1, 'bottom'], [x - 1, y, 'left'], [x + 1, y, 'right'],
          ]
          for (const [nx, ny, side] of neighbors) {
            if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT && this.getTileKind(nx, ny) === 'grass') {
              const { fillColor: grassColor } = this.getTilePalette('grass', nx, ny)
              const ex = side === 'left' ? tileX : side === 'right' ? tileX + TILE_SIZE - 3 : tileX
              const ey = side === 'top' ? tileY : side === 'bottom' ? tileY + TILE_SIZE - 3 : tileY
              const ew = side === 'left' || side === 'right' ? 3 : TILE_SIZE
              const eh = side === 'top' || side === 'bottom' ? 3 : TILE_SIZE
              this.tileGraphics.rect(ex, ey, ew, eh)
              this.tileGraphics.fill({ color: grassColor, alpha: 0.3 })
            }
          }
        }
      }
    }
  }

  private drawZones(): void {
    const nextSignature = `${this.zoneSignature}::${this.selectedZoneId ?? ''}`
    if (nextSignature === this.zoneGraphics.label) {
      return
    }
    this.zoneGraphics.label = nextSignature
    this.zoneGraphics.clear()

    for (const zone of this.currentZones) {
      const x = zone.bounds.x * TILE_SIZE
      const y = zone.bounds.y * TILE_SIZE
      const width = zone.bounds.width * TILE_SIZE
      const height = zone.bounds.height * TILE_SIZE
      const color = this.getZoneColor(zone.type)
      const isSelected = this.selectedZoneId === zone.id

      this.zoneGraphics.roundRect(x, y, width, height, 16)
      this.zoneGraphics.fill({ color, alpha: isSelected ? 0.26 : 0.14 })
      this.zoneGraphics.roundRect(x, y, width, height, 16)
      this.zoneGraphics.stroke({
        color,
        width: isSelected ? 3 : 1.5,
        alpha: isSelected ? 0.72 : 0.34,
      })
    }
  }

  private getZoneColor(zoneType: string): number {
    switch (zoneType) {
      case 'commercial':
        return 0xf97316
      case 'leisure':
        return 0x22c55e
      case 'education':
        return 0x38bdf8
      case 'residential':
      default:
        return 0xa78bfa
    }
  }

  /** Animate water tiles with a slow ripple effect */
  private updateWaterRipple(): void {
    this.waterOverlay.clear()
    const t = this.waterTime

    for (let y = 0; y < MAP_HEIGHT; y += 1) {
      for (let x = 0; x < MAP_WIDTH; x += 1) {
        if (this.getTileKind(x, y) !== 'water') continue

        const tileX = x * TILE_SIZE
        const tileY = y * TILE_SIZE
        // 2-3 ripple lines per water tile
        const phase = (x * 0.7 + y * 1.3)
        const waveY1 = tileY + 10 + Math.sin(t * 1.2 + phase) * 3
        const waveY2 = tileY + 22 + Math.sin(t * 0.9 + phase + 2) * 2.5

        this.waterOverlay.moveTo(tileX + 4, waveY1)
        this.waterOverlay.lineTo(tileX + TILE_SIZE - 4, waveY1 + Math.sin(t + phase) * 1.5)
        this.waterOverlay.stroke({ color: 0xffffff, width: 0.8, alpha: 0.12 + Math.sin(t * 0.6 + phase) * 0.05 })

        this.waterOverlay.moveTo(tileX + 8, waveY2)
        this.waterOverlay.lineTo(tileX + TILE_SIZE - 8, waveY2 + Math.sin(t * 0.7 + phase) * 1)
        this.waterOverlay.stroke({ color: 0xffffff, width: 0.6, alpha: 0.08 + Math.sin(t * 0.4 + phase + 1) * 0.04 })
      }
    }
  }

  /** Draw darkening vignette at map edges for cinematic framing */
  private drawVignette(): void {
    this.vignetteGraphics.clear()
    const edgeSize = TILE_SIZE * 2
    const color = 0x020617

    // Top edge
    this.vignetteGraphics.rect(0, 0, WORLD_WIDTH, edgeSize)
    this.vignetteGraphics.fill({ color, alpha: 0.2 })
    // Bottom edge
    this.vignetteGraphics.rect(0, WORLD_HEIGHT - edgeSize, WORLD_WIDTH, edgeSize)
    this.vignetteGraphics.fill({ color, alpha: 0.2 })
    // Left edge
    this.vignetteGraphics.rect(0, 0, edgeSize, WORLD_HEIGHT)
    this.vignetteGraphics.fill({ color, alpha: 0.15 })
    // Right edge
    this.vignetteGraphics.rect(WORLD_WIDTH - edgeSize, 0, edgeSize, WORLD_HEIGHT)
    this.vignetteGraphics.fill({ color, alpha: 0.15 })
    // Corners (double overlap = darker)
    const cornerSize = TILE_SIZE * 1.5
    for (const [cx, cy] of [[0, 0], [WORLD_WIDTH - cornerSize, 0], [0, WORLD_HEIGHT - cornerSize], [WORLD_WIDTH - cornerSize, WORLD_HEIGHT - cornerSize]]) {
      this.vignetteGraphics.rect(cx, cy, cornerSize, cornerSize)
      this.vignetteGraphics.fill({ color, alpha: 0.1 })
    }
  }

  // ── Hover Tooltip ──────────────────────────────────────────────────────

  private readonly showTooltip = (info: ResidentHoverInfo): void => {
    this.tooltipVisible = true
    this.tooltipName.text = info.name
    const moodEmoji = info.mood ? (MOOD_EMOJI_MAP[info.mood] ?? '') : ''
    const occLabel = info.occupation || 'resident'
    this.tooltipDetails.text = `${moodEmoji} ${occLabel}`.trim()

    // Energy bar
    this.tooltipEnergyBar.clear()
    const barW = 60
    const barH = 4
    this.tooltipEnergyBar.roundRect(0, 0, barW, barH, 2).fill({ color: 0x1e293b })
    const eColor = info.energy > 0.5 ? 0x34d399 : info.energy > 0.2 ? 0xfbbf24 : 0xef4444
    this.tooltipEnergyBar.roundRect(0, 0, barW * Math.max(0, Math.min(1, info.energy)), barH, 2).fill({ color: eColor })

    // Background
    const tw = 80
    const th = 44
    this.tooltipBg.clear()
    this.tooltipBg.roundRect(0, 0, tw, th, 6).fill({ color: 0x0f172a, alpha: 0.88 })
    this.tooltipBg.stroke({ color: 0xffffff, alpha: 0.1, width: 1 })

    // Position relative to the world — offset above the sprite
    this.tooltipContainer.position.set(
      (info.worldX - tw / 2) * this.zoom + this.world.x,
      (info.worldY - 40) * this.zoom + this.world.y,
    )
    this.tooltipContainer.visible = true
    this.tooltipContainer.alpha = 0
  }

  private readonly hideTooltip = (): void => {
    this.tooltipVisible = false
  }

  private updateTooltip(): void {
    if (this.tooltipVisible && this.tooltipContainer.alpha < 1) {
      this.tooltipContainer.alpha = Math.min(1, this.tooltipContainer.alpha + 0.12)
    } else if (!this.tooltipVisible && this.tooltipContainer.alpha > 0) {
      this.tooltipContainer.alpha = Math.max(0, this.tooltipContainer.alpha - 0.15)
      if (this.tooltipContainer.alpha <= 0) {
        this.tooltipContainer.visible = false
      }
    }
  }

  // ── Relationship Connection Lines ─────────────────────────────────────

  private readonly RELATION_COLOR: Record<string, number> = {
    love: 0xf472b6,
    friendship: 0x60a5fa,
    trust: 0x60a5fa,
    rivalry: 0xef4444,
    dislike: 0xef4444,
    fear: 0xfbbf24,
    knows: 0x94a3b8,
  }

  drawRelationshipLines(selectedId: string | null, relationships: Array<{ from_id: string; to_id: string; type: string; intensity: number }>): void {
    this.relationLineGraphics.clear()
    if (!selectedId) return

    const fromSprite = this.residents.get(selectedId)
    if (!fromSprite) return

    const relatedEdges = relationships.filter(
      (r) => r.from_id === selectedId || r.to_id === selectedId,
    )

    const t = this.relationLinePulse

    for (const edge of relatedEdges) {
      const otherId = edge.from_id === selectedId ? edge.to_id : edge.from_id
      const toSprite = this.residents.get(otherId)
      if (!toSprite) continue

      const color = this.RELATION_COLOR[edge.type] ?? 0x94a3b8
      // Pulse alpha based on intensity
      const pulseAlpha = 0.3 + edge.intensity * 0.4 + Math.sin(t * 2.5 + edge.intensity * 3) * 0.1

      // Draw dashed line
      const dx = toSprite.x - fromSprite.x
      const dy = toSprite.y - fromSprite.y
      const dist = Math.hypot(dx, dy)
      if (dist < 1) continue

      const dashLen = 6
      const gapLen = 4
      const nx = dx / dist
      const ny = dy / dist
      let traveled = 0

      while (traveled < dist) {
        const segEnd = Math.min(traveled + dashLen, dist)
        this.relationLineGraphics.moveTo(
          fromSprite.x + nx * traveled,
          fromSprite.y + ny * traveled,
        )
        this.relationLineGraphics.lineTo(
          fromSprite.x + nx * segEnd,
          fromSprite.y + ny * segEnd,
        )
        this.relationLineGraphics.stroke({ color, width: 1.5, alpha: pulseAlpha })
        traveled = segEnd + gapLen
      }
    }
  }

  // ── Path Visualization ──────────────────────────────────────────────────

  private updatePathVisualization(): void {
    this.pathGraphics.clear()
    this.pathTargetGraphics.clear()

    const selectedId = useSimulationStore.getState().selectedResidentId
    if (!selectedId) return

    const sprite = this.residents.get(selectedId)
    if (!sprite) return

    const residentData = this.currentResidentPositions.find((r) => r.id === selectedId)
    if (!residentData) return

    const currentWorldX = sprite.x
    const currentWorldY = sprite.y
    const targetWorldX = residentData.targetX * TILE_SIZE + TILE_SIZE / 2
    const targetWorldY = residentData.targetY * TILE_SIZE + TILE_SIZE / 2

    const dx = targetWorldX - currentWorldX
    const dy = targetWorldY - currentWorldY
    const dist = Math.hypot(dx, dy)

    if (dist < TILE_SIZE * 0.5) return

    const color = residentData.color
    const nx = dx / dist
    const ny = dy / dist

    const dashLen = 5
    const gapLen = 4
    let traveled = 0
    while (traveled < dist) {
      const segEnd = Math.min(traveled + dashLen, dist)
      this.pathGraphics.moveTo(currentWorldX + nx * traveled, currentWorldY + ny * traveled)
      this.pathGraphics.lineTo(currentWorldX + nx * segEnd, currentWorldY + ny * segEnd)
      this.pathGraphics.stroke({ color, width: 1.5, alpha: 0.45 })
      traveled = segEnd + gapLen
    }

    const pulseAlpha = 0.25 + Math.sin(this.pathPulse * 2) * 0.15
    const pulseRadius = 6 + Math.sin(this.pathPulse * 2) * 2
    this.pathTargetGraphics.circle(targetWorldX, targetWorldY, pulseRadius)
    this.pathTargetGraphics.fill({ color, alpha: pulseAlpha })
    this.pathTargetGraphics.circle(targetWorldX, targetWorldY, pulseRadius)
    this.pathTargetGraphics.stroke({ color, width: 1.5, alpha: pulseAlpha + 0.15 })
  }

  private drawBuildings(): void {
    if (this.currentBuildings.length > 0) {
      this.syncBuildings(this.currentBuildings)
      return
    }

    const fallbackBuildings = [
      { label: 'Cafe', x: 9, y: 6, w: 4, h: 3, color: 0xb45309 },
      { label: 'Park', x: 24, y: 5, w: 5, h: 4, color: 0x15803d },
      { label: 'School', x: 29, y: 16, w: 4, h: 3, color: 0x7c3aed },
      { label: 'Market', x: 5, y: 19, w: 5, h: 3, color: 0xdc2626 },
    ]

    this.buildingGraphics.clear()

    for (const building of fallbackBuildings) {
      const x = building.x * TILE_SIZE
      const y = building.y * TILE_SIZE
      const width = building.w * TILE_SIZE
      const height = building.h * TILE_SIZE

      this.buildingGraphics.roundRect(x, y, width, height, 12)
      this.buildingGraphics.fill({ color: building.color, alpha: 0.82 })
      this.buildingGraphics.stroke({ color: 0xf8fafc, alpha: 0.18, width: 2 })

      const label = new Text({
        text: building.label,
        style: {
          fill: 0xf8fafc,
          fontFamily: 'Iowan Old Style, Palatino Linotype, serif',
          fontSize: 14,
          fontWeight: '700',
          stroke: { color: 0x020617, width: 3 },
        },
        anchor: { x: 0.5, y: 0.5 },
      })

      label.position.set(x + width / 2, y + height / 2)
      this.buildingLabelLayer.addChild(label)
    }

    this.drawPlaceholderBuildings()
  }

  private drawPlaceholderBuildings(): void {
    while (this.placeholderLabelLayer.children.length > 0) {
      const child = this.placeholderLabelLayer.children[0]
      this.placeholderLabelLayer.removeChild(child)
      child.destroy()
    }

    this.placeholderGraphics.clear()

    for (const placeholder of this.placeholderBuildings) {
      const x = placeholder.tileX * TILE_SIZE
      const y = placeholder.tileY * TILE_SIZE
      const width = TILE_SIZE * 1.5
      const height = TILE_SIZE * 1.5

      this.placeholderGraphics.roundRect(x + 4, y + 4, width, height, 10)
      this.placeholderGraphics.fill({ color: 0xf59e0b, alpha: 0.18 })
      this.placeholderGraphics.stroke({ color: 0xfcd34d, alpha: 0.8, width: 2 })

      const label = new Text({
        text: placeholder.label,
        style: {
          fill: 0xfef3c7,
          fontFamily: 'Avenir Next, Helvetica Neue, sans-serif',
          fontSize: 10,
          fontWeight: '700',
          stroke: { color: 0x020617, width: 3 },
        },
        anchor: { x: 0.5, y: 0.5 },
      })
      label.position.set(x + width / 2 + 4, y + height + 14)
      this.placeholderLabelLayer.addChild(label)
    }
  }

  private drawAmbientAccent(): void {
    this.ambientAccent.clear()
    this.sunnyGlow.clear()

    this.ambientAccent.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.ambientAccent.stroke({ color: 0xe2e8f0, alpha: 0.08, width: 4 })
    this.ambientAccent.circle(23 * TILE_SIZE, 10 * TILE_SIZE, 90)
    this.ambientAccent.fill({ color: 0x38bdf8, alpha: this.simulationMeta.season === 'winter' ? 0.04 : 0.05 })

    if (this.currentWeather === 'sunny') {
      this.sunnyGlow.circle(7 * TILE_SIZE, 5 * TILE_SIZE, 140)
      this.sunnyGlow.fill({ color: 0xfbbf24, alpha: 0.08 })
      this.sunnyGlow.circle(7 * TILE_SIZE, 5 * TILE_SIZE, 90)
      this.sunnyGlow.fill({ color: 0xfef08a, alpha: 0.1 })
    }
  }

  private updateDayNightOverlay(): void {
    const lighting = getDayLightingFromTime(this.simulationMeta.time)

    this.dayNightOverlay.clear()
    this.tileLayer.alpha = lighting.brightness
    this.buildingLayer.alpha = Math.max(0.72, lighting.brightness)
    this.residentLayer.alpha = Math.max(0.82, lighting.brightness)
    this.ambientAccent.alpha = lighting.accentAlpha
    this.sunnyGlow.alpha = lighting.accentAlpha

    if (!lighting.overlayColor || lighting.overlayAlpha <= 0) {
      return
    }

    this.dayNightOverlay.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.dayNightOverlay.fill({ color: lighting.overlayColor, alpha: lighting.overlayAlpha })
  }

  private getTileKind(x: number, y: number): TileKind {
    return getTileKind(x, y)
  }

  private getTilePalette(kind: TileKind, x: number, y: number): {
    fillColor: number
    strokeColor: number
  } {
    return getSeasonTilePalette(kind, x, y, this.simulationMeta.season)
  }

  private renderHud(): void {
    const statusLabel = this.simulationMeta.running ? `${this.simulationMeta.speed}x` : 'Paused'
    const followLabel = this.followedResidentId ? `Follow ${this.followedResidentId}` : 'Free Camera'
    const _SEASON_ICONS: Record<string, string> = {
      spring: '🌸',
      summer: '☀️',
      autumn: '🍂',
      winter: '❄️',
    }
    const seasonIcon = _SEASON_ICONS[this.simulationMeta.season ?? 'spring'] ?? '🌸'
    const seasonLabel = `${seasonIcon} ${(this.simulationMeta.season ?? 'spring').charAt(0).toUpperCase() + (this.simulationMeta.season ?? 'spring').slice(1)}`

    this.hudLabel.text = [
      `Town Grid ${MAP_WIDTH}x${MAP_HEIGHT}`,
      `Tick ${this.simulationMeta.tick}`,
      this.simulationMeta.time,
      statusLabel,
      seasonLabel,
      followLabel,
      `Zoom ${this.zoom.toFixed(2)}x`,
    ].join('  •  ')
  }

  private getFitZoom(width: number, height: number): number {
    const scaleX = (width - CAMERA_PADDING * 2) / WORLD_WIDTH
    const scaleY = (height - CAMERA_PADDING * 2) / WORLD_HEIGHT
    return this.clamp(Math.min(scaleX, scaleY, 1), this.minZoom, 1)
  }

  private centerWorld(): void {
    const scaledWidth = WORLD_WIDTH * this.zoom
    const scaledHeight = WORLD_HEIGHT * this.zoom

    this.world.position.set(
      (this.viewportWidth - scaledWidth) / 2,
      (this.viewportHeight - scaledHeight) / 2,
    )
    this.emitViewportChange()
  }

  private clampPan(): void {
    const scaledWidth = WORLD_WIDTH * this.zoom
    const scaledHeight = WORLD_HEIGHT * this.zoom

    if (scaledWidth <= this.viewportWidth) {
      this.world.x = (this.viewportWidth - scaledWidth) / 2
    } else {
      const minX = this.viewportWidth - scaledWidth - CAMERA_PADDING
      const maxX = CAMERA_PADDING
      this.world.x = this.clamp(this.world.x, minX, maxX)
    }

    if (scaledHeight <= this.viewportHeight) {
      this.world.y = (this.viewportHeight - scaledHeight) / 2
    } else {
      const minY = this.viewportHeight - scaledHeight - CAMERA_PADDING
      const maxY = CAMERA_PADDING
      this.world.y = this.clamp(this.world.y, minY, maxY)
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(value, max))
  }

  private emitViewportChange(): void {
    if (!this.onViewportChange || !this.viewportWidth || !this.viewportHeight) {
      return
    }
    this.onViewportChange({
      centerX: Number((((this.viewportWidth / 2) - this.world.x) / this.zoom / TILE_SIZE).toFixed(2)),
      centerY: Number((((this.viewportHeight / 2) - this.world.y) / this.zoom / TILE_SIZE).toFixed(2)),
      zoom: Number(this.zoom.toFixed(3)),
    })
  }
}
