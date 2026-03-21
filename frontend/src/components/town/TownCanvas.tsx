import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'

import { Application } from 'pixi.js'

import { useSound } from '../../audio'
import { getActiveEvents, injectEvent, type ActiveEvent } from '../../services/api'
import { useToast } from '../ui/ToastProvider'
import { useRelationshipsStore } from '../../stores/relationships'
import { useSimulationStore } from '../../stores/simulation'
import { TownChrome, type TownContextMenuState, type TownInspectionState, type TownPlaceholder } from './TownChrome'
import { TownRenderer } from './TownRenderer'
import { inspectTile } from './townMap'

export function TownCanvas() {
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
  const selectResident = useSimulationStore((state) => state.selectResident)
  const { play } = useSound()
  const { pushToast } = useToast()
  const liveRelationships = useRelationshipsStore((state) => state.relationships)
  const relationshipHistory = useRelationshipsStore((state) => state.history)
  const replayTick = useRelationshipsStore((state) => state.replayTick)
  const [contextMenu, setContextMenu] = useState<TownContextMenuState | null>(null)
  const [inspection, setInspection] = useState<TownInspectionState | null>(null)
  const [placeholders, setPlaceholders] = useState<TownPlaceholder[]>([])

  const replayFrame = useMemo(
    () => (replayTick === null ? null : getFrameByTick(replayTick)),
    [getFrameByTick, replayTick],
  )
  const replayRelationshipSnapshot = useMemo(
    () =>
      replayTick === null
        ? null
        : relationshipHistory.find((snapshot) => snapshot.tick === replayTick) ?? null,
    [relationshipHistory, replayTick],
  )
  const liveMeta = useMemo(
    () => ({
      running: liveRunning,
      speed,
      tick: liveTick,
      tickPerDay,
      time: liveTime,
      season,
    }),
    [liveRunning, speed, liveTick, tickPerDay, liveTime, season],
  )

  const residents = useMemo(
    () =>
      replayTick !== null
        ? replayFrame?.residents ?? replayFrozenFrame?.residents ?? liveResidents
        : liveResidents,
    [liveResidents, replayFrame, replayFrozenFrame, replayTick],
  )
  const relationships = replayRelationshipSnapshot?.relationships ?? liveRelationships
  const selectedResident = useMemo(
    () => residents.find((resident) => resident.id === selectedResidentId) ?? null,
    [residents, selectedResidentId],
  )
  const simulationMeta = useMemo(
    () =>
      replayTick !== null
        ? {
            running: replayFrozenFrame?.meta.running ?? liveMeta.running,
            speed: replayFrozenFrame?.meta.speed ?? liveMeta.speed,
            tick: replayFrame?.tick ?? replayFrozenFrame?.meta.tick ?? liveMeta.tick,
            tickPerDay: replayFrozenFrame?.meta.tickPerDay ?? liveMeta.tickPerDay,
            time: replayFrame?.time ?? replayFrozenFrame?.meta.time ?? liveMeta.time,
            season: liveMeta.season,
          }
        : liveMeta,
    [liveMeta, replayFrame, replayFrozenFrame, replayTick],
  )

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handleContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
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
  }, [])

  const handleInspectTile = useCallback(() => {
    if (!contextMenu) {
      return
    }

    setInspection(inspectTile(contextMenu.tileX, contextMenu.tileY, buildings, residents))
    setContextMenu(null)
  }, [buildings, contextMenu, residents])

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
          label: '预留地块',
        },
      ]
    })
    setContextMenu(null)
  }, [contextMenu])

  const handleInjectEvent = useCallback(async () => {
    if (!contextMenu) {
      return
    }

    try {
      await injectEvent({
        description: `地图 Tile ${contextMenu.tileX},${contextMenu.tileY} 出现新的街坊传闻。`,
        source: 'map_context_menu',
      })
      play('event')
      pushToast({
        type: 'success',
        title: '事件已投放',
        description: `Tile ${contextMenu.tileX}, ${contextMenu.tileY} 的地图事件已加入队列。`,
      })
    } catch {
      pushToast({
        type: 'error',
        title: '事件投放失败',
        description: '请确认后端服务可用后重试。',
      })
    } finally {
      setContextMenu(null)
    }
  }, [contextMenu, play, pushToast])

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

      const renderer = new TownRenderer(app)
      rendererRef.current = renderer

      const state = useSimulationStore.getState()
      renderer.syncBuildings(state.buildings)
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
    rendererRef.current?.syncResidents(residents)
  }, [residents])

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
  }, [selectedResidentId])

  useEffect(() => {
    rendererRef.current?.setHighlightedResidents(hoveredPairIds)
  }, [hoveredPairIds])

  useEffect(() => {
    rendererRef.current?.updateWeather(weather)
  }, [weather])

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

  return (
    <div
      ref={shellRef}
      data-testid="town-canvas-shell"
      onContextMenu={handleContextMenu}
      className="relative flex h-full w-full overflow-hidden bg-slate-950"
    >
      <div id="town-canvas" ref={hostRef} className="h-full w-full" />
      <TownChrome
        residents={residents}
        buildings={buildings}
        relationships={relationships}
        selectedResidentId={selectedResident?.id ?? null}
        currentTime={simulationMeta.time}
        messageFeed={messageFeed}
        contextMenu={contextMenu}
        inspection={inspection}
        placeholders={placeholders}
        onCloseContextMenu={closeContextMenu}
        onInjectEvent={() => {
          void handleInjectEvent()
        }}
        onInspectTile={handleInspectTile}
        onPlacePlaceholder={handlePlacePlaceholder}
        onClearResidentSelection={() => selectResident(null)}
        onDismissInspection={() => setInspection(null)}
      />
      {residents.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/45 backdrop-blur-[2px]">
          <div className="rounded-[22px] border border-cyan-300/15 bg-slate-950/80 px-6 py-5 text-center shadow-[0_18px_44px_rgba(8,15,31,0.4)]">
            <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-100/70">Town Waiting Room</p>
            <p className="mt-3 font-display text-2xl text-white">等待居民加载...</p>
          </div>
        </div>
      )}
    </div>
  )
}
