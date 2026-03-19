import { drag } from 'd3-drag'
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type ForceLink,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import { scaleOrdinal } from 'd3-scale'
import { select, type Selection } from 'd3-selection'

import type { GraphRelationship, GraphResident, ResidentMood } from '../../stores/relationships'

type GraphNode = GraphResident &
  SimulationNodeDatum & {
    x: number
    y: number
    vx?: number
    vy?: number
  }

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
  onHoverPair: (pairIds: [string, string] | null) => void
  onSelectResident: (residentId: string | null) => void
}

const defaultLinkOpacity = 0.74
const graphGlowStops: Array<{ offset: string; color: string }> = [
  { offset: '0%', color: 'rgba(251, 191, 36, 0.34)' },
  { offset: '100%', color: 'rgba(15, 23, 42, 0)' },
]

const moodColorScale = scaleOrdinal<ResidentMood, string>()
  .domain(['happy', 'sad', 'angry', 'neutral'])
  .range(['#facc15', '#60a5fa', '#f87171', '#94a3b8'])

const relationshipColorScale = scaleOrdinal<GraphRelationship['type'], string>()
  .domain(['love', 'friendship', 'rivalry', 'knows', 'trust', 'fear', 'dislike'])
  .range(['#f472b6', '#4ade80', '#ef4444', '#cbd5e1', '#38bdf8', '#a78bfa', '#f97316'])

function graphLinkKey(link: Pick<GraphRelationship, 'from_id' | 'to_id'>): string {
  return `${link.from_id}::${link.to_id}`
}

function seededCoordinate(seed: string, extent: number, offset: number): number {
  const checksum = [...seed].reduce((total, char) => total + char.charCodeAt(0), 0)
  return offset + (checksum % Math.max(1, Math.floor(extent)))
}

export class GraphRenderer {
  private readonly root: HTMLDivElement
  private readonly options: GraphRendererOptions
  private readonly svg: Selection<SVGSVGElement, unknown, null, undefined>
  private readonly background: Selection<SVGRectElement, unknown, null, undefined>
  private readonly surface: Selection<SVGGElement, unknown, null, undefined>
  private readonly linkLayer: Selection<SVGGElement, unknown, null, undefined>
  private readonly nodeLayer: Selection<SVGGElement, unknown, null, undefined>
  private readonly labelLayer: Selection<SVGGElement, unknown, null, undefined>
  private simulation: Simulation<GraphNode, GraphLink> | null = null
  private linkForce: ForceLink<GraphNode, GraphLink> | null = null
  private nodeSelection: Selection<SVGGElement, GraphNode, SVGGElement, unknown> | null = null
  private linkSelection: Selection<SVGLineElement, GraphLink, SVGGElement, unknown> | null = null
  private labelSelection: Selection<SVGTextElement, GraphNode, SVGGElement, unknown> | null = null
  private selectedResidentId: string | null = null
  private width = 640
  private height = 480
  private readonly nodeState = new Map<string, Pick<GraphNode, 'x' | 'y' | 'vx' | 'vy'>>()
  private previousLinkKeys = new Set<string>()

  constructor(root: HTMLDivElement, options: GraphRendererOptions) {
    this.root = root
    this.options = options
    this.svg = select(root)
      .append('svg')
      .attr('class', 'h-full w-full overflow-visible')
      .attr('viewBox', `0 0 ${this.width} ${this.height}`)

    this.background = this.svg
      .append('rect')
      .attr('class', 'graph-background')
      .attr('fill', 'transparent')
      .attr('width', this.width)
      .attr('height', this.height)
      .style('pointer-events', 'all')
      .on('click', () => {
        this.options.onHoverPair(null)
        this.options.onHoverLink(null, null)
        this.options.onSelectResident(null)
      })

    const defs = this.svg.append('defs')
    defs
      .append('radialGradient')
      .attr('id', 'graph-glow')
      .selectAll('stop')
      .data(graphGlowStops)
      .enter()
      .append('stop')
      .attr('offset', (stop) => stop.offset)
      .attr('stop-color', (stop) => stop.color)

    this.surface = this.svg.append('g')
    this.linkLayer = this.surface.append('g').attr('class', 'graph-links')
    this.nodeLayer = this.surface.append('g').attr('class', 'graph-nodes')
    this.labelLayer = this.surface.append('g').attr('class', 'graph-labels')
  }

  resize(width: number, height: number): void {
    this.width = Math.max(320, width)
    this.height = Math.max(320, height)
    this.svg.attr('viewBox', `0 0 ${this.width} ${this.height}`)
    this.background.attr('width', this.width).attr('height', this.height)

    if (this.simulation) {
      this.simulation.force('center', forceCenter(this.width / 2, this.height / 2))
      this.simulation.alpha(0.35).restart()
    }
  }

  render(
    residents: GraphResident[],
    relationships: GraphRelationship[],
    selectedResidentId: string | null,
  ): void {
    this.selectedResidentId = selectedResidentId

    const nodes = residents.map<GraphNode>((resident) => {
      const previous = this.nodeState.get(resident.id)
      return {
        ...resident,
        x: previous?.x ?? seededCoordinate(resident.id, this.width * 0.5, this.width * 0.25),
        y: previous?.y ?? seededCoordinate(`${resident.id}-y`, this.height * 0.5, this.height * 0.25),
        vx: previous?.vx ?? 0,
        vy: previous?.vy ?? 0,
      }
    })

    const links = relationships.map<GraphLink>((relationship) => ({
      ...relationship,
      source: relationship.from_id,
      target: relationship.to_id,
    }))

    const nextLinkKeys = new Set(links.map((link) => graphLinkKey(link)))
    const enteringLinkKeys = new Set(
      [...nextLinkKeys].filter((key) => !this.previousLinkKeys.has(key)),
    )

    this.updateLinks(links, enteringLinkKeys)
    this.updateNodes(nodes)
    this.updateLabels(nodes)
    this.syncSimulation(nodes, links)
    this.previousLinkKeys = nextLinkKeys
    this.handleTick()
  }

  destroy(): void {
    this.simulation?.stop()
    this.options.onHoverLink(null, null)
    this.options.onHoverPair(null)
    this.root.replaceChildren()
  }

  private updateLinks(links: GraphLink[], enteringLinkKeys: Set<string>): void {
    const linkSelection = this.linkLayer
      .selectAll<SVGLineElement, GraphLink>('line.graph-link')
      .data(links, (datum) => graphLinkKey(datum as GraphLink))

    linkSelection.exit().each((link, index, nodes) => {
      this.animateLinkExit(nodes[index] as SVGLineElement, link as GraphRelationship)
    })

    const linkEnter = linkSelection
      .enter()
      .append('line')
      .attr('class', 'graph-link')
      .attr('stroke-linecap', 'round')
      .attr('stroke-opacity', 0)
      .attr('stroke-width', 0)
      .style('pointer-events', 'stroke')
      .style('transition', 'stroke 280ms ease, stroke-width 280ms ease, stroke-opacity 280ms ease')

    const mergedLinks = linkEnter.merge(linkSelection)

    mergedLinks
      .attr('stroke', (link) => relationshipColorScale(link.type))
      .attr('stroke-opacity', (link) => this.linkOpacity(link))
      .attr('stroke-width', (link) => this.linkWidth(link))
      .on('mouseenter', (event: MouseEvent, link: GraphLink) => {
        event.stopPropagation()
        this.setHoveredLink(link)
        this.options.onHoverPair([link.from_id, link.to_id])
        this.options.onHoverLink(link, { x: event.offsetX + 18, y: event.offsetY - 8 })
      })
      .on('mousemove', (event: MouseEvent, link: GraphLink) => {
        this.options.onHoverLink(link, { x: event.offsetX + 18, y: event.offsetY - 8 })
      })
      .on('mouseleave', () => {
        this.restoreLinkOpacity()
        this.options.onHoverPair(null)
        this.options.onHoverLink(null, null)
      })
      .on('click', (event: MouseEvent) => {
        event.stopPropagation()
      })

    mergedLinks.each((link, index, nodes) => {
      if (!enteringLinkKeys.has(graphLinkKey(link))) {
        return
      }
      this.animateLinkEnter(nodes[index] as SVGLineElement, link)
    })

    this.linkSelection = mergedLinks
  }

  private updateNodes(nodes: GraphNode[]): void {
    const nodeGroups = this.nodeLayer
      .selectAll<SVGGElement, GraphNode>('g.graph-node')
      .data(nodes, (datum) => (datum as GraphNode).id)
      .join(
        (enter) => {
          const group = enter
            .append('g')
            .attr('class', 'graph-node')
            .style('cursor', 'grab')

          group.append('circle').attr('class', 'graph-node-glow')
          group.append('circle').attr('class', 'graph-node-ring')
          group.append('circle').attr('class', 'graph-node-core')
          return group
        },
        (update) => update,
        (exit) => exit.remove(),
      )

    nodeGroups
      .select<SVGCircleElement>('circle.graph-node-glow')
      .attr('r', (node) => (node.id === this.selectedResidentId ? 32 : 26))
      .attr('fill', 'url(#graph-glow)')
      .attr('opacity', (node) => (node.id === this.selectedResidentId ? 1 : 0.55))

    nodeGroups
      .select<SVGCircleElement>('circle.graph-node-ring')
      .attr('r', (node) => (node.id === this.selectedResidentId ? 16 : 13))
      .attr('fill', '#0f172a')
      .attr('stroke', (node) => moodColorScale(node.mood))
      .attr('stroke-width', (node) => (node.id === this.selectedResidentId ? 5 : 3))

    nodeGroups
      .select<SVGCircleElement>('circle.graph-node-core')
      .attr('r', (node) => (node.id === this.selectedResidentId ? 6.5 : 5))
      .attr('fill', (node) => moodColorScale(node.mood))

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
    nodeGroups.on('click', (event: MouseEvent, node: GraphNode) => {
      if (event.defaultPrevented) {
        return
      }
      event.stopPropagation()
      this.options.onSelectResident(node.id)
    })
    this.nodeSelection = nodeGroups
  }

  private updateLabels(nodes: GraphNode[]): void {
    const labels = this.labelLayer
      .selectAll<SVGTextElement, GraphNode>('text.graph-label')
      .data(nodes, (datum) => (datum as GraphNode).id)
      .join(
        (enter) =>
          enter
            .append('text')
            .attr('class', 'graph-label')
            .attr('text-anchor', 'middle'),
        (update) => update,
        (exit) => exit.remove(),
      )

    labels
      .attr('dy', 34)
      .attr('fill', (node) => (node.id === this.selectedResidentId ? '#fef3c7' : '#f8fafc'))
      .attr('font-size', (node) => (node.id === this.selectedResidentId ? 13 : 12))
      .attr('font-weight', (node) => (node.id === this.selectedResidentId ? 700 : 600))
      .text((node) => node.name)

    this.labelSelection = labels
  }

  private syncSimulation(nodes: GraphNode[], links: GraphLink[]): void {
    if (!this.simulation) {
      this.linkForce = forceLink<GraphNode, GraphLink>(links)
        .id((node) => node.id)
        .distance((link) => 90 + (1 - link.intensity) * 70)

      this.simulation = forceSimulation(nodes)
        .force('link', this.linkForce)
        .force('charge', forceManyBody().strength(-340))
        .force('center', forceCenter(this.width / 2, this.height / 2))
        .force('collision', forceCollide<GraphNode>().radius(34))
        .on('tick', this.handleTick)
      return
    }

    if (!this.linkForce) {
      this.linkForce = this.simulation.force('link') as ForceLink<GraphNode, GraphLink>
    }

    this.simulation.nodes(nodes)
    this.linkForce
      .links(links)
      .distance((link) => 90 + (1 - link.intensity) * 70)
    this.simulation.force('center', forceCenter(this.width / 2, this.height / 2))
    this.simulation.alpha(0.45).restart()
  }

  private readonly handleTick = (): void => {
    this.linkSelection
      ?.attr('x1', (link) => (link.source as GraphNode).x ?? 0)
      .attr('y1', (link) => (link.source as GraphNode).y ?? 0)
      .attr('x2', (link) => (link.target as GraphNode).x ?? 0)
      .attr('y2', (link) => (link.target as GraphNode).y ?? 0)

    this.nodeSelection?.attr('transform', (node) => `translate(${node.x ?? 0}, ${node.y ?? 0})`)
    this.labelSelection
      ?.attr('x', (node) => node.x ?? 0)
      .attr('y', (node) => node.y ?? 0)

    const simulationNodes = this.simulation?.nodes() ?? []
    for (const node of simulationNodes) {
      this.nodeState.set(node.id, {
        x: node.x ?? this.width / 2,
        y: node.y ?? this.height / 2,
        vx: node.vx,
        vy: node.vy,
      })
    }
  }

  private linkOpacity(link: GraphRelationship): number {
    const baseOpacity = defaultLinkOpacity + link.intensity * 0.14
    return this.isLinkHighlighted(link, this.selectedResidentId) ? 0.98 : Math.min(0.94, baseOpacity)
  }

  private linkWidth(link: GraphRelationship): number {
    return 1.5 + link.intensity * 5 + (this.isLinkHighlighted(link, this.selectedResidentId) ? 2.5 : 0)
  }

  private setHoveredLink(activeLink: GraphRelationship): void {
    this.linkSelection?.attr('stroke-opacity', (link) =>
      graphLinkKey(link) === graphLinkKey(activeLink) ? 1 : 0.18,
    )
  }

  private restoreLinkOpacity(): void {
    this.linkSelection?.attr('stroke-opacity', (link) => this.linkOpacity(link))
  }

  private animateLinkEnter(element: SVGLineElement, link: GraphRelationship): void {
    element.animate(
      [
        { opacity: '0', strokeWidth: '0px' },
        { opacity: '1', strokeWidth: `${this.linkWidth(link) * 2.2}px` },
        { opacity: String(this.linkOpacity(link)), strokeWidth: `${this.linkWidth(link)}px` },
      ],
      {
        duration: 720,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    )
  }

  private animateLinkExit(element: SVGLineElement, link: GraphRelationship): void {
    element.style.pointerEvents = 'none'
    element.animate(
      [
        {
          opacity: String(this.linkOpacity(link)),
          strokeWidth: `${this.linkWidth(link)}px`,
        },
        {
          opacity: '0',
          strokeWidth: '0px',
        },
      ],
      {
        duration: 320,
        easing: 'ease-out',
      },
    ).finished
      .catch(() => undefined)
      .finally(() => {
        element.remove()
      })
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
