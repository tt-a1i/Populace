import { Container, Graphics } from 'pixi.js'

import { RainEffect } from './RainEffect'

const WORLD_WIDTH = 40 * 32
const WORLD_HEIGHT = 30 * 32
const LIGHTNING_INTERVAL_MIN = 2500
const LIGHTNING_INTERVAL_MAX = 6000

export class StormEffect {
  readonly container: Container
  private rain: RainEffect
  private overlay: Graphics
  private lightningFlash: Graphics
  private _nextLightning: number
  private _flashRemaining = 0

  constructor() {
    this.container = new Container()

    // Dark storm overlay
    this.overlay = new Graphics()
    this.overlay.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.overlay.fill({ color: 0x1a1a3e, alpha: 0.35 })

    // Rain (heavier than normal)
    this.rain = new RainEffect()
    this.rain.container.alpha = 0.80

    // Lightning flash layer
    this.lightningFlash = new Graphics()
    this.lightningFlash.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.lightningFlash.fill({ color: 0xffffff, alpha: 0 })

    this.container.addChild(this.overlay, this.rain.container, this.lightningFlash)

    this._nextLightning = this._randomInterval()
  }

  private _randomInterval(): number {
    return LIGHTNING_INTERVAL_MIN + Math.random() * (LIGHTNING_INTERVAL_MAX - LIGHTNING_INTERVAL_MIN)
  }

  update(deltaMs: number): void {
    this.rain.update(deltaMs)

    this._nextLightning -= deltaMs
    if (this._flashRemaining > 0) {
      this._flashRemaining -= deltaMs
      const t = Math.max(0, this._flashRemaining / 120)
      this.lightningFlash.clear()
      this.lightningFlash.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
      this.lightningFlash.fill({ color: 0xffffff, alpha: t * 0.55 })
    } else if (this._nextLightning <= 0) {
      // Trigger flash
      this._flashRemaining = 120
      this._nextLightning = this._randomInterval()
    }
  }

  destroy(): void {
    this.rain.destroy()
    this.container.destroy({ children: true })
  }
}
