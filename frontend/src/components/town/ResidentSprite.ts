import { Container, Graphics, Text, type FederatedPointerEvent } from 'pixi.js'

import type { ResidentPosition, ResidentStatus, SimulationSpeed } from '../../stores/simulation'

const TILE_SIZE = 32
const HALF_TILE = TILE_SIZE / 2
const DOUBLE_TAP_MS = 280
const DIALOGUE_DURATION_MS = 3000
const FALLBACK_SKIN_COLORS = [0xf2d3b1, 0xe5b887, 0xd39a6a, 0xb97c52, 0x8a5a3c, 0x5c3a27]
const FALLBACK_HAIR_COLORS = [0x1f2937, 0x5b4636, 0x8b5a2b, 0xd4a373, 0xc084fc, 0xf8fafc]
const FALLBACK_OUTFIT_COLORS = [0x2563eb, 0x059669, 0xdc2626, 0xd97706, 0x7c3aed, 0xdb2777, 0x0f766e, 0x4b5563]
const FALLBACK_HAIR_STYLES = ['short', 'long', 'spiky', 'bald', 'ponytail'] as const

type HairStyle = (typeof FALLBACK_HAIR_STYLES)[number]

interface ResidentAppearance {
  skinColor: number
  hairStyle: HairStyle
  hairColor: number
  outfitColor: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3
}

function checksum(value: string): number {
  return [...value].reduce((total, char) => total + char.charCodeAt(0), 0)
}

function hexToNumber(value: string | null | undefined, fallback: number): number {
  if (!value) {
    return fallback
  }

  const normalized = value.startsWith('#') ? value.slice(1) : value
  const parsed = Number.parseInt(normalized, 16)
  return Number.isNaN(parsed) ? fallback : parsed
}

function normalizeHairStyle(value: string | null | undefined, residentId: string): HairStyle {
  if (value && FALLBACK_HAIR_STYLES.includes(value as HairStyle)) {
    return value as HairStyle
  }

  return FALLBACK_HAIR_STYLES[checksum(`${residentId}-hair-style`) % FALLBACK_HAIR_STYLES.length]
}

function resolveAppearance(resident: ResidentPosition): ResidentAppearance {
  const identitySeed = checksum(resident.id)
  const fallbackOutfit = resident.color || FALLBACK_OUTFIT_COLORS[identitySeed % FALLBACK_OUTFIT_COLORS.length]

  return {
    skinColor: hexToNumber(
      resident.skinColor,
      FALLBACK_SKIN_COLORS[checksum(`${resident.id}-skin`) % FALLBACK_SKIN_COLORS.length],
    ),
    hairStyle: normalizeHairStyle(resident.hairStyle, resident.id),
    hairColor: hexToNumber(
      resident.hairColor,
      FALLBACK_HAIR_COLORS[checksum(`${resident.id}-hair-color`) % FALLBACK_HAIR_COLORS.length],
    ),
    outfitColor: hexToNumber(
      resident.outfitColor,
      fallbackOutfit,
    ),
  }
}

function appearanceSignature(appearance: ResidentAppearance): string {
  return [
    appearance.skinColor,
    appearance.hairStyle,
    appearance.hairColor,
    appearance.outfitColor,
  ].join(':')
}

function movementDuration(distancePx: number, speed: SimulationSpeed): number {
  const distanceTiles = distancePx / TILE_SIZE
  const baseDuration = 220 + distanceTiles * 120
  const speedFactor = speed >= 5 ? 2.4 : speed >= 2 ? 1.55 : 1
  return clamp(baseDuration / speedFactor, 100, speed >= 5 ? 220 : 480)
}

function statusIconFor(status: ResidentStatus): string | null {
  switch (status) {
    case 'chatting':
      return '💬'
    case 'thinking':
      return '💭'
    default:
      return null
  }
}

interface ResidentSpriteOptions {
  onFocusRequest?: (residentId: string) => void
  onSelectRequest?: (residentId: string) => void
}

export class ResidentSprite extends Container {
  residentId: string

  private readonly highlightGlow = new Graphics()
  private readonly body = new Graphics()
  private readonly emotionAccent = new Graphics()
  private readonly shadow = new Graphics()
  private readonly bubble = new Container()
  private readonly bubbleBackground = new Graphics()
  private readonly bubbleLabel: Text
  // Thought bubble — violet/purple tint, shown when agent has a current_goal
  private readonly thoughtBubble = new Container()
  private readonly thoughtBackground = new Graphics()
  private readonly thoughtLabel: Text
  // Low-energy warning icon — shown when energy < 0.2
  private readonly energyWarning = new Container()
  private readonly energyWarningLabel: Text

  private readonly nameLabel: Text
  private onFocusRequest?: (residentId: string) => void
  private onSelectRequest?: (residentId: string) => void

  private currentAppearance: ResidentAppearance
  private currentAppearanceSignature: string
  private currentStatus: ResidentStatus
  private bobTime = 0
  private moveFromX = 0
  private moveFromY = 0
  private targetX = 0
  private targetY = 0
  private moveElapsed = 0
  private moveDuration = 0
  private simulationSpeed: SimulationSpeed = 1
  private lastTapAt = 0
  private dialogueUntil = 0
  private externalHighlight = false
  private highlightPulse = 0

  constructor(resident: ResidentPosition, options: ResidentSpriteOptions = {}) {
    super()

    this.residentId = resident.id
    this.currentAppearance = resolveAppearance(resident)
    this.currentAppearanceSignature = appearanceSignature(this.currentAppearance)
    this.currentStatus = resident.status
    this.onFocusRequest = options.onFocusRequest
    this.onSelectRequest = options.onSelectRequest
    this.sortableChildren = true
    this.eventMode = 'static'
    this.cursor = 'pointer'

    this.shadow.ellipse(0, 22, 10.5, 4.8).fill({ color: 0x020617, alpha: 0.42 })
    this.highlightGlow.zIndex = 1
    this.redrawAvatar()

    this.nameLabel = new Text({
      text: resident.name,
      anchor: { x: 0.5, y: 0 },
      style: {
        fill: 0xf8fafc,
        fontFamily: 'Avenir Next, Helvetica Neue, sans-serif',
        fontSize: 11,
        fontWeight: '600',
        stroke: { color: 0x0f172a, width: 3 },
      },
    })
    this.nameLabel.y = 25
    this.nameLabel.zIndex = 4

    this.bubbleLabel = new Text({
      text: '',
      anchor: { x: 0.5, y: 0.5 },
      style: {
        fill: 0x0f172a,
        fontFamily: 'Avenir Next, Helvetica Neue, sans-serif',
        fontSize: 11,
        fontWeight: '700',
        stroke: { color: 0xffffff, width: 0 },
        wordWrap: true,
        wordWrapWidth: 128,
      },
    })

    this.bubble.addChild(this.bubbleBackground, this.bubbleLabel)
    this.bubble.position.set(0, -28)
    this.bubble.zIndex = 5

    // Thought bubble — sits above dialogue bubble, lighter violet tint
    this.thoughtLabel = new Text({
      text: '',
      anchor: { x: 0.5, y: 0.5 },
      style: {
        fill: 0x1e1b4b,
        fontFamily: 'Avenir Next, Helvetica Neue, sans-serif',
        fontSize: 10,
        fontWeight: '600',
        wordWrap: true,
        wordWrapWidth: 100,
      },
    })
    this.thoughtBubble.addChild(this.thoughtBackground, this.thoughtLabel)
    this.thoughtBubble.position.set(0, -44)
    this.thoughtBubble.zIndex = 4
    this.thoughtBubble.visible = false

    // Low-energy warning icon
    this.energyWarningLabel = new Text({
      text: '⚡',
      anchor: { x: 0.5, y: 0.5 },
      style: {
        fontSize: 13,
        fontFamily: 'Avenir Next, Helvetica Neue, sans-serif',
      },
    })
    this.energyWarning.addChild(this.energyWarningLabel)
    this.energyWarning.position.set(12, -20)
    this.energyWarning.zIndex = 6
    this.energyWarning.visible = false

    this.addChild(this.shadow, this.highlightGlow, this.body, this.emotionAccent, this.thoughtBubble, this.bubble, this.energyWarning, this.nameLabel)
    this.on('pointertap', this.handlePointerTap)

    this.applyResident(resident, true)
  }

  reuse(resident: ResidentPosition, options: ResidentSpriteOptions = {}): void {
    this.residentId = resident.id
    this.onFocusRequest = options.onFocusRequest
    this.onSelectRequest = options.onSelectRequest
    this.lastTapAt = 0
    this.dialogueUntil = 0
    this.externalHighlight = false
    this.highlightPulse = 0
    this.bobTime = 0
    this.renderBubble(null)
    this.highlightGlow.visible = false
    this.alpha = 1
    this.visible = true
    this.applyResident(resident, true)
  }

  prepareForPool(): void {
    this.dialogueUntil = 0
    this.externalHighlight = false
    this.highlightPulse = 0
    this.bobTime = 0
    this.renderBubble(null)
    this.highlightGlow.visible = false
    this.visible = false
  }

  applyResident(resident: ResidentPosition, immediate = false): void {
    const nextAppearance = resolveAppearance(resident)
    const nextSignature = appearanceSignature(nextAppearance)
    const appearanceChanged = nextSignature !== this.currentAppearanceSignature
    const statusChanged = resident.status !== this.currentStatus

    if (appearanceChanged) {
      this.currentAppearance = nextAppearance
      this.currentAppearanceSignature = nextSignature
      this.redrawAvatar()
    }

    this.currentStatus = resident.status
    if (statusChanged || appearanceChanged) {
      this.renderEmotionAccent()
    }
    this.nameLabel.text = resident.name
    this.moveTo(resident.targetX, resident.targetY, immediate)
    this.updateStatus(resident.status, resident.dialogueText)
    this.updateGoal(resident.currentGoal)
    this.updateEnergy(resident.energy)
  }

  setSimulationSpeed(speed: SimulationSpeed): void {
    this.simulationSpeed = speed
  }

  setExternalHighlight(active: boolean): void {
    this.externalHighlight = active
    if (!active) {
      this.highlightGlow.visible = false
    }
  }

  moveTo(tileX: number, tileY: number, immediate = false): void {
    const nextTargetX = tileX * TILE_SIZE + HALF_TILE
    const nextTargetY = tileY * TILE_SIZE + HALF_TILE

    if (this.targetX === nextTargetX && this.targetY === nextTargetY && !immediate) {
      return
    }

    this.targetX = nextTargetX
    this.targetY = nextTargetY

    if (immediate) {
      this.position.set(this.targetX, this.targetY)
      this.moveFromX = this.targetX
      this.moveFromY = this.targetY
      this.moveElapsed = 0
      this.moveDuration = 0
      this.zIndex = this.y
      return
    }

    this.moveFromX = this.x
    this.moveFromY = this.y
    this.moveElapsed = 0
    this.moveDuration = movementDuration(
      Math.hypot(this.targetX - this.moveFromX, this.targetY - this.moveFromY),
      this.simulationSpeed,
    )
  }

  showDialogue(text: string): void {
    this.dialogueUntil = performance.now() + DIALOGUE_DURATION_MS
    this.renderBubble(text)
  }

  /** Show or hide the low-energy warning icon based on energy level. */
  updateEnergy(energy: number | null | undefined): void {
    this.energyWarning.visible = energy != null && energy < 0.2
  }

  /** Update the thought bubble with the agent's current short-term goal. */
  updateGoal(goal: string | null | undefined): void {
    const text = goal ? goal.slice(0, 10) : null
    this._renderThoughtBubble(text)
  }

  updateStatus(status: ResidentStatus, dialogueText?: string | null): void {
    this.currentStatus = status

    if (dialogueText) {
      this.showDialogue(dialogueText)
      return
    }

    if (this.dialogueUntil > performance.now()) {
      return
    }

    const icon = statusIconFor(status)
    this.renderBubble(icon)
  }

  update(deltaMs: number): void {
    if (this.moveElapsed < this.moveDuration) {
      this.moveElapsed = Math.min(this.moveDuration, this.moveElapsed + deltaMs)
      const progress = this.moveDuration === 0 ? 1 : this.moveElapsed / this.moveDuration
      const eased = easeOutCubic(progress)
      this.x = this.moveFromX + (this.targetX - this.moveFromX) * eased
      this.y = this.moveFromY + (this.targetY - this.moveFromY) * eased
    } else {
      this.position.set(this.targetX, this.targetY)
    }

    this.zIndex = this.y

    if (this.dialogueUntil > 0 && performance.now() >= this.dialogueUntil) {
      this.dialogueUntil = 0
      this.renderBubble(statusIconFor(this.currentStatus))
    }

    if (this.bubble.visible) {
      this.bobTime += deltaMs
      this.bubble.y = -22 + Math.sin(this.bobTime / 180) * 2
    }

    if (this.externalHighlight) {
      this.highlightPulse += deltaMs
      const pulse = 0.45 + (Math.sin(this.highlightPulse / 140) + 1) * 0.2
      this.renderHighlightGlow(pulse)
    } else if (this.highlightGlow.visible) {
      this.highlightGlow.visible = false
    }
  }

  override destroy(options?: boolean | Parameters<Container['destroy']>[0]): void {
    this.off('pointertap', this.handlePointerTap)
    super.destroy(options)
  }

  private readonly handlePointerTap = (event: FederatedPointerEvent): void => {
    event.stopPropagation()

    const now = performance.now()

    this.onSelectRequest?.(this.residentId)

    if (now - this.lastTapAt <= DOUBLE_TAP_MS) {
      this.onFocusRequest?.(this.residentId)
      this.lastTapAt = 0
      return
    }

    this.lastTapAt = now
  }

  private renderBubble(content: string | null): void {
    if (!content) {
      this.bubble.visible = false
      return
    }

    this.bubble.visible = true
    this.bubbleLabel.text = content

    const width = Math.max(28, Math.min(142, this.bubbleLabel.width + 20))
    const height = Math.max(22, this.bubbleLabel.height + 12)

    this.bubbleBackground.clear()
    this.bubbleBackground.roundRect(-width / 2, -height / 2, width, height, 10).fill({
      color: 0xf8fafc,
      alpha: 0.94,
    })
    this.bubbleBackground.stroke({ color: 0x0f172a, alpha: 0.18, width: 1 })
    this.bubbleBackground.moveTo(-4, height / 2 - 1)
    this.bubbleBackground.lineTo(0, height / 2 + 7)
    this.bubbleBackground.lineTo(5, height / 2 - 1)
    this.bubbleBackground.fill({ color: 0xf8fafc, alpha: 0.94 })
  }

  /** Render the thought bubble (violet tint) with a small cloud-style pointer. */
  private _renderThoughtBubble(content: string | null): void {
    if (!content) {
      this.thoughtBubble.visible = false
      return
    }
    this.thoughtBubble.visible = true
    this.thoughtLabel.text = `💭 ${content}`

    const width = Math.max(32, Math.min(120, this.thoughtLabel.width + 16))
    const height = Math.max(20, this.thoughtLabel.height + 10)

    this.thoughtBackground.clear()
    // Soft violet bubble
    this.thoughtBackground.roundRect(-width / 2, -height / 2, width, height, 9).fill({
      color: 0xede9fe,
      alpha: 0.92,
    })
    this.thoughtBackground.stroke({ color: 0x7c3aed, alpha: 0.30, width: 1 })
    // Small cloud dots pointing down
    this.thoughtBackground.circle(0, height / 2 + 3, 2).fill({ color: 0xede9fe, alpha: 0.85 })
    this.thoughtBackground.circle(2, height / 2 + 6, 1.5).fill({ color: 0xede9fe, alpha: 0.65 })
  }

  private redrawAvatar(): void {
    this.body.clear()
    const { outfitColor, skinColor } = this.currentAppearance

    this.body.roundRect(-8, -2, 16, 12, 4).fill({ color: outfitColor })
    this.body.roundRect(-7, 9, 14, 5, 2).fill({ color: 0x0f172a, alpha: 0.14 })
    this.body.rect(-8, 0, 2, 10).fill({ color: this.mixColor(outfitColor, 0xffffff, 0.18) })
    this.body.rect(6, 0, 2, 10).fill({ color: this.mixColor(outfitColor, 0x020617, 0.18) })
    this.body.rect(-6, 14, 4, 8).fill({ color: this.mixColor(outfitColor, 0x020617, 0.1) })
    this.body.rect(2, 14, 4, 8).fill({ color: this.mixColor(outfitColor, 0x020617, 0.1) })
    this.body.rect(-7, 22, 4, 2).fill({ color: 0x1f2937 })
    this.body.rect(3, 22, 4, 2).fill({ color: 0x1f2937 })

    this.body.circle(0, -11, 5).fill({ color: skinColor })
    this.body.stroke({ color: 0x0f172a, alpha: 0.28, width: 1 })

    this.drawHair()
    this.body.rect(-3, -12, 2, 2).fill({ color: 0x111827 })
    this.body.rect(1, -12, 2, 2).fill({ color: 0x111827 })
    this.body.rect(-1, -8, 2, 1).fill({ color: this.mixColor(skinColor, 0x111827, 0.45) })
    this.body.zIndex = 2
    this.renderEmotionAccent()
  }

  private renderHighlightGlow(alpha: number): void {
    this.highlightGlow.visible = true
    this.highlightGlow.clear()
    this.highlightGlow.roundRect(-12, -18, 24, 44, 9).fill({ color: 0xfde68a, alpha: alpha * 0.15 })
    this.highlightGlow.stroke({ color: 0xfef08a, alpha, width: 2.6 })
  }

  private drawHair(): void {
    const { hairStyle, hairColor } = this.currentAppearance

    switch (hairStyle) {
      case 'short':
        this.body.roundRect(-5, -16, 10, 5, 3).fill({ color: hairColor })
        this.body.rect(-5, -13, 2, 3).fill({ color: hairColor })
        this.body.rect(3, -13, 2, 3).fill({ color: hairColor })
        break
      case 'long':
        this.body.roundRect(-5, -16, 10, 8, 4).fill({ color: hairColor })
        this.body.rect(-5, -9, 2, 6).fill({ color: hairColor })
        this.body.rect(3, -9, 2, 6).fill({ color: hairColor })
        break
      case 'spiky':
        this.body.moveTo(-5, -11)
        this.body.lineTo(-4, -17)
        this.body.lineTo(-1, -12)
        this.body.lineTo(0, -18)
        this.body.lineTo(2, -12)
        this.body.lineTo(5, -17)
        this.body.lineTo(5, -11)
        this.body.fill({ color: hairColor })
        break
      case 'ponytail':
        this.body.roundRect(-5, -16, 10, 5, 3).fill({ color: hairColor })
        this.body.rect(4, -12, 3, 8).fill({ color: hairColor })
        this.body.circle(5.5, -3, 2.2).fill({ color: hairColor })
        break
      case 'bald':
      default:
        break
    }
  }

  private renderEmotionAccent(): void {
    this.emotionAccent.clear()
    this.emotionAccent.zIndex = 3

    switch (this.currentStatus) {
      case 'happy':
        this.emotionAccent.circle(-2.6, -21, 2.3).fill({ color: 0xfb7185, alpha: 0.95 })
        this.emotionAccent.circle(2.6, -21, 2.3).fill({ color: 0xfb7185, alpha: 0.95 })
        this.emotionAccent.moveTo(-5.6, -20.2)
        this.emotionAccent.lineTo(0, -13)
        this.emotionAccent.lineTo(5.6, -20.2)
        this.emotionAccent.fill({ color: 0xfb7185, alpha: 0.95 })
        break
      case 'angry':
        this.emotionAccent.circle(0, -11, 5.2).fill({ color: 0xef4444, alpha: 0.16 })
        this.emotionAccent.rect(-4, -15, 3, 1).fill({ color: 0x7f1d1d, alpha: 0.9 })
        this.emotionAccent.rect(1, -15, 3, 1).fill({ color: 0x7f1d1d, alpha: 0.9 })
        break
      case 'sad':
        this.emotionAccent.circle(3.8, -8.8, 1.4).fill({ color: 0x60a5fa, alpha: 0.95 })
        this.emotionAccent.moveTo(3.8, -6.8)
        this.emotionAccent.lineTo(2.7, -3.5)
        this.emotionAccent.lineTo(4.9, -3.5)
        this.emotionAccent.fill({ color: 0x60a5fa, alpha: 0.95 })
        break
      default:
        break
    }
  }

  private mixColor(base: number, overlay: number, ratio: number): number {
    const clampedRatio = clamp(ratio, 0, 1)
    const baseR = (base >> 16) & 0xff
    const baseG = (base >> 8) & 0xff
    const baseB = base & 0xff
    const overlayR = (overlay >> 16) & 0xff
    const overlayG = (overlay >> 8) & 0xff
    const overlayB = overlay & 0xff

    const mixedR = Math.round(baseR * (1 - clampedRatio) + overlayR * clampedRatio)
    const mixedG = Math.round(baseG * (1 - clampedRatio) + overlayG * clampedRatio)
    const mixedB = Math.round(baseB * (1 - clampedRatio) + overlayB * clampedRatio)

    return (mixedR << 16) + (mixedG << 8) + mixedB
  }
}
