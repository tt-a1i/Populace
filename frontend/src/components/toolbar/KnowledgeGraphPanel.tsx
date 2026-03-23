import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import { drag } from 'd3-drag'
import { select } from 'd3-selection'
import { zoom, zoomIdentity } from 'd3-zoom'

import {
  type KnowledgeGraphData,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
  getKnowledgeGraph,
} from '../../services/api'
import { PanelShell } from '../ui/PanelShell'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GraphNode extends SimulationNodeDatum {
  id: string
  label: string
  type: 'resident' | 'building' | 'event'
  metadata: Record<string, unknown>
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  label: string
  tick: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_COLORS: Record<string, string> = {
  resident: '#60a5fa', // blue-400
  building: '#34d399', // emerald-400
  event: '#fbbf24',    // amber-400
}

const NODE_RADIUS: Record<string, number> = {
  resident: 18,
  building: 14,
  event: 10,
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KnowledgeGraphPanel() {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const [data, setData] = useState<KnowledgeGraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sinceTick, setSinceTick] = useState(0)
  const [untilTick, setUntilTick] = useState('')
  const simulationRef = useRef<ReturnType<typeof forceSimulation> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await getKnowledgeGraph(
        sinceTick,
        untilTick ? parseInt(untilTick, 10) : undefined,
      )
      setData(result)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [sinceTick, untilTick])

  useEffect(() => {
    void load()
  }, [load])

  // D3 rendering
  useEffect(() => {
    if (!data || !svgRef.current) return

    const svg = select(svgRef.current)
    const width = svgRef.current.clientWidth || 600
    const height = svgRef.current.clientHeight || 400

    // Clear previous render
    svg.selectAll('*').remove()

    // Container for zoom
    const container = svg.append('g')

    // Zoom behavior
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        container.attr('transform', event.transform)
      })
    svg.call(zoomBehavior)

    // Build node/link data
    const nodeMap = new Map<string, GraphNode>()
    const nodes: GraphNode[] = data.nodes.map((n) => {
      const node: GraphNode = { ...n, x: width / 2, y: height / 2 }
      nodeMap.set(n.id, node)
      return node
    })

    const links: GraphLink[] = data.edges
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        label: e.label,
        tick: e.tick,
      }))

    // Stop previous simulation
    if (simulationRef.current) {
      simulationRef.current.stop()
    }

    // Force simulation
    const simulation = forceSimulation<GraphNode>(nodes)
      .force(
        'link',
        forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(80),
      )
      .force('charge', forceManyBody().strength(-120))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide<GraphNode>().radius((d) => (NODE_RADIUS[d.type] ?? 12) + 4))

    simulationRef.current = simulation

    // Arrow marker
    svg
      .append('defs')
      .append('marker')
      .attr('id', 'kg-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#475569')

    // Links
    const link = container
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#475569')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.5)
      .attr('marker-end', 'url(#kg-arrow)')

    // Link labels
    const linkLabel = container
      .append('g')
      .selectAll('text')
      .data(links)
      .join('text')
      .text((d) => d.label)
      .attr('font-size', 8)
      .attr('fill', '#64748b')
      .attr('text-anchor', 'middle')

    // Node groups
    const node = container
      .append('g')
      .selectAll<SVGGElement, GraphNode>('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'grab')

    // Drag behavior
    const dragBehavior = drag<SVGGElement, GraphNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
      })

    node.call(dragBehavior)

    // Draw node shapes based on type
    node.each(function (d) {
      const g = select(this)
      const color = NODE_COLORS[d.type] ?? '#94a3b8'
      const r = NODE_RADIUS[d.type] ?? 12

      if (d.type === 'resident') {
        // Circle
        g.append('circle')
          .attr('r', r)
          .attr('fill', color)
          .attr('fill-opacity', 0.2)
          .attr('stroke', color)
          .attr('stroke-width', 1.5)
      } else if (d.type === 'building') {
        // Rounded rect
        g.append('rect')
          .attr('x', -r)
          .attr('y', -r)
          .attr('width', r * 2)
          .attr('height', r * 2)
          .attr('rx', 3)
          .attr('fill', color)
          .attr('fill-opacity', 0.2)
          .attr('stroke', color)
          .attr('stroke-width', 1.5)
      } else {
        // Diamond (rotated square)
        const s = r * 1.2
        g.append('polygon')
          .attr('points', `0,${-s} ${s},0 0,${s} ${-s},0`)
          .attr('fill', color)
          .attr('fill-opacity', 0.2)
          .attr('stroke', color)
          .attr('stroke-width', 1.5)
      }
    })

    // Node labels
    node
      .append('text')
      .text((d) => d.label.slice(0, 12))
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => (NODE_RADIUS[d.type] ?? 12) + 12)
      .attr('font-size', 9)
      .attr('fill', '#cbd5e1')

    // Tick handler
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as GraphNode).x!)
        .attr('y1', (d) => (d.source as GraphNode).y!)
        .attr('x2', (d) => (d.target as GraphNode).x!)
        .attr('y2', (d) => (d.target as GraphNode).y!)

      linkLabel
        .attr('x', (d) => ((d.source as GraphNode).x! + (d.target as GraphNode).x!) / 2)
        .attr('y', (d) => ((d.source as GraphNode).y! + (d.target as GraphNode).y!) / 2)

      node.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })

    // Fit to view
    svg.call(zoomBehavior.transform, zoomIdentity)

    return () => {
      simulation.stop()
    }
  }, [data])

  return (
    <PanelShell
      icon="\uD83E\uDDE0"
      title={t('knowledge.title', 'Knowledge Graph')}
      badge={t('knowledge.badge', 'Global Knowledge')}
      headerRight={
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
        >
          {t('knowledge.refresh', 'Refresh')}
        </button>
      }
    >
      {/* Tick range filter */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-[10px] text-slate-400 mb-0.5">
            {t('knowledge.since_tick', 'From tick')}
          </label>
          <input
            type="number"
            min={0}
            value={sinceTick}
            onChange={(e) => setSinceTick(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-100 outline-none focus:border-white/20"
          />
        </div>
        <div className="flex-1">
          <label className="block text-[10px] text-slate-400 mb-0.5">
            {t('knowledge.until_tick', 'To tick')}
          </label>
          <input
            type="number"
            min={0}
            value={untilTick}
            onChange={(e) => setUntilTick(e.target.value)}
            placeholder={t('knowledge.latest', 'Latest')}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-white/20"
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-400/60 border border-blue-400" />
          {t('knowledge.resident', 'Resident')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-400/60 border border-emerald-400" />
          {t('knowledge.building', 'Building')}
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 bg-amber-400/60 border border-amber-400"
            style={{ transform: 'rotate(45deg)' }}
          />
          {t('knowledge.event', 'Event')}
        </span>
      </div>

      {/* Graph canvas */}
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {loading && !data && (
        <p className="text-xs text-slate-400">{t('knowledge.loading', 'Loading graph...')}</p>
      )}
      <div className="relative rounded-lg border border-white/10 bg-slate-900/50 overflow-hidden" style={{ height: 360 }}>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          className="block"
        />
        {data && (
          <div className="absolute bottom-2 right-2 text-[9px] text-slate-500">
            {data.nodes.length} {t('knowledge.nodes', 'nodes')} · {data.edges.length} {t('knowledge.edges', 'edges')}
          </div>
        )}
      </div>
    </PanelShell>
  )
}
