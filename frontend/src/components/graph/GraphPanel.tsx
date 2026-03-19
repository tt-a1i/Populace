import { useEffect, useRef, useState } from 'react'

import { RelationCard } from './RelationCard'
import { GraphRenderer } from './GraphRenderer'
import { useSimulationStore } from '../../stores/simulation'
import { useRelationshipsStore } from '../../stores/relationships'

export function GraphPanel() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<GraphRenderer | null>(null)
  const residents = useRelationshipsStore((state) => state.residents)
  const relationships = useRelationshipsStore((state) => state.relationships)
  const selectedResidentId = useSimulationStore((state) => state.selectedResidentId)
  const [hoveredRelationship, setHoveredRelationship] = useState<(typeof relationships)[number] | null>(null)
  const [cardPosition, setCardPosition] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return undefined
    }

    const renderer = new GraphRenderer(host, {
      onHoverLink: (relationship, position) => {
        setHoveredRelationship(relationship)
        setCardPosition(position)
      },
    })
    rendererRef.current = renderer

    const resize = () => {
      const bounds = host.getBoundingClientRect()
      renderer.resize(bounds.width, bounds.height)
    }

    const observer = new ResizeObserver(() => {
      resize()
    })

    resize()
    observer.observe(host)

    return () => {
      observer.disconnect()
      renderer.destroy()
      rendererRef.current = null
    }
  }, [])

  useEffect(() => {
    rendererRef.current?.render(residents, relationships, selectedResidentId)
  }, [relationships, residents, selectedResidentId])

  return (
    <div
      id="graph-panel"
      className="relative mt-5 flex min-h-[30rem] flex-1 overflow-hidden rounded-[24px] border border-amber-200/25 bg-[radial-gradient(circle_at_top,_rgba(250,204,21,0.14),_rgba(15,23,42,0.4)_32%,_rgba(2,6,23,0.98)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
    >
      <div ref={hostRef} className="h-full min-h-[30rem] w-full" />
      <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/10 bg-slate-950/65 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-amber-100/70">
        Live Social Graph
      </div>
      <RelationCard
        position={cardPosition}
        relationship={hoveredRelationship}
        residents={residents}
      />
      {relationships.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/45 backdrop-blur-[2px]">
          <div className="max-w-sm rounded-[22px] border border-amber-200/15 bg-slate-950/84 px-6 py-5 text-center shadow-[0_18px_44px_rgba(8,15,31,0.45)]">
            <p className="text-[11px] uppercase tracking-[0.32em] text-amber-100/70">Graph Pending</p>
            <p className="mt-3 font-display text-2xl text-white">暂无关系数据</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              观察居民互动后将自动更新。
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
