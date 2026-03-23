import { Container, Graphics } from 'pixi.js'

const WORLD_WIDTH = 40 * 32
const WORLD_HEIGHT = 30 * 32
const CLOUD_COUNT = 7

interface CloudPuff {
  x: number
  y: number
  width: number
  height: number
  speed: number
  alpha: number
}

export class CloudEffect {
  readonly container: Container
  private readonly fog = new Graphics()
  private readonly clouds = new Graphics()
  private readonly puffs: CloudPuff[] = []

  constructor() {
    this.container = new Container()
    this.container.alpha = 0.75
    this.seedClouds()
    this.redraw()
    this.container.addChild(this.fog, this.clouds)
  }

  private seedClouds(): void {
    for (let i = 0; i < CLOUD_COUNT; i += 1) {
      this.puffs.push({
        x: Math.random() * WORLD_WIDTH,
        y: 40 + Math.random() * (WORLD_HEIGHT * 0.45),
        width: 120 + Math.random() * 120,
        height: 28 + Math.random() * 32,
        speed: 0.12 + Math.random() * 0.24,
        alpha: 0.08 + Math.random() * 0.08,
      })
    }
  }

  private redraw(): void {
    this.fog.clear()
    this.fog.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.fog.fill({ color: 0xcbd5e1, alpha: 0.08 })

    this.clouds.clear()
    for (const puff of this.puffs) {
      this.clouds.ellipse(puff.x, puff.y, puff.width, puff.height)
      this.clouds.fill({ color: 0xe2e8f0, alpha: puff.alpha })
    }
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 16.67
    for (const puff of this.puffs) {
      puff.x += puff.speed * dt
      if (puff.x - puff.width > WORLD_WIDTH) {
        puff.x = -puff.width
      }
    }
    this.redraw()
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
