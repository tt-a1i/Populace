import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useTranslation } from 'react-i18next'

import { Application } from 'pixi.js'

import { useSound } from '../../audio'
import { getActiveEvents, getZones, injectEvent, type ActiveEvent } from '../../services/api'
import { useToast } from '../ui/ToastProvider'
import { useRelationshipsStore } from '../../stores/relationships'
import type { Zone } from '../../types'
import {
  useSimulationStore,
  type ResidentPosition,
  type ResidentStatus,
} from '../../stores/simulation'
import { TownChrome, type TownContextMenuState, type TownInspectionState, type TownPlaceholder } from './TownChrome'
import { TownRenderer } from './TownRenderer'
import { inspectTile, zoneContainsTile } from './townMap'

function toReplayResident(
  resident: {
    id: string
    name: string
    x?: number
    y?: number
    location?: string | null
    skin_color?: string | null
    hair_style?: string | null
    hair_color?: string | null
    outfit_color?: string | null
    personality?: string
    mood?: string
    goals?: string[]
    coins?: number
    occupation?: string
    energy?: number
  },
  liveResidents: ResidentPosition[],
): ResidentPosition {
  return {
    id: resident.id,
    name: resident.name,
    x: resident.x ?? 0,
    y: resident.y ?? 0,
    targetX: resident.x ?? 0,
    targetY: resident.y ?? 0,
    color: liveResidents.find((item) => item.id === resident.id)?.color ?? 0xf97316,
    status: 'idle' as ResidentStatus,
    currentBuildingId: resident.location ?? null,
    skinColor: resident.skin_color ?? null,
    hairStyle: resident.hair_style ?? null,
    hairColor: resident.hair_color ?? null,
    outfitColor: resident.outfit_color ?? null,
    personality: resident.personality,
    mood: resident.mood,
    goals: resident.goals,
    dialogueText: null,
    coins: resident.coins,
    occupation: resident.occupation,
    energy: resident.energy,
  }
}

export function TownCanvas() {
  const { t } = useTranslation()
  const shellRef = useRef<HTMLDivElement | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<TownRenderer | null>(null)
  const buildings = useSimulationStore((state) => state.buildings)
  const liveResidents = useSimulationStore((state) => state.residents)
  const liveTick = useSimulationStore((state) => state.tick)
  const tickPerDay = useSimulationStore((state) => state.tickPerDay)
  const liveTime = useSimulationStore((state) => state.time)
  const liveRunning = useSimulationStore((state) => state.running)
  const selectedResidentId = useSimulationStore((state) => state.selectedResidentId)
  const speed = useSimulationStore((state) => state.speed)
  const hoveredPairIds = useSimulationStore((state) => state.hoveredPairIds)
  const weather = useSimulationStore((state) => state.weather)
  const season = useSimulationStore((state) => state.season)
  const messageFeed = useSimulationStore((state) => state.messageFeed)
  const replayFrozenFrame = useSimulationStore((state) => state.replayFrozenFrame)
  const getFrameByTick = useSimulationStore((state) => state.getFrameByTick)
  const getSnapshotByTick = useSimulationStore((state) => state.getSnapshotByTick)
  const selectResident = useSimulationStore((state) => state.selectResident)
  const { play } = useSound()
  const { pushToast } = useToast()
  const liveRelationships = useRelationshipsStore((state) => state.relationships)
  const replayTick = useRelationshipsStore((state) => state.replayTick)
  const [contextMenu, setContextMenu] = useState<TownContextMenuState | null>(null)
  const [inspection, setInspection] = useState<TownInspectionState | null>(null)
  const [placeholders, setPlaceholders] = useState<TownPlaceholder[]>([])
  const [followedResidentId, setFollowedResidentId] = useState<string | null>(null)
  const [heatmapOn, setHeatmapOn] = useState(false)
  const [zones, setZones] = useState<Zone[]>([])
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const lastRecordedTick = useRef(0)

  // Sync follow state from renderer on each animation frame
  useEffect(() => {
    let raf: number
    const sync = () => {
      const rid =
        typeof rendererRef.current?.getFollowedResidentId === 'function'
          ? rendererRef.current.getFollowedResidentId()
          : null
      setFollowedResidentId((prev) => (prev !== rid ? rid : prev))
      raf = requestAnimationFrame(sync)
    }
    raf = requestAnimationFrame(sync)
    return () => cancelAnimationFrame(raf)
  }, [])

  const replayFrame = useMemo(
    () => (replayTick === null ? null : getFrameByTick(replayTick)),
    [getFrameByTick, replayTick],
  )
  const replaySnapshot = useMemo(
    () => (replayTick === null ? null : getSnapshotByTick(replayTick)),
    [getSnapshotByTick, replayTick],
  )
  const liveMeta = useMemo(
    () => ({
      running: liveRunning,
      speed,
      tick: liveTick,
      tickPerDay,
      time: liveTime,
      weather,
      season,
    }),
    [liveRunning, speed, liveTick, tickPerDay, liveTime, weather, season],
  )

  const renderResidents = useMemo<ResidentPosition[]>(
    () =>
      replayTick !== null
        ? replaySnapshot?.residents.map((resident) => toReplayResident(resident, liveResidents)) ??
          replayFrame?.residents ??
          replayFrozenFrame?.residents ??
          liveResidents
        : liveResidents,
    [liveResidents, replayFrame, replayFrozenFrame, replaySnapshot, replayTick],
  )
  const relationships =
    replaySnapshot?.relationships.map((relationship) => ({
      from_id: relationship.from_id,
      to_id: relationship.to_id,
      type: relationship.type as (typeof liveRelationships)[number]['type'],
      intensity: relationship.intensity,
      reason: relationship.reason ?? '',
    })) ?? liveRelationships
  const selectedResident = useMemo(
    () => renderResidents.find((resident) => resident.id === selectedResidentId) ?? null,
    [renderResidents, selectedResidentId],
  )
  const selectedZone = useMemo(() => {
    const zone = zones.find((item) => item.id === selectedZoneId)
    if (!zone) {
      return null
    }

    const residentCount = renderResidents.filter((resident) =>
      zoneContainsTile(zone, resident.targetX, resident.targetY),
    ).length
    const buildingCount = buildings.filter((building) => zoneContainsTile(zone, building.position[0], building.position[1])).length

    return {
      ...zone,
      resident_count: residentCount,
      building_count: buildingCount,
    }
  }, [buildings, renderResidents, selectedZoneId, zones])
  const simulationMeta = useMemo(
    () =>
      replayTick !== null
        ? {
            running: replayFrozenFrame?.meta.running ?? liveMeta.running,
            speed: replayFrozenFrame?.meta.speed ?? liveMeta.speed,
            tick: replayFrame?.tick ?? replayFrozenFrame?.meta.tick ?? liveMeta.tick,
            tickPerDay: replayFrozenFrame?.meta.tickPerDay ?? liveMeta.tickPerDay,
            time: replaySnapshot?.time ?? replayFrame?.time ?? replayFrozenFrame?.meta.time ?? liveMeta.time,
            weather: replaySnapshot?.weather ?? replayFrozenFrame?.meta.weather ?? liveMeta.weather,
            season: replaySnapshot?.season ?? replayFrozenFrame?.meta.season ?? liveMeta.season,
          }
        : liveMeta,
    [liveMeta, replayFrame, replayFrozenFrame, replaySnapshot, replayTick],
  )

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handleCanvasClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const renderer = rendererRef.current
    const shell = shellRef.current
    if (!renderer || !shell) return

    const bounds = shell.getBoundingClientRect()
    const tile = renderer.screenToTile(event.clientX - bounds.left, event.clientY - bounds.top)
    if (!tile) return

    const clickedZone = zones.find((zone) => zoneContainsTile(zone, tile.tileX, tile.tileY)) ?? null
    setSelectedZoneId(clickedZone?.id ?? null)

    window.dispatchEvent(new CustomEvent('populace:map-editor-paint', { detail: { tileX: tile.tileX, tileY: tile.tileY } }))
  }, [zones])

  const handleCanvasPointerMove = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!(window as unknown as Record<string, unknown>).__mapEditorPainting) return
    const renderer = rendererRef.current
    const shell = shellRef.current
    if (!renderer || !shell) return

    const bounds = shell.getBoundingClientRect()
    const tile = renderer.screenToTile(event.clientX - bounds.left, event.clientY - bounds.top)
    if (!tile) return

    window.dispatchEvent(new CustomEvent('populace:map-editor-paint', { detail: { tileX: tile.tileX, tileY: tile.tileY } }))
  }, [])

  const handleContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (replayTick !== null) {
      return
    }

    const renderer = rendererRef.current
    const shell = shellRef.current

    if (!renderer || !shell) {
      return
    }

    event.preventDefault()
    const bounds = shell.getBoundingClientRect()
    const localX = event.clientX - bounds.left
    const localY = event.clientY - bounds.top
    const tile = renderer.screenToTile(localX, localY)

    if (!tile) {
      setContextMenu(null)
      return
    }

    setContextMenu({
      screenX: Math.max(24, Math.min(localX, bounds.width - 216)),
      screenY: Math.max(24, Math.min(localY, bounds.height - 220)),
      tileX: tile.tileX,
      tileY: tile.tileY,
      tileKind: tile.tileKind,
    })
  }, [replayTick])

  const handleInspectTile = useCallback(() => {
    if (!contextMenu) {
      return
    }

    setInspection(inspectTile(contextMenu.tileX, contextMenu.tileY, buildings, renderResidents))
    setContextMenu(null)
  }, [buildings, contextMenu, renderResidents])

  const handlePlacePlaceholder = useCallback(() => {
    if (!contextMenu) {
      return
    }

    setPlaceholders((current) => {
      const exists = current.some(
        (placeholder) =>
          placeholder.tileX === contextMenu.tileX && placeholder.tileY === contextMenu.tileY,
      )

      if (exists) {
        return current
      }

      return [
        ...current,
        {
          id: `placeholder-${contextMenu.tileX}-${contextMenu.tileY}`,
          tileX: contextMenu.tileX,
          tileY: contextMenu.tileY,
          label: t('canvas.placeholder_label'),
        },
      ]
    })
    setContextMenu(null)
  }, [contextMenu, t])

  const handleInjectEvent = useCallback(async () => {
    if (!contextMenu) {
      return
    }

    try {
      await injectEvent({
        description: t('canvas.event_desc', { x: contextMenu.tileX, y: contextMenu.tileY }),
        source: 'map_context_menu',
      })
      play('event')
      pushToast({
        type: 'success',
        title: t('canvas.event_success_title'),
        description: t('canvas.event_success_desc', { x: contextMenu.tileX, y: contextMenu.tileY }),
      })
    } catch {
      pushToast({
        type: 'error',
        title: t('canvas.event_fail_title'),
        description: t('canvas.event_fail_desc'),
      })
    } finally {
      setContextMenu(null)
    }
  }, [contextMenu, play, pushToast, t])

  useEffect(() => {
    const host = hostRef.current

    if (!host) {
      return undefined
    }

    const app = new Application()
    const resizeObserver = new ResizeObserver((entries) => {
      const nextEntry = entries[0]

      if (!nextEntry) {
        return
      }

      rendererRef.current?.resize(
        Math.max(320, Math.floor(nextEntry.contentRect.width)),
        Math.max(320, Math.floor(nextEntry.contentRect.height)),
      )
    })

    let disposed = false
    let initialized = false

    const boot = async () => {
      const bounds = host.getBoundingClientRect()
      const initialWidth = Math.max(320, Math.floor(bounds.width) || 960)
      const initialHeight = Math.max(320, Math.floor(bounds.height) || 640)

      await app.init({
        antialias: true,
        autoDensity: true,
        backgroundAlpha: 0,
        height: initialHeight,
        resolution: window.devicePixelRatio || 1,
        width: initialWidth,
      })
      initialized = true

      if (disposed) {
        app.destroy(
          { removeView: false },
          { children: true, context: true, texture: true, textureSource: true },
        )
        return
      }

      const canvas = app.canvas
      canvas.style.display = 'block'
      canvas.style.height = '100%'
      canvas.style.width = '100%'
      host.replaceChildren(canvas)

      const renderer = new TownRenderer(app, {
        onViewportChange: (viewport) => {
          window.dispatchEvent(new CustomEvent('populace:viewport-changed', { detail: viewport }))
        },
      })
      rendererRef.current = renderer

      const state = useSimulationStore.getState()
      renderer.syncBuildings(state.buildings)
      renderer.syncZones(zones)
      renderer.syncResidents(state.residents)
      renderer.updateSimulationMeta({
        running: state.running,
        speed: state.speed,
        tick: state.tick,
        tickPerDay: state.tickPerDay,
        time: state.time,
      })
      renderer.setFollowTarget(state.selectedResidentId)
      renderer.setHighlightedResidents(state.hoveredPairIds)
      renderer.resize(initialWidth, initialHeight)

      resizeObserver.observe(host)
    }

    void boot()

    return () => {
      disposed = true
      resizeObserver.disconnect()
      rendererRef.current?.destroy()
      rendererRef.current = null
      host.replaceChildren()

      if (initialized) {
        app.destroy(
          { removeView: false },
          { children: true, context: true, texture: true, textureSource: true },
        )
      }
    }
  }, [])

  useEffect(() => {
    rendererRef.current?.syncBuildings(buildings)
  }, [buildings])

  useEffect(() => {
    rendererRef.current?.syncZones(zones)
  }, [zones])

  useEffect(() => {
    rendererRef.current?.syncResidents(renderResidents)
  }, [renderResidents])

  useEffect(() => {
    rendererRef.current?.updateSimulationMeta({
      running: simulationMeta.running,
      speed: simulationMeta.speed,
      tick: simulationMeta.tick,
      tickPerDay: simulationMeta.tickPerDay,
      time: simulationMeta.time,
    })
  }, [
    simulationMeta.running,
    simulationMeta.speed,
    simulationMeta.tick,
    simulationMeta.tickPerDay,
    simulationMeta.time,
  ])

  useEffect(() => {
    rendererRef.current?.setFollowTarget(selectedResidentId)
    rendererRef.current?.drawRelationshipLines(selectedResidentId, liveRelationships)
  }, [selectedResidentId, liveRelationships])

  useEffect(() => {
    rendererRef.current?.setHighlightedResidents(hoveredPairIds)
  }, [hoveredPairIds])

  useEffect(() => {
    rendererRef.current?.setSelectedZone(selectedZoneId)
  }, [selectedZoneId])

  useEffect(() => {
    rendererRef.current?.updateWeather(simulationMeta.weather)
  }, [simulationMeta.weather])

  // Heatmap: toggle on/off
  useEffect(() => {
    rendererRef.current?.setHeatmapEnabled(heatmapOn)
  }, [heatmapOn])

  // Heatmap: record tick positions
  useEffect(() => {
    if (simulationMeta.tick > lastRecordedTick.current && renderResidents.length > 0) {
      lastRecordedTick.current = simulationMeta.tick
      rendererRef.current?.recordHeatmapTick(renderResidents)
    }
  }, [simulationMeta.tick, renderResidents])

  useEffect(() => {
    const handler = (e: Event) => {
      const { fromId, toId, eventType } = (e as CustomEvent).detail
      rendererRef.current?.triggerMilestone(fromId, toId, eventType)
    }
    window.addEventListener('populace:milestone', handler)
    return () => window.removeEventListener('populace:milestone', handler)
  }, [])

  useEffect(() => {
    rendererRef.current?.setPlaceholderBuildings(placeholders)
  }, [placeholders])

  useEffect(() => {
    const updateRadii = (events: ActiveEvent[]) => {
      const cx = Math.floor(40 / 2)
      const cy = Math.floor(30 / 2)
      rendererRef.current?.showEventRadii(events.map((event) => ({ x: cx, y: cy, radius: event.radius })))
    }

    const poll = async () => {
      try {
        const events = (await getActiveEvents()) as ActiveEvent[]
        updateRadii(events)
      } catch {
        updateRadii([])
      }
    }

    void poll()
    const id = setInterval(() => {
      void poll()
    }, 3000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadZones = async () => {
      try {
        const nextZones = await getZones()
        if (!cancelled) {
          setZones(nextZones)
        }
      } catch {
        if (!cancelled) {
          setZones([])
        }
      }
    }

    void loadZones()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!contextMenu) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('[data-town-context-menu="true"]')) {
        return
      }

      setContextMenu(null)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [contextMenu])

  // Listen for tile override changes (map editor) and redraw tiles
  useEffect(() => {
    const handler = () => {
      rendererRef.current?.redrawTiles?.()
    }
    window.addEventListener('populace:tiles-changed', handler)
    return () => window.removeEventListener('populace:tiles-changed', handler)
  }, [])

  return (
    <div
      ref={shellRef}
      data-testid="town-canvas-shell"
      onClick={handleCanvasClick}
      onPointerMove={handleCanvasPointerMove}
      onContextMenu={handleContextMenu}
      role="region"
      aria-label={t('app.map_region')}
      tabIndex={0}
      className="relative flex h-full w-full overflow-hidden bg-slate-950"
    >
      <div id="town-canvas" ref={hostRef} className="h-full w-full" />
      <TownChrome
        residents={renderResidents}
        buildings={buildings}
        relationships={relationships}
        selectedResidentId={selectedResident?.id ?? null}
        followedResidentId={followedResidentId}
        currentTime={simulationMeta.time}
        messageFeed={messageFeed}
        contextMenu={contextMenu}
        inspection={inspection}
        selectedZone={selectedZone}
        placeholders={placeholders}
        onCloseContextMenu={closeContextMenu}
        onInjectEvent={() => {
          void handleInjectEvent()
        }}
        onInspectTile={handleInspectTile}
        onPlacePlaceholder={handlePlacePlaceholder}
        onClearResidentSelection={() => selectResident(null)}
        onDismissInspection={() => setInspection(null)}
        onDismissZone={() => setSelectedZoneId(null)}
        onCancelFollow={() => {
          rendererRef.current?.setFollowTarget(null)
          selectResident(null)
        }}
      />
      {/* Heatmap toggle */}
      <div className="pointer-events-auto absolute right-3 top-3 z-20">
        <button
          type="button"
          onClick={() => setHeatmapOn((v) => !v)}
          title={t('canvas.heatmap_toggle')}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium backdrop-blur-sm transition duration-200 active:scale-95 ${
            heatmapOn
              ? 'border-orange-400/40 bg-orange-400/15 text-orange-200'
              : 'border-white/10 bg-slate-950/50 text-slate-400 hover:bg-white/10 hover:text-white'
          }`}
        >
          <span aria-hidden="true">🔥</span>
          {heatmapOn ? 'ON' : 'OFF'}
        </button>
      </div>
      {renderResidents.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/45 backdrop-blur-[2px]">
          <div className="rounded-xl border border-cyan-300/15 bg-slate-950/80 px-6 py-5 text-center shadow-[0_18px_44px_rgba(8,15,31,0.4)]">
            <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-100/70">{t('canvas.waiting_badge')}</p>
            <p className="mt-3 font-display text-2xl text-white">{t('canvas.waiting')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
