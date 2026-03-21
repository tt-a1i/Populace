import { useEffect, useMemo, useRef, useState } from 'react'

import { RelationCard } from './RelationCard'
import { GraphRenderer } from './GraphRenderer'
import { TimelineSlider } from '../ui'
import { useSimulationStore } from '../../stores/simulation'
import {
  useRelationshipsStore,
  type GraphRelationship,
  type GraphResident,
} from '../../stores/relationships'

const graphTypeOptions = ['all', 'friendship', 'rivalry', 'love', 'knows'] as const
const graphIntensityThresholds = [0.3, 0.5, 0.7] as const

type GraphFilterType = (typeof graphTypeOptions)[number]

// eslint-disable-next-line react-refresh/only-export-components
export function filterGraphData(
  residents: GraphResident[],
  relationships: GraphRelationship[],
  filter: { type: GraphFilterType; minIntensity: number },
): { residents: GraphResident[]; relationships: GraphRelationship[] } {
  const visibleRelationships = relationships.filter((relationship) => {
    if (relationship.intensity <= filter.minIntensity) {
      return false
    }

    if (filter.type === 'all') {
      return true
    }

    return relationship.type === filter.type
  })

  const visibleResidentIds = new Set<string>()
  for (const relationship of visibleRelationships) {
    visibleResidentIds.add(relationship.from_id)
    visibleResidentIds.add(relationship.to_id)
  }

  return {
    residents: residents.filter((resident) => visibleResidentIds.has(resident.id)),
    relationships: visibleRelationships,
  }
}

export function GraphPanel() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<GraphRenderer | null>(null)
  const residents = useRelationshipsStore((state) => state.residents)
  const relationships = useRelationshipsStore((state) => state.relationships)
  const history = useRelationshipsStore((state) => state.history)
  const replayTick = useRelationshipsStore((state) => state.replayTick)
  const lastAppliedTick = useRelationshipsStore((state) => state.lastAppliedTick)
  const setReplayTick = useRelationshipsStore((state) => state.setReplayTick)
  const flashingEventKeys = useRelationshipsStore((state) => state.flashingEventKeys)
  const selectedResidentId = useSimulationStore((state) => state.selectedResidentId)
  const selectResident = useSimulationStore((state) => state.selectResident)
  const setHoveredPairIds = useSimulationStore((state) => state.setHoveredPairIds)
  const freezeForReplay = useSimulationStore((state) => state.freezeForReplay)
  const resumeLiveFromReplay = useSimulationStore((state) => state.resumeLiveFromReplay)
  const [hoveredRelationship, setHoveredRelationship] = useState<(typeof relationships)[number] | null>(null)
  const [cardPosition, setCardPosition] = useState<{ x: number; y: number } | null>(null)
  const [activeType, setActiveType] = useState<GraphFilterType>('all')
  const [minIntensity, setMinIntensity] = useState<number>(0.3)
  const replaySnapshot = useMemo(
    () => history.find((snapshot) => snapshot.tick === replayTick) ?? null,
    [history, replayTick],
  )
  const renderedRelationships = replaySnapshot?.relationships ?? relationships
  const filteredGraph = useMemo(
    () => filterGraphData(residents, renderedRelationships, { type: activeType, minIntensity }),
    [activeType, minIntensity, renderedRelationships, residents],
  )
  const filteredResidents = filteredGraph.residents
  const filteredRelationships = filteredGraph.relationships
  const activeHoveredRelationship =
    hoveredRelationship &&
    filteredRelationships.some(
      (relationship) =>
        relationship.from_id === hoveredRelationship.from_id &&
        relationship.to_id === hoveredRelationship.to_id &&
        relationship.type === hoveredRelationship.type,
    )
      ? hoveredRelationship
      : null
  const activeCardPosition = activeHoveredRelationship ? cardPosition : null

  useEffect(() => {
    if (replayTick !== null && !replaySnapshot && history.length > 0) {
      setReplayTick(history[0]?.tick ?? null)
    }
  }, [history, replaySnapshot, replayTick, setReplayTick])

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
      onHoverPair: (pairIds) => {
        setHoveredPairIds(pairIds)
      },
      onSelectResident: (residentId) => {
        selectResident(residentId)
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
      setHoveredPairIds(null)
      renderer.destroy()
      rendererRef.current = null
    }
  }, [selectResident, setHoveredPairIds])

  useEffect(() => {
    rendererRef.current?.render(filteredResidents, filteredRelationships, selectedResidentId)
  }, [filteredRelationships, filteredResidents, selectedResidentId])

  useEffect(() => {
    if (flashingEventKeys.size > 0) {
      rendererRef.current?.flashLinks([...flashingEventKeys])
    }
  }, [flashingEventKeys])

  const handleReplayTickChange = (tick: number | null) => {
    if (tick === null) {
      resumeLiveFromReplay()
      setReplayTick(null)
      return
    }

    if (replayTick === null) {
      freezeForReplay()
    }

    setReplayTick(tick)
  }

  return (
    <div
      id="graph-panel"
      className="relative mt-5 flex min-h-[30rem] flex-1 overflow-hidden rounded-[24px] border border-amber-200/25 bg-[radial-gradient(circle_at_top,_rgba(250,204,21,0.14),_rgba(15,23,42,0.4)_32%,_rgba(2,6,23,0.98)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
    >
      <div ref={hostRef} className="h-full min-h-[30rem] w-full" />
      <div className="absolute left-4 right-4 top-4 z-10 flex flex-col gap-3">
        <div className="pointer-events-auto flex flex-col gap-3 rounded-[24px] border border-white/10 bg-slate-950/72 px-4 py-4 shadow-[0_18px_44px_rgba(8,15,31,0.35)] backdrop-blur md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-[11px] uppercase tracking-[0.28em] text-amber-100/70">关系过滤</p>
            <div className="flex flex-wrap gap-2">
              {graphTypeOptions.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setActiveType(type)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${
                    activeType === type
                      ? 'border-cyan-300/45 bg-cyan-300/16 text-cyan-50'
                      : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                  }`}
                >
                  {type === 'all' ? '全部' : type}
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-[14rem] flex-1 md:max-w-xs">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-slate-300/75">
              <span>{`强度 > ${minIntensity.toFixed(1)}`}</span>
              <span>仅显示相关节点</span>
            </div>
            <input
              aria-label="关系强度阈值"
              type="range"
              min={graphIntensityThresholds[0]}
              max={graphIntensityThresholds[graphIntensityThresholds.length - 1]}
              step={0.2}
              value={minIntensity}
              onChange={(event) => setMinIntensity(Number(event.target.value))}
              className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-amber-300"
            />
            <div className="mt-2 flex justify-between text-[10px] text-slate-400">
              {graphIntensityThresholds.map((threshold) => (
                <span key={threshold}>{threshold.toFixed(1)}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="pointer-events-none self-start rounded-full border border-white/10 bg-slate-950/65 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-amber-100/70">
          {replaySnapshot ? `Replay Tick ${replaySnapshot.tick}` : `Live Tick ${lastAppliedTick || '...'}`}
        </div>
      </div>
      <RelationCard
        position={activeCardPosition}
        relationship={activeHoveredRelationship}
        residents={residents}
      />
      <div className="absolute bottom-4 left-4 right-4 z-10">
        <TimelineSlider
          history={history}
          replayTick={replayTick}
          liveTick={lastAppliedTick}
          onReplayTickChange={handleReplayTickChange}
        />
      </div>
      {filteredRelationships.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/45 backdrop-blur-[2px]">
          <div className="max-w-sm rounded-[22px] border border-amber-200/15 bg-slate-950/84 px-6 py-5 text-center shadow-[0_18px_44px_rgba(8,15,31,0.45)]">
            <p className="text-[11px] uppercase tracking-[0.32em] text-amber-100/70">Graph Filtered</p>
            <p className="mt-3 font-display text-2xl text-white">当前筛选下暂无关系</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              调整关系类型或强度阈值后会立即刷新图谱。
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
