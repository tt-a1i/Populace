import { Container, Graphics, Text, type FederatedPointerEvent } from 'pixi.js'

import type { ResidentPosition, ResidentStatus, SimulationSpeed } from '../../stores/simulation'
import { OCCUPATION_OUTLINE_COLOR } from './visuals'

const TILE_SIZE = 32
const HALF_TILE = TILE_SIZE / 2
const DOUBLE_TAP_MS = 280
const DIALOGUE_DURATION_MS = 3000

type DialogueKind = 'dialogue' | 'gossip' | 'monologue'

const BUBBLE_STYLE: Record<DialogueKind, { fill: number; textFill: number; prefix: string }> = {
  dialogue: { fill: 0xffffff, textFill: 0x0f172a, prefix: '' },
  gossip: { fill: 0xf3e8ff, textFill: 0x7c3aed, prefix: '\u{1F442} ' },
  monologue: { fill: 0xeff6ff, textFill: 0x6b7280, prefix: '\u{1F4AD} ' },
}

const MOOD_EMOJI: Record<string, string> = {
  happy: '\u{1F60A}', excited: '\u{1F929}', ecstatic: '\u{1F929}',
  sad: '\u{1F622}', angry: '\u{1F621}', fearful: '\u{1F628}', tired: '\u{1F634}',
  calm: '', content: '', neutral: '',
}

const OCCUPATION_ICON: Record<string, string> = {
  barista: '\u2615', teacher: '\u{1F4DA}', shopkeeper: '\u{1F6D2}', unemployed: '',
}
const FALLBACK_SKIN_COLORS = [0xf2d3b1, 0xe5b887, 0xd39a6a, 0xb97c52, 0x8a5a3c, 0x5c3a27]
const FALLBACK_HAIR_COLORS = [0x1f2937, 0x5b4636, 0x8b5a2b, 0xd4a373, 0xc084fc, 0xf8fafc]
const FALLBACK_OUTFIT_COLORS = [0x2563eb, 0x059669, 0xdc2626, 0xd97706, 0x7c3aed, 0xdb2777, 0x0f766e, 0x4b5563]
const FALLBACK_HAIR_STYLES = ['short', 'long', 'spiky', 'bald', 'ponytail'] as const
const FASHION_ACCENT_COLOR: Record<string, number> = {
  work: 0x94a3b8,
  formal: 0xf59e0b,
  casual: 0x22d3ee,
  festive: 0xf472b6,
}

type HairStyle = (typeof FALLBACK_HAIR_STYLES)[number]

interface ResidentAppearance {
  skinColor: number
  hairStyle: HairStyle
  hairColor: number
  outfitColor: number
  fashionAccent: number
  styleScore: number
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
  const clothing = resident.appearance?.clothing ?? 'casual'
  const styleScore = clamp(resident.appearance?.style_score ?? 0.35, 0, 1)

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
    fashionAccent: FASHION_ACCENT_COLOR[clothing] ?? 0x22d3ee,
    styleScore,
  }
}

function appearanceSignature(appearance: ResidentAppearance): string {
  return [
    appearance.skinColor,
    appearance.hairStyle,
    appearance.hairColor,
    appearance.outfitColor,
    appearance.fashionAccent,
    appearance.styleScore,
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

export interface ResidentHoverInfo {
  residentId: string
  name: string
  occupation: string
  mood: string
  energy: number
  worldX: number
  worldY: number
}

interface ResidentSpriteOptions {
  onFocusRequest?: (residentId: string) => void
  onSelectRequest?: (residentId: string) => void
  onHoverStart?: (info: ResidentHoverInfo) => void
  onHoverEnd?: (residentId: string) => void
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
  // Mood emoji — displayed above the sprite head
  private readonly moodEmoji: Text
  // Occupation badge — small icon at bottom-right of sprite
  private readonly occupationBadge: Text
  // Energy bar — horizontal bar below the sprite body
  private readonly energyBar = new Graphics()

  private readonly nameLabel: Text
  private onFocusRequest?: (residentId: string) => void
  private onSelectRequest?: (residentId: string) => void
  private onHoverStart?: (info: ResidentHoverInfo) => void
  private onHoverEnd?: (residentId: string) => void

  private currentAppearance: ResidentAppearance
  private currentAppearanceSignature: string
  private currentStatus: ResidentStatus
  private currentOccupation = ''
  private currentMood = ''
  private currentEnergy = 1
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
  private currentBubbleKind: DialogueKind = 'dialogue'
  // Animation timers
  private walkSwayTime = 0
  private idleBlinkTimer = 0
  private idleBlinkCooldown = 2000 + Math.random() * 3000 // stagger per-resident
  private moodFloatTime = 0
  private sleepZzzTime = 0

  constructor(resident: ResidentPosition, options: ResidentSpriteOptions = {}) {
    super()

    this.residentId = resident.id
    this.currentAppearance = resolveAppearance(resident)
    this.currentAppearanceSignature = appearanceSignature(this.currentAppearance)
    this.currentStatus = resident.status
    this.onFocusRequest = options.onFocusRequest
    this.onSelectRequest = options.onSelectRequest
    this.onHoverStart = options.onHoverStart
    this.onHoverEnd = options.onHoverEnd
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

    // Mood emoji — above the sprite head
    this.moodEmoji = new Text({
      text: '',
      anchor: { x: 0.5, y: 0.5 },
      style: {
        fontSize: 10,
        fontFamily: 'Avenir Next, Helvetica Neue, sans-serif',
      },
    })
    this.moodEmoji.y = -34
    this.moodEmoji.zIndex = 5
    this.moodEmoji.visible = false

    // Occupation badge — bottom-right of sprite
    this.occupationBadge = new Text({
      text: '',
      anchor: { x: 0.5, y: 0.5 },
      style: {
        fontSize: 8,
        fontFamily: 'Avenir Next, Helvetica Neue, sans-serif',
      },
    })
    this.occupationBadge.position.set(8, 8)
    this.occupationBadge.zIndex = 5
    this.occupationBadge.visible = false

    // Energy bar — below the sprite body
    this.energyBar.zIndex = 4
    this.energyBar.y = 14
    this.energyBar.visible = false

    this.addChild(this.shadow, this.highlightGlow, this.body, this.emotionAccent, this.thoughtBubble, this.bubble, this.energyWarning, this.moodEmoji, this.occupationBadge, this.energyBar, this.nameLabel)
    this.on('pointertap', this.handlePointerTap)
    this.on('pointerenter', this.handlePointerEnter)
    this.on('pointerleave', this.handlePointerLeave)

    this.applyResident(resident, true)
  }

  reuse(resident: ResidentPosition, options: ResidentSpriteOptions = {}): void {
    this.residentId = resident.id
    this.onFocusRequest = options.onFocusRequest
    this.onSelectRequest = options.onSelectRequest
    this.onHoverStart = options.onHoverStart
    this.onHoverEnd = options.onHoverEnd
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
    }

    this.currentStatus = resident.status
    const occChanged = (resident.occupation ?? '') !== this.currentOccupation
    this.currentOccupation = resident.occupation ?? ''

    if (appearanceChanged || occChanged) {
      this.redrawAvatar()
    }
    if (statusChanged || appearanceChanged) {
      this.renderEmotionAccent()
    }
    this.nameLabel.text = resident.name
    this.moveTo(resident.targetX, resident.targetY, immediate)
    this.updateStatus(resident.status, resident.dialogueText, resident.dialogueKind)
    this.updateGoal(resident.currentGoal)
    this.updateEnergy(resident.energy)

    // Mood emoji
    this.currentMood = resident.mood ?? ''
    const moodText = MOOD_EMOJI[this.currentMood] ?? ''
    this.moodEmoji.text = moodText
    this.moodEmoji.visible = moodText.length > 0

    // Energy
    this.currentEnergy = resident.energy ?? 1

    // Occupation badge
    const occIcon = OCCUPATION_ICON[resident.occupation ?? ''] ?? ''
    this.occupationBadge.text = occIcon
    this.occupationBadge.visible = occIcon.length > 0
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

  showDialogue(text: string, kind: DialogueKind = 'dialogue'): void {
    this.currentBubbleKind = kind
    this.dialogueUntil = performance.now() + DIALOGUE_DURATION_MS
    this.renderBubble(text)
  }

  /** Show or hide the low-energy warning icon and energy bar based on energy level. */
  updateEnergy(energy: number | null | undefined): void {
    this.energyWarning.visible = energy != null && energy < 0.2

    if (energy == null) {
      this.energyBar.visible = false
      return
    }

    this.energyBar.visible = true
    const clamped = clamp(energy, 0, 1)
    const barWidth = 20
    const barHeight = 3
    const fillWidth = clamped * barWidth
    const fillColor = clamped > 0.5 ? 0x22c55e : clamped > 0.2 ? 0xeab308 : 0xef4444

    this.energyBar.clear()
    // Background
    this.energyBar.roundRect(-barWidth / 2, 0, barWidth, barHeight, 1).fill({ color: 0x374151, alpha: 0.5 })
    // Fill
    if (fillWidth > 0) {
      this.energyBar.roundRect(-barWidth / 2, 0, fillWidth, barHeight, 1).fill({ color: fillColor })
    }
  }

  /** Update the thought bubble with the agent's current short-term goal. */
  updateGoal(goal: string | null | undefined): void {
    const text = goal ? goal.slice(0, 10) : null
    this._renderThoughtBubble(text)
  }

  updateStatus(status: ResidentStatus, dialogueText?: string | null, dialogueKind?: DialogueKind): void {
    this.currentStatus = status

    if (dialogueText) {
      this.showDialogue(dialogueText, dialogueKind ?? 'dialogue')
      return
    }

    if (this.dialogueUntil > performance.now()) {
      return
    }

    this.currentBubbleKind = 'dialogue'
    const icon = statusIconFor(status)
    this.renderBubble(icon)
  }

  update(deltaMs: number): void {
    const isMoving = this.moveElapsed < this.moveDuration
    const isLowEnergy = this.currentEnergy < 0.2

    // ── Movement with low-energy slowdown ──
    if (isMoving) {
      const energyFactor = isLowEnergy ? 0.6 : 1
      this.moveElapsed = Math.min(this.moveDuration, this.moveElapsed + deltaMs * energyFactor)
      const progress = this.moveDuration === 0 ? 1 : this.moveElapsed / this.moveDuration
      const eased = easeOutCubic(progress)
      this.x = this.moveFromX + (this.targetX - this.moveFromX) * eased
      this.y = this.moveFromY + (this.targetY - this.moveFromY) * eased
    } else {
      this.position.set(this.targetX, this.targetY)
    }

    this.zIndex = this.y

    // ── Walking body sway ──
    if (isMoving) {
      this.walkSwayTime += deltaMs
      const sway = Math.sin(this.walkSwayTime / 80) * 1.5
      this.body.rotation = sway * 0.04
      // Low energy: lean forward
      if (isLowEnergy) {
        this.body.rotation += 0.08
      }
    } else {
      this.walkSwayTime = 0
      this.body.rotation = 0
    }

    // ── Idle blink animation ──
    if (!isMoving && this.currentStatus !== 'chatting') {
      this.idleBlinkTimer += deltaMs
      if (this.idleBlinkTimer >= this.idleBlinkCooldown) {
        // Brief squint — flatten body scaleY for 120ms
        const blinkPhase = this.idleBlinkTimer - this.idleBlinkCooldown
        if (blinkPhase < 120) {
          const t = blinkPhase / 120
          const squint = t < 0.5 ? t * 2 : 2 - t * 2
          this.body.scale.y = 1 - squint * 0.08
        } else {
          this.body.scale.y = 1
          this.idleBlinkTimer = 0
          this.idleBlinkCooldown = 2000 + Math.random() * 3000
        }
      } else {
        this.body.scale.y = 1
      }
    } else {
      this.body.scale.y = 1
      this.idleBlinkTimer = 0
    }

    // ── Mood emoji floating bob ──
    if (this.moodEmoji.visible) {
      this.moodFloatTime += deltaMs
      this.moodEmoji.y = -34 + Math.sin(this.moodFloatTime / 400) * 2
    } else {
      this.moodFloatTime = 0
    }

    // ── Sleep Zzz for tired mood ──
    if (this.currentMood === 'tired' && !isMoving) {
      this.sleepZzzTime += deltaMs
      if (!this.bubble.visible || this.dialogueUntil === 0) {
        const zzzPhase = Math.floor(this.sleepZzzTime / 800) % 3
        const zzzText = 'z'.repeat(zzzPhase + 1)
        this.renderBubble(zzzText)
        this.bubble.alpha = 0.6
      }
    } else {
      this.sleepZzzTime = 0
      if (this.bubble.visible && this.dialogueUntil === 0) {
        this.bubble.alpha = 1
      }
    }

    // ── Dialogue expiry ──
    if (this.dialogueUntil > 0 && performance.now() >= this.dialogueUntil) {
      this.dialogueUntil = 0
      this.currentBubbleKind = 'dialogue'
      this.renderBubble(statusIconFor(this.currentStatus))
    }

    // ── Bubble bob ──
    if (this.bubble.visible) {
      this.bobTime += deltaMs
      this.bubble.y = -22 + Math.sin(this.bobTime / 180) * 2
    }

    // ── Highlight glow pulse ──
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

  private readonly handlePointerEnter = (): void => {
    this.onHoverStart?.({
      residentId: this.residentId,
      name: this.nameLabel.text,
      occupation: this.currentOccupation,
      mood: this.currentMood,
      energy: this.currentEnergy,
      worldX: this.x,
      worldY: this.y,
    })
  }

  private readonly handlePointerLeave = (): void => {
    this.onHoverEnd?.(this.residentId)
  }

  private renderBubble(content: string | null): void {
    if (!content) {
      this.bubble.visible = false
      return
    }

    const style = BUBBLE_STYLE[this.currentBubbleKind] ?? BUBBLE_STYLE.dialogue
    const displayText = style.prefix + content

    this.bubble.visible = true
    this.bubbleLabel.text = displayText
    this.bubbleLabel.style.fill = style.textFill

    const paddingX = 14
    const paddingY = 8
    const width = Math.max(32, Math.min(148, this.bubbleLabel.width + paddingX * 2))
    const height = Math.max(24, this.bubbleLabel.height + paddingY * 2)
    const radius = Math.min(12, height / 2)

    this.bubbleBackground.clear()

    // Drop shadow
    this.bubbleBackground
      .roundRect(-width / 2 + 1, -height / 2 + 2, width, height, radius)
      .fill({ color: 0x000000, alpha: 0.12 })

    // Main bubble body
    this.bubbleBackground
      .roundRect(-width / 2, -height / 2, width, height, radius)
      .fill({ color: style.fill, alpha: 0.96 })

    // Subtle border
    this.bubbleBackground
      .roundRect(-width / 2, -height / 2, width, height, radius)
      .stroke({ color: 0x0f172a, alpha: 0.12, width: 1 })

    // Triangle arrow pointing down
    this.bubbleBackground.moveTo(-5, height / 2 - 1)
    this.bubbleBackground.lineTo(0, height / 2 + 8)
    this.bubbleBackground.lineTo(6, height / 2 - 1)
    this.bubbleBackground.fill({ color: style.fill, alpha: 0.96 })
  }

  /** Render the thought bubble (purple cloud shape) with cloud-dot pointer. */
  private _renderThoughtBubble(content: string | null): void {
    if (!content) {
      this.thoughtBubble.visible = false
      return
    }
    this.thoughtBubble.visible = true
    this.thoughtLabel.text = `💭 ${content}`

    const paddingX = 10
    const paddingY = 7
    const width = Math.max(36, Math.min(124, this.thoughtLabel.width + paddingX * 2))
    const height = Math.max(22, this.thoughtLabel.height + paddingY * 2)
    this.thoughtBackground.clear()

    // Cloud body — overlapping circles for puffy cloud shape
    const halfW = width / 2
    const halfH = height / 2
    this.thoughtBackground.roundRect(-halfW, -halfH, width, height, halfH).fill({
      color: 0xddd6fe,
      alpha: 0.92,
    })
    // Puffy bumps on top to create cloud silhouette
    this.thoughtBackground.circle(-halfW * 0.35, -halfH + 1, halfH * 0.5).fill({ color: 0xddd6fe, alpha: 0.92 })
    this.thoughtBackground.circle(halfW * 0.3, -halfH + 1, halfH * 0.45).fill({ color: 0xddd6fe, alpha: 0.92 })
    this.thoughtBackground.circle(0, -halfH - 1, halfH * 0.55).fill({ color: 0xddd6fe, alpha: 0.92 })

    // Purple border
    this.thoughtBackground.roundRect(-halfW, -halfH, width, height, halfH).stroke({
      color: 0x8b5cf6,
      alpha: 0.35,
      width: 1,
    })

    // Cloud-dot pointer (three descending circles)
    this.thoughtBackground.circle(-2, halfH + 4, 2.5).fill({ color: 0xddd6fe, alpha: 0.85 })
    this.thoughtBackground.circle(1, halfH + 8, 1.8).fill({ color: 0xddd6fe, alpha: 0.70 })
    this.thoughtBackground.circle(3, halfH + 11, 1.2).fill({ color: 0xddd6fe, alpha: 0.55 })
  }

  private redrawAvatar(): void {
    this.body.clear()
    const { outfitColor, skinColor, fashionAccent, styleScore } = this.currentAppearance

    this.body.roundRect(-8, -2, 16, 12, 4).fill({ color: outfitColor })
    this.body.rect(-6, 0, 12, 1.6).fill({ color: fashionAccent, alpha: 0.92 })
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

    // Occupation-based colored ring around the character base
    const occColor = OCCUPATION_OUTLINE_COLOR[this.currentOccupation]
    if (occColor) {
      this.body.circle(0, 12, 11)
      this.body.stroke({ color: occColor, width: 1.8, alpha: 0.65 })
    }
    if (styleScore >= 0.45) {
      this.body.circle(0, 12, 9.4)
      this.body.stroke({
        color: fashionAccent,
        width: styleScore >= 0.75 ? 2.2 : 1.2,
        alpha: 0.35 + styleScore * 0.35,
      })
    }
    if (styleScore >= 0.78) {
      this.body.circle(7, 4, 1.5).fill({ color: fashionAccent, alpha: 0.95 })
    }

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
