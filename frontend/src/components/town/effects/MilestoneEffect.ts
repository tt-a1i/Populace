import { Container, Graphics } from 'pixi.js'

const EVENT_COLORS: Record<string, number> = {
  confession: 0xf472b6,
  best_friends: 0x34d399,
  public_argument: 0xef4444,
}

const DURATION_MS = 4000
const PARTICLE_COUNT = 12

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
}

export class MilestoneEffect {
  readonly container = new Container()
  private readonly graphics = new Graphics()
  private particles: Particle[] = []
  private elapsed = 0
  private readonly duration = DURATION_MS
  private readonly color: number
  private fromX: number
  private fromY: number
  private toX: number
  private toY: number
  done = false

  constructor(fromX: number, fromY: number, toX: number, toY: number, eventType: string) {
    this.fromX = fromX
    this.fromY = fromY
    this.toX = toX
    this.toY = toY
    this.color = EVENT_COLORS[eventType] ?? 0xfbbf24
    this.container.addChild(this.graphics)

    const dx = toX - fromX
    const dy = toY - fromY
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = Math.random()
      this.particles.push({
        x: fromX + dx * t,
        y: fromY + dy * t,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8 - 0.3,
        life: 0,
        maxLife: 1500 + Math.random() * 2000,
        size: 2 + Math.random() * 3,
      })
    }
  }

  update(deltaMs: number): void {
    this.elapsed += deltaMs
    if (this.elapsed >= this.duration) {
      this.done = true
      return
    }
    const progress = this.elapsed / this.duration
    const alpha = progress < 0.8 ? 1 : 1 - (progress - 0.8) / 0.2

    this.graphics.clear()
    this.graphics.moveTo(this.fromX, this.fromY)
    this.graphics.lineTo(this.toX, this.toY)
    this.graphics.stroke({ width: 2, color: this.color, alpha: alpha * 0.4 })

    for (const p of this.particles) {
      p.life += deltaMs
      if (p.life > p.maxLife) continue
      p.x += p.vx
      p.y += p.vy
      const pAlpha = alpha * (1 - p.life / p.maxLife)
      this.graphics.circle(p.x, p.y, p.size)
      this.graphics.fill({ color: this.color, alpha: pAlpha })
    }
  }

  destroy(): void {
    this.container.removeChildren()
    this.graphics.destroy()
  }
}
