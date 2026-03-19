import { beforeAll, describe, expect, it, vi } from 'vitest'

import { GraphRenderer } from '../components/graph/GraphRenderer'

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
})
