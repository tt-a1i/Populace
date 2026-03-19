import { useEffect, useRef } from 'react'

import { Application } from 'pixi.js'

import { useSimulationStore } from '../../stores/simulation'
import { TownRenderer } from './TownRenderer'

export function TownCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<TownRenderer | null>(null)
  const residents = useSimulationStore((state) => state.residents)
  const tick = useSimulationStore((state) => state.tick)
  const tickPerDay = useSimulationStore((state) => state.tickPerDay)
  const time = useSimulationStore((state) => state.time)
  const running = useSimulationStore((state) => state.running)
  const selectedResidentId = useSimulationStore((state) => state.selectedResidentId)
  const speed = useSimulationStore((state) => state.speed)

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
      running,
      speed,
      tick,
      tickPerDay,
      time,
    })
  }, [running, speed, tick, tickPerDay, time])

  useEffect(() => {
    rendererRef.current?.setFollowTarget(selectedResidentId)
  }, [selectedResidentId])

  return (
    <div
      id="town-canvas"
      ref={hostRef}
      className="mt-5 flex min-h-[30rem] flex-1 overflow-hidden rounded-[24px] border border-cyan-300/30 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.22),_rgba(15,23,42,0.42)_38%,_rgba(2,6,23,0.96)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
    />
  )
}
