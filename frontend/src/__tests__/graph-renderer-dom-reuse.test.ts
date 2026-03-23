import { beforeAll, describe, expect, it, vi } from 'vitest'

import * as GraphRendererModule from '../components/graph/GraphRenderer'
import { GraphRenderer } from '../components/graph/GraphRenderer'

function getDetectCommunities() {
  return (
    GraphRendererModule as {
      detectCommunities?: (nodeIds: string[], links: Array<{ from_id: string; to_id: string }>) => string[][]
    }
  ).detectCommunities
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

describe('GraphRenderer incremental DOM updates', () => {
  it('reuses existing node and link elements across renders', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    const renderer = new GraphRenderer(root, {
      onHoverLink: () => undefined,
      onHoverPair: () => undefined,
      onSelectResident: () => undefined,
    })

    renderer.resize(640, 480)
    renderer.render(
      [
        { id: 'a', name: 'A', mood: 'happy' },
        { id: 'b', name: 'B', mood: 'neutral' },
      ],
      [
        { from_id: 'a', to_id: 'b', type: 'friendship', intensity: 0.4, reason: 'shared loop' },
      ],
      null,
    )

    const initialNode = root.querySelector('g.graph-node')
    const initialLink = root.querySelector('line.graph-link')
    const initialLabel = root.querySelector('text.graph-label')

    renderer.render(
      [
        { id: 'a', name: 'A', mood: 'happy' },
        { id: 'b', name: 'B', mood: 'neutral' },
      ],
      [
        { from_id: 'a', to_id: 'b', type: 'friendship', intensity: 0.7, reason: 'shared loop' },
      ],
      'a',
    )

    expect(root.querySelector('g.graph-node')).toBe(initialNode)
    expect(root.querySelector('line.graph-link')).toBe(initialLink)
    expect(root.querySelector('text.graph-label')).toBe(initialLabel)

    renderer.destroy()
    root.remove()
  })

  it('renders avatar images inside graph nodes', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    const renderer = new GraphRenderer(root, {
      onHoverLink: () => undefined,
      onHoverPair: () => undefined,
      onSelectResident: () => undefined,
    })

    renderer.resize(640, 480)
    renderer.render(
      [
        {
          id: 'a',
          name: 'Ada',
          mood: 'happy',
          skinColor: '#d8a27a',
          hairStyle: 'bun',
          hairColor: '#2b1b17',
          outfitColor: '#3b82f6',
        },
      ],
      [],
      null,
    )

    const avatar = root.querySelector('.graph-node-avatar')
    expect(avatar).not.toBeNull()
    expect(avatar?.getAttribute('href')).toMatch(/^data:image\//)

    renderer.destroy()
    root.remove()
  })

  it('scales edge width by intensity', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    const renderer = new GraphRenderer(root, {
      onHoverLink: () => undefined,
      onHoverPair: () => undefined,
      onSelectResident: () => undefined,
    })

    renderer.resize(640, 480)
    renderer.render(
      [
        { id: 'hub', name: 'Hub', mood: 'happy' },
        { id: 'a', name: 'A', mood: 'neutral' },
        { id: 'b', name: 'B', mood: 'neutral' },
      ],
      [
        { from_id: 'hub', to_id: 'a', type: 'friendship', intensity: 0.95, reason: 'close' },
        { from_id: 'hub', to_id: 'b', type: 'friendship', intensity: 0.2, reason: 'weak' },
      ],
      null,
    )

    const links = Array.from(root.querySelectorAll<SVGLineElement>('line.graph-link'))
    const strongLink = links.find((line) => ((line as SVGLineElement & { __data__?: { intensity?: number } }).__data__?.intensity) === 0.95)
    const weakLink = links.find((line) => ((line as SVGLineElement & { __data__?: { intensity?: number } }).__data__?.intensity) === 0.2)

    expect(Number(strongLink?.getAttribute('stroke-width'))).toBeGreaterThan(Number(weakLink?.getAttribute('stroke-width')))

    renderer.destroy()
    root.remove()
  })

  it('exports a community detector that groups tightly connected residents', () => {
    const detectCommunities = getDetectCommunities()
    expect(detectCommunities).toBeTypeOf('function')
    if (!detectCommunities) {
      return
    }

    const communities = detectCommunities(
      ['a', 'b', 'c', 'd', 'e', 'f'],
      [
        { from_id: 'a', to_id: 'b' },
        { from_id: 'b', to_id: 'c' },
        { from_id: 'a', to_id: 'c' },
        { from_id: 'd', to_id: 'e' },
      ],
    )

    expect(communities).toContainEqual(['a', 'b', 'c'])
    expect(communities).toContainEqual(['d', 'e'])
    expect(communities).toContainEqual(['f'])
  })
})
