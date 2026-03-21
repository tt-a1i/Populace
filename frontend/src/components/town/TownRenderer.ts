import { Application, Container, Graphics, Rectangle, Text } from 'pixi.js'

import { useSimulationStore, type ResidentPosition, type SimulationSpeed } from '../../stores/simulation'
import type { Building } from '../../types'
import { ResidentSprite } from './ResidentSprite'
import { ResidentSpritePool } from './ResidentSpritePool'
import { MilestoneEffect } from './effects/MilestoneEffect'
import { RainEffect } from './effects/RainEffect'
import { SnowEffect } from './effects/SnowEffect'
import { StormEffect } from './effects/StormEffect'
import { createWeatherFilter } from './effects/WeatherFilter'
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

type WeatherEffect = RainEffect | SnowEffect | StormEffect

const CAMERA_PADDING = 56
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

interface OverlayStyle {
  alpha: number
  color: number | null
}

function dayOverlayForTick(tick: number, tickPerDay: number): OverlayStyle {
  const safeTickPerDay = Math.max(1, tickPerDay)
  const tickInDay = ((tick % safeTickPerDay) + safeTickPerDay) % safeTickPerDay
  const hour = (tickInDay / safeTickPerDay) * 24

  if (hour >= 6 && hour < 9) {
    return { color: 0xffa500, alpha: 0.1 }
  }

  if (hour >= 9 && hour < 17) {
    return { color: null, alpha: 0 }
  }

  if (hour >= 17 && hour < 20) {
    return { color: 0xff6b35, alpha: 0.15 }
  }

  return { color: 0x1a1a4e, alpha: 0.3 }
}

export class TownRenderer {
  private readonly app: Application
  private readonly world = new Container()
  private readonly tileLayer = new Container()
  private readonly buildingLayer = new Container()
  private readonly residentLayer = new Container()
  private readonly effectLayer = new Container()
  private readonly uiLayer = new Container()
  private readonly residents = new Map<string, ResidentSprite>()
  private readonly residentSpritePool = new ResidentSpritePool<ResidentSprite>(
    () =>
      new ResidentSprite(POOLED_RESIDENT_PLACEHOLDER, {
        onFocusRequest: this.followResident,
        onSelectRequest: this.selectResident,
      }),
  )
  private readonly tileGraphics = new Graphics()
  private readonly buildingGraphics = new Graphics()
  private readonly buildingLabelLayer = new Container()
  private readonly placeholderGraphics = new Graphics()
  private readonly placeholderLabelLayer = new Container()
  private readonly ambientAccent = new Graphics()
  private readonly dayNightOverlay = new Graphics()
  private readonly weatherContainer = new Container()
  private currentWeatherEffect: WeatherEffect | null = null
  private currentWeather = 'sunny'
  private milestoneEffects: MilestoneEffect[] = []
  private readonly eventRadiusGraphics = new Graphics()
  private readonly hudLabel: Text
  private readonly hintLabel: Text
  private highlightedResidentIds = new Set<string>()
  private currentBuildings: Array<Building & { occupants?: number }> = []
  private placeholderBuildings: PlaceholderBuilding[] = []

  private dragging = false
  private dragPointerId: number | null = null
  private dragStartX = 0
  private dragStartY = 0
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

  constructor(app: Application) {
    this.app = app

    this.app.stage.sortableChildren = true
    this.app.stage.addChild(this.world, this.uiLayer)
    this.world.sortableChildren = true
    this.world.hitArea = new Rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.world.addChild(this.tileLayer, this.buildingLayer, this.residentLayer, this.effectLayer)

    this.tileLayer.zIndex = 0
    this.buildingLayer.zIndex = 1
    this.residentLayer.zIndex = 2
    this.effectLayer.zIndex = 3
    this.uiLayer.zIndex = 4
    this.residentLayer.sortableChildren = true

    this.tileLayer.addChild(this.tileGraphics)
    this.buildingLayer.addChild(
      this.buildingGraphics,
      this.placeholderGraphics,
      this.buildingLabelLayer,
      this.placeholderLabelLayer,
    )
    this.effectLayer.addChild(
      this.ambientAccent, this.dayNightOverlay,
      this.eventRadiusGraphics, this.weatherContainer,
    )

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

    this.hintLabel = new Text({
      text: 'Wheel to zoom  •  Drag to pan  •  Double-tap resident to follow',
      style: {
        fill: 0xcbd5e1,
        fontFamily: 'Avenir Next, Helvetica Neue, sans-serif',
        fontSize: 12,
        fontWeight: '500',
        stroke: { color: 0x020617, width: 3 },
      },
      anchor: { x: 1, y: 0 },
    })
    this.uiLayer.addChild(this.hudLabel, this.hintLabel)

    this.drawTiles()
    this.drawBuildings()
    this.drawAmbientAccent()
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
    this.renderHud()
  }

  syncBuildings(buildings: Array<Building & { occupants?: number }>): void {
    this.currentBuildings = buildings

    while (this.buildingLabelLayer.children.length > 0) {
      const child = this.buildingLabelLayer.children[0]
      this.buildingLabelLayer.removeChild(child)
      child.destroy()
    }

    this.buildingGraphics.clear()

    if (!buildings.length) {
      this.drawBuildings()
      return
    }

    const typeColor: Record<string, number> = {
      cafe: 0xb45309,
      park: 0x15803d,
      school: 0x7c3aed,
      shop: 0xdc2626,
      home: 0x1e40af,
      default: 0x475569,
    }

    for (const b of buildings) {
      const [bx, by] = b.position
      const x = bx * TILE_SIZE
      const y = by * TILE_SIZE
      const color = typeColor[b.type] ?? typeColor.default
      const width = TILE_SIZE * 2
      const height = TILE_SIZE * 3

      this.buildingGraphics.roundRect(x, y, width, height, 8)
      this.buildingGraphics.fill({ color, alpha: 0.82 })
      this.buildingGraphics.stroke({ color: 0xf8fafc, alpha: 0.18, width: 2 })

      const label = new Text({
        text: b.name,
        style: {
          fill: 0xf8fafc,
          fontFamily: 'Iowan Old Style, Palatino Linotype, serif',
          fontSize: 11,
          fontWeight: '700',
          stroke: { color: 0x020617, width: 3 },
          wordWrap: true,
          wordWrapWidth: width - 4,
          align: 'center',
        },
        anchor: { x: 0.5, y: 0.5 },
      })
      label.position.set(x + width / 2, y + height / 2 - 6)
      this.buildingLabelLayer.addChild(label)

      const occupantLabel = new Text({
        text: `${b.occupants ?? 0}/${b.type === 'park' ? '∞' : b.capacity}`,
        style: {
          fill: 0xfef3c7,
          fontFamily: 'Avenir Next, Helvetica Neue, sans-serif',
          fontSize: 10,
          fontWeight: '700',
          stroke: { color: 0x020617, width: 3 },
        },
        anchor: { x: 0.5, y: 0.5 },
      })
      occupantLabel.position.set(x + width / 2, y + height - 10)
      this.buildingLabelLayer.addChild(occupantLabel)
    }

    this.drawPlaceholderBuildings()
  }

  syncResidents(residents: ResidentPosition[]): void {
    const activeIds = new Set(residents.map((resident) => resident.id))

    for (const resident of residents) {
      const sprite = this.residents.get(resident.id)

      if (sprite) {
        sprite.setSimulationSpeed(this.simulationMeta.speed)
        sprite.setExternalHighlight(this.highlightedResidentIds.has(resident.id))
        sprite.applyResident(resident)
        sprite.alpha = resident.currentBuildingId ? 0.18 : 1
        continue
      }

      const newSprite = this.residentSpritePool.acquire()
      newSprite.reuse(resident, {
        onFocusRequest: this.followResident,
        onSelectRequest: this.selectResident,
      })
      newSprite.setSimulationSpeed(this.simulationMeta.speed)
      newSprite.setExternalHighlight(this.highlightedResidentIds.has(resident.id))
      newSprite.alpha = resident.currentBuildingId ? 0.18 : 1

      this.residentLayer.addChild(newSprite)
      this.residents.set(resident.id, newSprite)
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

    if (this.followedResidentId && !activeIds.has(this.followedResidentId)) {
      this.clearFollowMode()
    }
  }

  updateSimulationMeta(meta: SimulationMeta): void {
    this.simulationMeta = meta
    for (const sprite of this.residents.values()) {
      sprite.setSimulationSpeed(meta.speed)
    }
    this.updateWeather('sunny')
    this.updateDayNightOverlay()
    this.renderHud()
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
    }

    if (effect) {
      this.weatherContainer.addChild(effect.container)
      this.currentWeatherEffect = effect
    }

    // Apply color tint filter for the weather
    const weatherFilter = createWeatherFilter(weather)
    this.world.filters = weatherFilter ? [weatherFilter] : []
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

  triggerMilestone(fromId: string, toId: string, eventType: string): void {
    const fromSprite = this.residents.get(fromId)
    const toSprite = this.residents.get(toId)
    if (!fromSprite || !toSprite) return

    const effect = new MilestoneEffect(fromSprite.x, fromSprite.y, toSprite.x, toSprite.y, eventType)
    this.effectLayer.addChild(effect.container)
    this.milestoneEffects.push(effect)
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

  destroy(): void {
    this.app.ticker.remove(this.animate)

    const canvas = this.app.canvas

    canvas.removeEventListener('wheel', this.onWheel)
    canvas.removeEventListener('pointerdown', this.onPointerDown)
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

    this.residents.clear()
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

    if (this.followedResidentId) {
      this.centerOnResident(this.followedResidentId)
    }
  }

  private bindCameraControls(): void {
    const canvas = this.app.canvas

    canvas.style.cursor = 'grab'
    canvas.style.touchAction = 'none'
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    canvas.addEventListener('pointerdown', this.onPointerDown)
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
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return
    }

    if (this.pinchActive) {
      return
    }

    this.dragging = true
    this.dragPointerId = event.pointerId
    this.dragStartX = event.clientX
    this.dragStartY = event.clientY
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

    this.world.position.set(this.worldStartX + deltaX, this.worldStartY + deltaY)
    this.clampPan()
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.dragging || this.dragPointerId !== event.pointerId) {
      return
    }

    this.cancelDrag(event.pointerId)
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

    const nextZoom = this.clamp(
      this.pinchStartZoom * (distance / this.pinchStartDistance),
      this.minZoom,
      this.maxZoom,
    )
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

    this.dragging = false
    this.dragPointerId = null
    this.app.canvas.style.cursor = 'grab'
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
    this.renderHud()
  }

  private touchDistance(a: Touch, b: Touch): number {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  }

  private drawTiles(): void {
    this.tileGraphics.clear()

    for (let y = 0; y < MAP_HEIGHT; y += 1) {
      for (let x = 0; x < MAP_WIDTH; x += 1) {
        const tileKind = this.getTileKind(x, y)
        const { fillColor, strokeColor } = this.getTilePalette(tileKind, x, y)
        const tileX = x * TILE_SIZE
        const tileY = y * TILE_SIZE

        this.tileGraphics.rect(tileX, tileY, TILE_SIZE, TILE_SIZE)
        this.tileGraphics.fill({ color: fillColor })
        this.tileGraphics.stroke({ color: strokeColor, width: 1, alpha: 0.6 })
      }
    }
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
    this.ambientAccent.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.ambientAccent.stroke({ color: 0xe2e8f0, alpha: 0.08, width: 4 })
    this.ambientAccent.circle(23 * TILE_SIZE, 10 * TILE_SIZE, 90)
    this.ambientAccent.fill({ color: 0x38bdf8, alpha: 0.05 })
  }

  private updateDayNightOverlay(): void {
    const { alpha, color } = dayOverlayForTick(
      this.simulationMeta.tick,
      this.simulationMeta.tickPerDay,
    )

    this.dayNightOverlay.clear()

    if (!color || alpha <= 0) {
      return
    }

    this.dayNightOverlay.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.dayNightOverlay.fill({ color, alpha })
  }

  private getTileKind(x: number, y: number): TileKind {
    return getTileKind(x, y)
  }

  private getTilePalette(kind: TileKind, x: number, y: number): {
    fillColor: number
    strokeColor: number
  } {
    if (kind === 'water') {
      return {
        fillColor: (x + y) % 2 === 0 ? 0x2563eb : 0x1d4ed8,
        strokeColor: 0x93c5fd,
      }
    }

    if (kind === 'road') {
      return {
        fillColor: (x + y) % 2 === 0 ? 0x64748b : 0x475569,
        strokeColor: 0xcbd5e1,
      }
    }

    return {
      fillColor: (x + y) % 2 === 0 ? 0x3f9b4b : 0x2f855a,
      strokeColor: 0x14532d,
    }
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
}
