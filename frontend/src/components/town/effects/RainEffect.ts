import { Container, Graphics } from 'pixi.js'

interface RainDrop {
  x: number
  y: number
  speed: number
  length: number
  alpha: number
  graphic: Graphics
}

const WORLD_WIDTH = 40 * 32
const WORLD_HEIGHT = 30 * 32
const DROP_COUNT = 80

export class RainEffect {
  readonly container: Container
  private drops: RainDrop[] = []

  constructor() {
    this.container = new Container()
    this.container.alpha = 0.55
    this._spawnDrops()
  }

  private _spawnDrops(): void {
    for (let i = 0; i < DROP_COUNT; i++) {
      const g = new Graphics()
      const drop: RainDrop = {
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * WORLD_HEIGHT,
        speed: 6 + Math.random() * 6,
        length: 8 + Math.random() * 8,
        alpha: 0.4 + Math.random() * 0.4,
        graphic: g,
      }
      this._drawDrop(drop)
      this.container.addChild(g)
      this.drops.push(drop)
    }
  }

  private _drawDrop(drop: RainDrop): void {
    drop.graphic.clear()
    drop.graphic.setStrokeStyle({ color: 0xadd8e6, width: 1, alpha: drop.alpha })
    drop.graphic.moveTo(drop.x, drop.y)
    drop.graphic.lineTo(drop.x - 1, drop.y + drop.length)
    drop.graphic.stroke()
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 16.67
    for (const drop of this.drops) {
      drop.y += drop.speed * dt
      drop.x -= 0.5 * dt
      if (drop.y > WORLD_HEIGHT + drop.length) {
        drop.y = -drop.length
        drop.x = Math.random() * WORLD_WIDTH
      }
      this._drawDrop(drop)
    }
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
