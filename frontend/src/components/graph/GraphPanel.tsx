import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { RelationCard } from './RelationCard'
import { GraphRenderer } from './GraphRenderer'
import {
  calculateNetworkStats,
  filterGraphData,
  graphTypeOptions,
  type GraphFilterType,
} from './graphHelpers'
import { TimelineSlider } from '../ui'
import { getSimulationSnapshots, replaySimulationTick } from '../../services/api'
import { useSimulationStore } from '../../stores/simulation'
import {
  useRelationshipsStore,
  type GraphRelationship,
} from '../../stores/relationships'

const graphIntensityThresholds = [0.0, 0.3, 0.5, 0.7] as const

export function GraphPanel() {
  const { t } = useTranslation()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<GraphRenderer | null>(null)
  const residents = useRelationshipsStore((state) => state.residents)
  const relationships = useRelationshipsStore((state) => state.relationships)
  const replayTick = useRelationshipsStore((state) => state.replayTick)
  const lastAppliedTick = useRelationshipsStore((state) => state.lastAppliedTick)
  const setReplayTick = useRelationshipsStore((state) => state.setReplayTick)
  const flashingEventKeys = useRelationshipsStore((state) => state.flashingEventKeys)
  const snapshotHistory = useSimulationStore((state) => state.snapshotHistory)
  const getSnapshotByTick = useSimulationStore((state) => state.getSnapshotByTick)
  const setSnapshotHistory = useSimulationStore((state) => state.setSnapshotHistory)
  const upsertReplaySnapshot = useSimulationStore((state) => state.upsertReplaySnapshot)
  const selectedResidentId = useSimulationStore((state) => state.selectedResidentId)
  const selectResident = useSimulationStore((state) => state.selectResident)
  const setHoveredPairIds = useSimulationStore((state) => state.setHoveredPairIds)
  const freezeForReplay = useSimulationStore((state) => state.freezeForReplay)
  const resumeLiveFromReplay = useSimulationStore((state) => state.resumeLiveFromReplay)
  const [hoveredRelationship, setHoveredRelationship] = useState<(typeof relationships)[number] | null>(null)
  const [cardPosition, setCardPosition] = useState<{ x: number; y: number } | null>(null)
  const [activeType, setActiveType] = useState<GraphFilterType>('all')
  const [minIntensity, setMinIntensity] = useState<number>(0.0)
  const replaySnapshot = useMemo(
    () => (replayTick === null ? null : getSnapshotByTick(replayTick)),
    [getSnapshotByTick, replayTick],
  )
  const renderedRelationships = useMemo<GraphRelationship[]>(
    () =>
      replaySnapshot?.relationships.map((relationship) => ({
        from_id: relationship.from_id,
        to_id: relationship.to_id,
        type: relationship.type as GraphRelationship['type'],
        intensity: relationship.intensity,
        reason: relationship.reason ?? '',
      })) ?? relationships,
    [relationships, replaySnapshot],
  )
  const filteredGraph = useMemo(
    () =>
      filterGraphData(
        residents,
        renderedRelationships.map((relationship) => ({
          from_id: relationship.from_id,
          to_id: relationship.to_id,
          type: relationship.type as GraphRelationship['type'],
          intensity: relationship.intensity,
          reason: relationship.reason ?? '',
        })),
        { type: activeType, minIntensity },
      ),
    [activeType, minIntensity, renderedRelationships, residents],
  )
  const filteredResidents = filteredGraph.residents
  const filteredRelationships = filteredGraph.relationships
  const networkStats = useMemo(
    () => calculateNetworkStats(filteredResidents, filteredRelationships),
    [filteredRelationships, filteredResidents],
  )
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
    void getSimulationSnapshots()
      .then((snapshots) => {
        setSnapshotHistory(snapshots)
      })
      .catch(() => undefined)
  }, [setSnapshotHistory])

  useEffect(() => {
    if (replayTick !== null && !replaySnapshot && snapshotHistory.length > 0) {
      setReplayTick(snapshotHistory[0]?.tick ?? null)
    }
  }, [replaySnapshot, replayTick, setReplayTick, snapshotHistory])

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

  const handleReplayTickChange = async (tick: number | null) => {
    if (tick === null) {
      resumeLiveFromReplay()
      setReplayTick(null)
      return
    }

    if (replayTick === null) {
      freezeForReplay()
    }

    try {
      const snapshot = await replaySimulationTick(tick)
      upsertReplaySnapshot(snapshot)
      setReplayTick(snapshot.tick)
    } catch {
      setReplayTick(tick)
    }
  }

  return (
    <div
      id="graph-panel"
      className="relative flex h-full w-full flex-1 overflow-hidden bg-slate-950"
    >
      <div ref={hostRef} className="h-full w-full" />
      <div className="absolute left-4 right-4 top-4 z-10 flex flex-col gap-3">
        <div className="pointer-events-auto flex flex-col gap-3 rounded-xl border border-white/8 bg-slate-950/80 px-3 py-3 backdrop-blur-sm md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-[11px] uppercase tracking-[0.28em] text-amber-100/70">{t('graph.filter_label')}</p>
            <div className="flex flex-wrap gap-2">
              {graphTypeOptions.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={activeType === type}
                  aria-label={type === 'all' ? String(t('graph.all')) : String(t(`graph.rel_${type}`))}
                  onClick={() => setActiveType(type)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition duration-200 active:scale-95 ${
                    activeType === type
                      ? 'theme-accent-button-active'
                      : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                  }`}
                >
                  {type === 'all' ? String(t('graph.all')) : String(t(`graph.rel_${type}`))}
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-[14rem] flex-1 md:max-w-xs">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-slate-300/75">
              <span>{t('graph.intensity_above', { value: minIntensity.toFixed(1) })}</span>
              <span>{t('graph.related_nodes_only')}</span>
            </div>
            <input
              aria-label={t('graph.intensity_threshold_aria')}
              type="range"
              min={0}
              max={graphIntensityThresholds[graphIntensityThresholds.length - 1]}
              step={0.1}
              value={minIntensity}
              onChange={(event) => setMinIntensity(Number(event.target.value))}
              className="theme-accent-range mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10"
            />
            <div className="mt-2 flex justify-between text-[10px] text-slate-400">
              {graphIntensityThresholds.map((threshold) => (
                <span key={threshold}>{threshold.toFixed(1)}</span>
              ))}
            </div>
          </div>

          <div className="grid min-w-[13rem] gap-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-[11px] text-slate-300 md:max-w-[14rem]">
            <p className="uppercase tracking-[0.22em] text-cyan-100/70">{t('graph.network_stats')}</p>
            <div className="flex items-center justify-between gap-3">
              <span>{t('graph.density')}</span>
              <span className="font-mono text-white">{networkStats.density.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>{t('graph.average_path_length')}</span>
              <span className="font-mono text-white">{networkStats.averagePathLength.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>{t('graph.largest_component')}</span>
              <span className="font-mono text-white">{networkStats.largestComponentSize}</span>
            </div>
          </div>
        </div>

        <div className="pointer-events-none self-start rounded-full border border-white/10 bg-slate-950/65 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-amber-100/70">
          {replaySnapshot ? t('graph.replay_tick', { tick: replaySnapshot.tick }) : t('graph.live_tick', { tick: lastAppliedTick || '...' })}
        </div>
      </div>
      <RelationCard
        position={activeCardPosition}
        relationship={activeHoveredRelationship}
        residents={residents}
      />
      <div className="absolute bottom-4 left-4 right-4 z-10">
        <TimelineSlider
          history={snapshotHistory}
          replayTick={replayTick}
          liveTick={lastAppliedTick}
          onReplayTickChange={handleReplayTickChange}
        />
      </div>
      {filteredRelationships.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/45 backdrop-blur-[2px]">
          <div className="max-w-xs rounded-xl border border-white/10 bg-slate-950/80 px-5 py-4 text-center backdrop-blur-sm">
            <p className="text-sm text-slate-400">{t('graph.no_relationships')}</p>
            <p className="mt-1 text-xs text-slate-500">{t('graph.adjust_hint')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
