import { drag } from 'd3-drag'
import { easeCubicOut } from 'd3-ease'
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
import { transition } from 'd3-transition'

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

type RelationshipChangeComparable = Pick<GraphRelationship, 'from_id' | 'to_id' | 'intensity'>
type RelationshipTriangleComparable = Pick<GraphRelationship, 'from_id' | 'to_id'>

interface LinkChangeSet {
  enteringKeys: string[]
  intensifyingKeys: string[]
  exitingKeys: string[]
}

interface TriangleDatum {
  id: string
  nodeIds: [string, string, string]
  intensity: number
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

function undirectedLinkKey(a: string, b: string): string {
  return [a, b].sort().join('::')
}

function checksum(value: string): number {
  return [...value].reduce((total, char) => total + char.charCodeAt(0), 0)
}

export function classifyRelationshipChanges(
  previousRelationships: RelationshipChangeComparable[],
  nextRelationships: RelationshipChangeComparable[],
): LinkChangeSet {
  const previousByKey = new Map(
    previousRelationships.map((relationship) => [graphLinkKey(relationship), relationship]),
  )
  const nextByKey = new Map(
    nextRelationships.map((relationship) => [graphLinkKey(relationship), relationship]),
  )

  const enteringKeys = nextRelationships
    .map((relationship) => graphLinkKey(relationship))
    .filter((key) => !previousByKey.has(key))
    .sort()

  const intensifyingKeys = nextRelationships
    .filter((relationship) => {
      const previous = previousByKey.get(graphLinkKey(relationship))
      return previous !== undefined && relationship.intensity > previous.intensity
    })
    .map((relationship) => graphLinkKey(relationship))
    .sort()

  const exitingKeys = previousRelationships
    .map((relationship) => graphLinkKey(relationship))
    .filter((key) => !nextByKey.has(key))
    .sort()

  return {
    enteringKeys,
    intensifyingKeys,
    exitingKeys,
  }
}

export function detectRelationshipTriangles(
  relationships: RelationshipTriangleComparable[],
): Array<[string, string, string]> {
  const adjacency = new Map<string, Set<string>>()

  for (const relationship of relationships) {
    if (!adjacency.has(relationship.from_id)) {
      adjacency.set(relationship.from_id, new Set())
    }
    if (!adjacency.has(relationship.to_id)) {
      adjacency.set(relationship.to_id, new Set())
    }
    adjacency.get(relationship.from_id)?.add(relationship.to_id)
    adjacency.get(relationship.to_id)?.add(relationship.from_id)
  }

  const triangles: Array<[string, string, string]> = []
  const sortedNodes = Array.from(adjacency.keys()).sort()

  for (const nodeA of sortedNodes) {
    const neighborsA = Array.from(adjacency.get(nodeA) ?? []).filter((neighbor) => neighbor > nodeA).sort()

    for (const nodeB of neighborsA) {
      const neighborsB = adjacency.get(nodeB) ?? new Set<string>()

      for (const nodeC of neighborsA) {
        if (nodeC <= nodeB || !neighborsB.has(nodeC)) {
          continue
        }

        triangles.push([nodeA, nodeB, nodeC])
      }
    }
  }

  return triangles
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
  private readonly triangleLayer: Selection<SVGGElement, unknown, null, undefined>
  private readonly linkLayer: Selection<SVGGElement, unknown, null, undefined>
  private readonly effectLayer: Selection<SVGGElement, unknown, null, undefined>
  private readonly nodeLayer: Selection<SVGGElement, unknown, null, undefined>
  private readonly labelLayer: Selection<SVGGElement, unknown, null, undefined>
  private simulation: Simulation<GraphNode, GraphLink> | null = null
  private linkForce: ForceLink<GraphNode, GraphLink> | null = null
  private nodeSelection: Selection<SVGGElement, GraphNode, SVGGElement, unknown> | null = null
  private linkSelection: Selection<SVGLineElement, GraphLink, SVGGElement, unknown> | null = null
  private triangleSelection: Selection<SVGPolygonElement, TriangleDatum, SVGGElement, unknown> | null = null
  private labelSelection: Selection<SVGTextElement, GraphNode, SVGGElement, unknown> | null = null
  private selectedResidentId: string | null = null
  private width = 640
  private height = 480
  private readonly nodeState = new Map<string, Pick<GraphNode, 'x' | 'y' | 'vx' | 'vy'>>()
  private previousRelationships = new Map<string, GraphRelationship>()
  private readonly reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

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
    this.triangleLayer = this.surface.append('g').attr('class', 'graph-triangles').style('pointer-events', 'none')
    this.linkLayer = this.surface.append('g').attr('class', 'graph-links')
    this.effectLayer = this.surface.append('g').attr('class', 'graph-effects').style('pointer-events', 'none')
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
    const relationshipChanges = classifyRelationshipChanges(
      Array.from(this.previousRelationships.values()),
      relationships,
    )

    this.updateNodes(nodes)
    this.updateLabels(nodes)
    this.syncSimulation(nodes, links)
    this.updateTriangles(links)
    this.updateLinks(
      links,
      new Set(relationshipChanges.enteringKeys),
      new Set(relationshipChanges.intensifyingKeys),
    )
    this.previousRelationships = new Map(
      relationships.map((relationship) => [graphLinkKey(relationship), { ...relationship }]),
    )
    this.handleTick()
  }

  destroy(): void {
    this.simulation?.stop()
    this.options.onHoverLink(null, null)
    this.options.onHoverPair(null)
    this.root.replaceChildren()
  }

  private updateLinks(
    links: GraphLink[],
    enteringLinkKeys: Set<string>,
    intensifyingLinkKeys: Set<string>,
  ): void {
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
      .attr('x1', (link) => this.resolveNodePosition((link.source as GraphNode).id ?? String(link.source))?.x ?? 0)
      .attr('y1', (link) => this.resolveNodePosition((link.source as GraphNode).id ?? String(link.source))?.y ?? 0)
      .attr('x2', (link) => this.resolveNodePosition((link.source as GraphNode).id ?? String(link.source))?.x ?? 0)
      .attr('y2', (link) => this.resolveNodePosition((link.source as GraphNode).id ?? String(link.source))?.y ?? 0)
      .attr('stroke-opacity', 0)
      .attr('stroke-width', 0)
      .style('pointer-events', 'stroke')
      .style('transition', 'stroke-opacity 220ms ease')

    const mergedLinks = linkEnter.merge(linkSelection)

    mergedLinks
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
      const element = nodes[index] as SVGLineElement
      const key = graphLinkKey(link)
      const previousRelationship = this.previousRelationships.get(key)

      if (enteringLinkKeys.has(key)) {
        this.animateLinkEnter(element, link)
        return
      }

      if (intensifyingLinkKeys.has(key) && previousRelationship) {
        this.animateLinkIntensify(element, link, previousRelationship)
        return
      }

      select(element)
        .interrupt()
        .attr('stroke', relationshipColorScale(link.type))
        .attr('stroke-opacity', this.linkOpacity(link))
        .attr('stroke-width', this.linkWidth(link))
    })

    this.linkSelection = mergedLinks
  }

  private updateTriangles(links: GraphLink[]): void {
    const triangles = this.buildTriangleData(links)
    const polygonSelection = this.triangleLayer
      .selectAll<SVGPolygonElement, TriangleDatum>('polygon.graph-triangle')
      .data(triangles, (datum) => datum.id)

    polygonSelection
      .exit()
      .interrupt()
      .transition(transition().duration(this.reducedMotion ? 0 : 180))
      .attr('fill-opacity', 0)
      .attr('stroke-opacity', 0)
      .remove()

    const polygonEnter = polygonSelection
      .enter()
      .append('polygon')
      .attr('class', 'graph-triangle')
      .attr('fill', '#fde68a')
      .attr('stroke', '#fbbf24')
      .attr('stroke-width', 1.1)
      .attr('fill-opacity', 0)
      .attr('stroke-opacity', 0)

    const mergedPolygons = polygonEnter.merge(polygonSelection)

    mergedPolygons
      .attr('points', (triangle) => this.pointsForTriangle(triangle.nodeIds))
      .attr('fill-opacity', (triangle) => this.triangleFillOpacity(triangle))
      .attr('stroke-opacity', (triangle) => this.triangleStrokeOpacity(triangle))

    polygonEnter
      .interrupt()
      .transition(transition().duration(this.reducedMotion ? 0 : 260).ease(easeCubicOut))
      .attr('fill-opacity', (triangle) => this.triangleFillOpacity(triangle))
      .attr('stroke-opacity', (triangle) => this.triangleStrokeOpacity(triangle))

    this.triangleSelection = mergedPolygons
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
    this.triangleSelection?.attr('points', (triangle) => this.pointsForTriangle(triangle.nodeIds))
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

  private animateLinkEnter(element: SVGLineElement, link: GraphLink): void {
    const targetWidth = this.linkWidth(link)
    const targetOpacity = this.linkOpacity(link)
    const source = this.resolveLinkEndpoint(link.source)
    const target = this.resolveLinkEndpoint(link.target)

    if (!source || !target || this.reducedMotion) {
      select(element)
        .interrupt()
        .attr('stroke', relationshipColorScale(link.type))
        .attr('stroke-opacity', targetOpacity)
        .attr('stroke-width', targetWidth)
      return
    }

    const effectGroup = this.effectLayer.append('g').attr('class', 'graph-link-enter-effect')
    const trail = effectGroup
      .append('line')
      .attr('x1', source.x)
      .attr('y1', source.y)
      .attr('x2', source.x)
      .attr('y2', source.y)
      .attr('stroke', relationshipColorScale(link.type))
      .attr('stroke-width', targetWidth * 2.6)
      .attr('stroke-opacity', 0.22)
      .attr('stroke-linecap', 'round')

    const beam = effectGroup
      .append('line')
      .attr('x1', source.x)
      .attr('y1', source.y)
      .attr('x2', source.x)
      .attr('y2', source.y)
      .attr('stroke', relationshipColorScale(link.type))
      .attr('stroke-width', targetWidth * 1.25)
      .attr('stroke-opacity', 0.92)
      .attr('stroke-linecap', 'round')

    const spark = effectGroup
      .append('circle')
      .attr('cx', source.x)
      .attr('cy', source.y)
      .attr('r', Math.max(3, targetWidth * 0.9))
      .attr('fill', '#fef3c7')
      .attr('opacity', 0.95)

    select(element)
      .interrupt()
      .attr('stroke', relationshipColorScale(link.type))
      .attr('stroke-opacity', 0)
      .attr('stroke-width', 0)

    const entryTransition = transition()
      .duration(500)
      .ease(easeCubicOut)

    trail
      .transition(entryTransition)
      .attr('x2', target.x)
      .attr('y2', target.y)
      .attr('stroke-opacity', 0)
      .attr('stroke-width', targetWidth * 3.1)

    beam
      .transition(entryTransition)
      .attr('x2', target.x)
      .attr('y2', target.y)
      .attr('stroke-opacity', 0.16)

    spark
      .transition(entryTransition)
      .attr('cx', target.x)
      .attr('cy', target.y)
      .attr('opacity', 0)
      .attr('r', Math.max(1.2, targetWidth * 0.45))
      .remove()

    select(element)
      .transition(transition().delay(460).duration(180).ease(easeCubicOut))
      .attr('stroke-opacity', targetOpacity)
      .attr('stroke-width', targetWidth)
      .on('end', () => {
        effectGroup.remove()
      })
  }

  private animateLinkIntensify(
    element: SVGLineElement,
    link: GraphRelationship,
    previousRelationship: GraphRelationship,
  ): void {
    const previousWidth = this.linkWidth(previousRelationship)
    const targetWidth = this.linkWidth(link)
    const targetOpacity = this.linkOpacity(link)

    select(element)
      .interrupt()
      .attr('stroke', relationshipColorScale(previousRelationship.type))
      .attr('stroke-opacity', Math.max(this.linkOpacity(previousRelationship), 0.72))
      .attr('stroke-width', previousWidth)
      .transition(transition().duration(this.reducedMotion ? 0 : 140).ease(easeCubicOut))
      .attr('stroke', '#fef3c7')
      .attr('stroke-opacity', 1)
      .attr('stroke-width', Math.max(targetWidth, previousWidth) * 1.38)
      .transition()
      .duration(this.reducedMotion ? 0 : 260)
      .ease(easeCubicOut)
      .attr('stroke', relationshipColorScale(link.type))
      .attr('stroke-opacity', targetOpacity)
      .attr('stroke-width', targetWidth)
  }

  private animateLinkExit(element: SVGLineElement, link: GraphRelationship): void {
    element.style.pointerEvents = 'none'
    const midpoint = this.linkMidpoint(link)

    if (this.reducedMotion || !midpoint) {
      select(element)
        .interrupt()
        .transition(transition().duration(180))
        .attr('stroke-opacity', 0)
        .attr('stroke-width', 0)
        .remove()
      return
    }

    element
      .animate(
        [
          { opacity: '1' },
          { opacity: '0.15' },
          { opacity: '1' },
          { opacity: '0.15' },
          { opacity: '1' },
          { opacity: '0.15' },
          { opacity: '1' },
        ],
        {
          duration: 360,
          easing: 'linear',
        },
      )
      .finished
      .catch(() => undefined)
      .finally(() => {
        this.spawnBreakParticles(midpoint.x, midpoint.y, link)
        select(element)
          .interrupt()
          .transition(transition().duration(240).ease(easeCubicOut))
          .attr('stroke-opacity', 0)
          .attr('stroke-width', 0)
          .on('end', () => {
            element.remove()
          })
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

  private buildTriangleData(links: GraphLink[]): TriangleDatum[] {
    const linkByUndirectedKey = new Map<string, GraphLink>()

    for (const link of links) {
      linkByUndirectedKey.set(undirectedLinkKey(link.from_id, link.to_id), link)
    }

    return detectRelationshipTriangles(links)
      .map((triangle) => {
        const edges = [
          linkByUndirectedKey.get(undirectedLinkKey(triangle[0], triangle[1])),
          linkByUndirectedKey.get(undirectedLinkKey(triangle[1], triangle[2])),
          linkByUndirectedKey.get(undirectedLinkKey(triangle[0], triangle[2])),
        ].filter((edge): edge is GraphLink => edge !== undefined)

        const intensity =
          edges.length === 0
            ? 0
            : edges.reduce((total, edge) => total + edge.intensity, 0) / edges.length

        return {
          id: triangle.join('::'),
          nodeIds: triangle,
          intensity,
        }
      })
  }

  private triangleFillOpacity(triangle: TriangleDatum): number {
    const baseOpacity = 0.08 + triangle.intensity * 0.12
    return triangle.nodeIds.includes(this.selectedResidentId ?? '') ? baseOpacity + 0.08 : baseOpacity
  }

  private triangleStrokeOpacity(triangle: TriangleDatum): number {
    const baseOpacity = 0.22 + triangle.intensity * 0.18
    return triangle.nodeIds.includes(this.selectedResidentId ?? '') ? baseOpacity + 0.14 : baseOpacity
  }

  private pointsForTriangle(nodeIds: [string, string, string]): string {
    return nodeIds
      .map((nodeId) => this.resolveNodePosition(nodeId))
      .map((point) => `${point?.x ?? this.width / 2},${point?.y ?? this.height / 2}`)
      .join(' ')
  }

  private resolveLinkEndpoint(endpoint: string | GraphNode): { x: number; y: number } | null {
    if (typeof endpoint !== 'string') {
      return {
        x: endpoint.x ?? this.width / 2,
        y: endpoint.y ?? this.height / 2,
      }
    }

    return this.resolveNodePosition(endpoint)
  }

  private resolveNodePosition(nodeId: string): { x: number; y: number } | null {
    const simulationNode = this.simulation?.nodes().find((node) => node.id === nodeId)

    if (simulationNode) {
      return {
        x: simulationNode.x ?? this.width / 2,
        y: simulationNode.y ?? this.height / 2,
      }
    }

    const previous = this.nodeState.get(nodeId)
    if (!previous) {
      return null
    }

    return {
      x: previous.x ?? this.width / 2,
      y: previous.y ?? this.height / 2,
    }
  }

  private linkMidpoint(link: GraphRelationship): { x: number; y: number } | null {
    const source = this.resolveLinkEndpoint((link as GraphLink).source)
    const target = this.resolveLinkEndpoint((link as GraphLink).target)

    if (!source || !target) {
      return null
    }

    return {
      x: (source.x + target.x) / 2,
      y: (source.y + target.y) / 2,
    }
  }

  private spawnBreakParticles(x: number, y: number, link: GraphRelationship): void {
    const particleCount = 5 + (checksum(graphLinkKey(link)) % 4)
    const color = relationshipColorScale(link.type)

    for (let index = 0; index < particleCount; index += 1) {
      const angle = (Math.PI * 2 * index) / particleCount + (checksum(`${graphLinkKey(link)}-${index}`) % 7) * 0.06
      const distance = 18 + (checksum(`${link.from_id}-${index}`) % 18)
      const particle = this.effectLayer
        .append('circle')
        .attr('cx', x)
        .attr('cy', y)
        .attr('r', 1.8 + (index % 3))
        .attr('fill', color)
        .attr('opacity', 0.95)

      particle
        .transition(transition().duration(320).ease(easeCubicOut))
        .attr('cx', x + Math.cos(angle) * distance)
        .attr('cy', y + Math.sin(angle) * distance)
        .attr('opacity', 0)
        .attr('r', 0.8)
        .remove()
    }
  }
}
