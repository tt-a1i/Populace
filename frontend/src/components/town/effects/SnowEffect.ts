import { Container, Graphics } from 'pixi.js'

interface Snowflake {
  x: number
  y: number
  speed: number
  radius: number
  drift: number
  phase: number
  alpha: number
  graphic: Graphics
}

const WORLD_WIDTH = 40 * 32
const WORLD_HEIGHT = 30 * 32
const FLAKE_COUNT = 40

export class SnowEffect {
  readonly container: Container
  private flakes: Snowflake[] = []

  constructor() {
    this.container = new Container()
    this.container.alpha = 0.7
    this._spawnFlakes()
  }

  private _spawnFlakes(): void {
    for (let i = 0; i < FLAKE_COUNT; i++) {
      const g = new Graphics()
      const flake: Snowflake = {
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * WORLD_HEIGHT,
        speed: 0.8 + Math.random() * 1.2,
        radius: 1.5 + Math.random() * 2.5,
        drift: (Math.random() - 0.5) * 0.8,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.5 + Math.random() * 0.4,
        graphic: g,
      }
      this._drawFlake(flake)
      this.container.addChild(g)
      this.flakes.push(flake)
    }
  }

  private _drawFlake(flake: Snowflake): void {
    flake.graphic.clear()
    flake.graphic.circle(flake.x, flake.y, flake.radius)
    flake.graphic.fill({ color: 0xffffff, alpha: flake.alpha })
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 16.67
    for (const flake of this.flakes) {
      flake.phase += 0.02 * dt
      flake.y += flake.speed * dt
      flake.x += flake.drift * dt + Math.sin(flake.phase) * 0.3
      if (flake.y > WORLD_HEIGHT + flake.radius) {
        flake.y = -flake.radius
        flake.x = Math.random() * WORLD_WIDTH
      }
      this._drawFlake(flake)
    }
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
