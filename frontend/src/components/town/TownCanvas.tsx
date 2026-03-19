import { useEffect, useRef } from 'react'

import { Application } from 'pixi.js'

import { useSimulationStore } from '../../stores/simulation'
import { useRelationshipsStore } from '../../stores/relationships'
import { TownRenderer } from './TownRenderer'

export function TownCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<TownRenderer | null>(null)
  const liveResidents = useSimulationStore((state) => state.residents)
  const liveTick = useSimulationStore((state) => state.tick)
  const tickPerDay = useSimulationStore((state) => state.tickPerDay)
  const liveTime = useSimulationStore((state) => state.time)
  const liveRunning = useSimulationStore((state) => state.running)
  const selectedResidentId = useSimulationStore((state) => state.selectedResidentId)
  const speed = useSimulationStore((state) => state.speed)
  const hoveredPairIds = useSimulationStore((state) => state.hoveredPairIds)
  const replayFrozenFrame = useSimulationStore((state) => state.replayFrozenFrame)
  const replayTick = useRelationshipsStore((state) => state.replayTick)
  const liveMeta = {
    running: liveRunning,
    speed,
    tick: liveTick,
    tickPerDay,
    time: liveTime,
  }

  const residents = replayTick !== null ? replayFrozenFrame?.residents ?? liveResidents : liveResidents
  const simulationMeta =
    replayTick !== null
      ? replayFrozenFrame?.meta ?? liveMeta
      : liveMeta

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

  return (
    <div className="relative mt-5 flex min-h-[30rem] flex-1 overflow-hidden rounded-[24px] border border-cyan-300/30 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.22),_rgba(15,23,42,0.42)_38%,_rgba(2,6,23,0.96)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div id="town-canvas" ref={hostRef} className="h-full min-h-[30rem] w-full" />
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
