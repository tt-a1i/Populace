import { drag } from 'd3-drag'
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import { scaleOrdinal } from 'd3-scale'
import { select, type Selection } from 'd3-selection'

import type { GraphRelationship, GraphResident, ResidentMood } from '../../stores/relationships'

type GraphNode = GraphResident & SimulationNodeDatum

type GraphLink = GraphRelationship &
  SimulationLinkDatum<GraphNode> & {
    source: string | GraphNode
    target: string | GraphNode
  }

interface GraphRendererOptions {
  onHoverLink: (
    relationship: GraphRelationship | null,
    position: { x: number; y: number } | null,
  ) => void
}

const defaultLinkOpacity = 0.72
const graphGlowStops: Array<{ offset: string; color: string }> = [
  { offset: '0%', color: 'rgba(251, 191, 36, 0.34)' },
  { offset: '100%', color: 'rgba(15, 23, 42, 0)' },
]

const moodColorScale = scaleOrdinal<ResidentMood, string>()
  .domain(['happy', 'sad', 'angry', 'neutral'])
  .range(['#facc15', '#60a5fa', '#f87171', '#94a3b8'])

const relationshipColorScale = scaleOrdinal<GraphRelationship['type'], string>()
  .domain(['love', 'friendship', 'rivalry', 'knows'])
  .range(['#f472b6', '#4ade80', '#ef4444', '#cbd5e1'])

export class GraphRenderer {
  private readonly root: HTMLDivElement
  private readonly options: GraphRendererOptions
  private readonly svg: Selection<SVGSVGElement, unknown, null, undefined>
  private readonly surface: Selection<SVGGElement, unknown, null, undefined>
  private readonly linkLayer: Selection<SVGGElement, unknown, null, undefined>
  private readonly nodeLayer: Selection<SVGGElement, unknown, null, undefined>
  private readonly labelLayer: Selection<SVGGElement, unknown, null, undefined>
  private simulation: Simulation<GraphNode, GraphLink> | null = null
  private width = 640
  private height = 480

  constructor(root: HTMLDivElement, options: GraphRendererOptions) {
    this.root = root
    this.options = options
    this.svg = select(root)
      .append('svg')
      .attr('class', 'h-full w-full overflow-visible')
      .attr('viewBox', `0 0 ${this.width} ${this.height}`)

    this.surface = this.svg.append('g')
    this.linkLayer = this.surface.append('g')
    this.nodeLayer = this.surface.append('g')
    this.labelLayer = this.surface.append('g')
  }

  resize(width: number, height: number) {
    this.width = Math.max(320, width)
    this.height = Math.max(320, height)
    this.svg.attr('viewBox', `0 0 ${this.width} ${this.height}`)

    if (this.simulation) {
      this.simulation.force('center', forceCenter(this.width / 2, this.height / 2))
      this.simulation.alpha(0.35).restart()
    }
  }

  render(
    residents: GraphResident[],
    relationships: GraphRelationship[],
    selectedResidentId: string | null,
  ) {
    const nodes: GraphNode[] = residents.map((resident) => ({ ...resident }))
    const links: GraphLink[] = relationships.map((relationship) => ({
      ...relationship,
      source: relationship.from_id,
      target: relationship.to_id,
    }))

    this.simulation?.stop()
    this.surface.selectAll('*').remove()

    const defs = this.surface.append('defs')
    defs
      .append('radialGradient')
      .attr('id', 'graph-glow')
      .selectAll('stop')
      .data(graphGlowStops)
      .enter()
      .append('stop')
      .attr('offset', (stop) => stop.offset)
      .attr('stop-color', (stop) => stop.color)

    this.linkLayer.raise()
    this.nodeLayer.raise()
    this.labelLayer.raise()

    const linkSelection = this.linkLayer
      .selectAll<SVGLineElement, GraphLink>('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', (link) => relationshipColorScale(link.type))
      .attr('stroke-opacity', (link) =>
        this.isLinkHighlighted(link, selectedResidentId) ? 0.96 : defaultLinkOpacity,
      )
      .attr('stroke-width', (link) =>
        1.5 + link.intensity * 5 + (this.isLinkHighlighted(link, selectedResidentId) ? 2.5 : 0),
      )
      .on('mouseenter', (event: MouseEvent, link: GraphLink) => {
        linkSelection.attr('stroke-opacity', (current) => (current === link ? 1 : 0.18))
        this.options.onHoverLink(link, { x: event.offsetX + 18, y: event.offsetY - 8 })
      })
      .on('mousemove', (event: MouseEvent, link: GraphLink) => {
        this.options.onHoverLink(link, { x: event.offsetX + 18, y: event.offsetY - 8 })
      })
      .on('mouseleave', () => {
        linkSelection.attr('stroke-opacity', (link) =>
          this.isLinkHighlighted(link, selectedResidentId) ? 0.96 : defaultLinkOpacity,
        )
        this.options.onHoverLink(null, null)
      })

    const nodeGroups = this.nodeLayer
      .selectAll<SVGGElement, GraphNode>('g')
      .data(nodes)
      .enter()
      .append('g')
      .style('cursor', 'grab')

    if (selectedResidentId) {
      nodeGroups
        .filter((node) => node.id === selectedResidentId)
        .append('animateTransform')
        .attr('attributeName', 'transform')
        .attr('attributeType', 'XML')
        .attr('type', 'scale')
        .attr('values', '1;1.12;1')
        .attr('dur', '1.2s')
        .attr('repeatCount', 'indefinite')
    }

    nodeGroups
      .append('circle')
      .attr('r', (node) => (node.id === selectedResidentId ? 32 : 26))
      .attr('fill', 'url(#graph-glow)')
      .attr('opacity', (node) => (node.id === selectedResidentId ? 1 : 0.55))

    nodeGroups
      .append('circle')
      .attr('r', (node) => (node.id === selectedResidentId ? 16 : 13))
      .attr('fill', '#0f172a')
      .attr('stroke', (node) => moodColorScale(node.mood))
      .attr('stroke-width', (node) => (node.id === selectedResidentId ? 5 : 3))

    nodeGroups
      .append('circle')
      .attr('r', (node) => (node.id === selectedResidentId ? 6.5 : 5))
      .attr('fill', (node) => moodColorScale(node.mood))

    const labels = this.labelLayer
      .selectAll<SVGTextElement, GraphNode>('text')
      .data(nodes)
      .enter()
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 34)
      .attr('fill', (node) => (node.id === selectedResidentId ? '#fef3c7' : '#f8fafc'))
      .attr('font-size', (node) => (node.id === selectedResidentId ? 13 : 12))
      .attr('font-weight', (node) => (node.id === selectedResidentId ? 700 : 600))
      .text((node: GraphNode) => node.name)

    const dragBehavior = drag<SVGGElement, GraphNode>()
      .on('start', (event, node) => {
        if (!event.active && this.simulation) {
          this.simulation.alphaTarget(0.25).restart()
        }
        node.fx = node.x
        node.fy = node.y
      })
      .on('drag', (event, node) => {
        node.fx = event.x
        node.fy = event.y
      })
      .on('end', (event, node) => {
        if (!event.active && this.simulation) {
          this.simulation.alphaTarget(0)
        }
        node.fx = null
        node.fy = null
      })

    nodeGroups.call(dragBehavior)

    this.simulation = forceSimulation(nodes)
      .force(
        'link',
        forceLink<GraphNode, GraphLink>(links)
          .id((node) => node.id)
          .distance((link) => 90 + (1 - link.intensity) * 70),
      )
      .force('charge', forceManyBody().strength(-340))
      .force('center', forceCenter(this.width / 2, this.height / 2))
      .force('collision', forceCollide<GraphNode>().radius(34))
      .on('tick', () => {
        linkSelection
          .attr('x1', (link: GraphLink) => (link.source as GraphNode).x ?? 0)
          .attr('y1', (link: GraphLink) => (link.source as GraphNode).y ?? 0)
          .attr('x2', (link: GraphLink) => (link.target as GraphNode).x ?? 0)
          .attr('y2', (link: GraphLink) => (link.target as GraphNode).y ?? 0)

        nodeGroups.attr('transform', (node: GraphNode) => `translate(${node.x ?? 0}, ${node.y ?? 0})`)
        labels
          .attr('x', (node: GraphNode) => node.x ?? 0)
          .attr('y', (node: GraphNode) => node.y ?? 0)
      })
  }

  destroy() {
    this.simulation?.stop()
    this.options.onHoverLink(null, null)
    this.root.replaceChildren()
  }

  private isLinkHighlighted(
    link: GraphRelationship,
    selectedResidentId: string | null,
  ): boolean {
    if (!selectedResidentId) {
      return false
    }

    return link.from_id === selectedResidentId || link.to_id === selectedResidentId
  }
}
