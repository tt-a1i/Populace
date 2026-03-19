import { Container, Graphics, Text, type FederatedPointerEvent } from 'pixi.js'

import type { ResidentPosition, ResidentStatus } from '../../stores/simulation'

const TILE_SIZE = 32
const HALF_TILE = TILE_SIZE / 2
const DOUBLE_TAP_MS = 280
const DIALOGUE_DURATION_MS = 3000

function statusIconFor(status: ResidentStatus): string | null {
  switch (status) {
    case 'chatting':
      return '💬'
    case 'happy':
      return '❤️'
    case 'angry':
      return '💢'
    case 'thinking':
      return '💭'
    case 'sad':
      return '💧'
    default:
      return null
  }
}

interface ResidentSpriteOptions {
  onFocusRequest?: (residentId: string) => void
}

export class ResidentSprite extends Container {
  readonly residentId: string

  private readonly body = new Graphics()
  private readonly shadow = new Graphics()
  private readonly bubble = new Container()
  private readonly bubbleBackground = new Graphics()
  private readonly bubbleLabel: Text
  private readonly nameLabel: Text
  private readonly onFocusRequest?: (residentId: string) => void

  private currentColor: number
  private currentStatus: ResidentStatus
  private bobTime = 0
  private targetX = 0
  private targetY = 0
  private lastTapAt = 0
  private dialogueUntil = 0

  constructor(resident: ResidentPosition, options: ResidentSpriteOptions = {}) {
    super()

    this.residentId = resident.id
    this.currentColor = resident.color
    this.currentStatus = resident.status
    this.onFocusRequest = options.onFocusRequest
    this.sortableChildren = true
    this.eventMode = 'static'
    this.cursor = 'pointer'

    this.shadow.ellipse(0, 13, 10, 5).fill({ color: 0x020617, alpha: 0.45 })
    this.redrawBody(resident.color)

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
    this.nameLabel.y = 19
    this.nameLabel.zIndex = 3

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
    this.bubble.position.set(0, -22)
    this.bubble.zIndex = 4

    this.addChild(this.shadow, this.body, this.bubble, this.nameLabel)
    this.on('pointertap', this.handlePointerTap)

    this.applyResident(resident, true)
  }

  applyResident(resident: ResidentPosition, immediate = false): void {
    if (resident.color !== this.currentColor) {
      this.currentColor = resident.color
      this.redrawBody(resident.color)
    }

    this.currentStatus = resident.status
    this.nameLabel.text = resident.name
    this.moveTo(resident.x, resident.y, immediate)
    this.zIndex = resident.y
    this.updateStatus(resident.status, resident.dialogueText)
  }

  moveTo(tileX: number, tileY: number, immediate = false): void {
    this.targetX = tileX * TILE_SIZE + HALF_TILE
    this.targetY = tileY * TILE_SIZE + HALF_TILE

    if (immediate) {
      this.position.set(this.targetX, this.targetY)
    }
  }

  showDialogue(text: string): void {
    this.dialogueUntil = performance.now() + DIALOGUE_DURATION_MS
    this.renderBubble(text)
  }

  updateStatus(status: ResidentStatus, dialogueText?: string | null): void {
    this.currentStatus = status

    if (status === 'chatting' && dialogueText) {
      this.showDialogue(dialogueText)
      return
    }

    this.dialogueUntil = 0

    const icon = statusIconFor(status)
    this.renderBubble(icon)
  }

  update(deltaMs: number): void {
    const easing = Math.min(1, deltaMs / 180)

    this.x += (this.targetX - this.x) * easing
    this.y += (this.targetY - this.y) * easing

    if (this.dialogueUntil > 0 && performance.now() >= this.dialogueUntil) {
      this.dialogueUntil = 0
      this.renderBubble(statusIconFor(this.currentStatus))
    }

    if (this.bubble.visible) {
      this.bobTime += deltaMs
      this.bubble.y = -22 + Math.sin(this.bobTime / 180) * 2
    }
  }

  override destroy(options?: boolean | Parameters<Container['destroy']>[0]): void {
    this.off('pointertap', this.handlePointerTap)
    super.destroy(options)
  }

  private readonly handlePointerTap = (event: FederatedPointerEvent): void => {
    event.stopPropagation()

    const now = performance.now()

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

  private redrawBody(color: number): void {
    this.body.clear()
    this.body.circle(0, -2, 11).fill({ color })
    this.body.stroke({ color: 0xf8fafc, alpha: 0.55, width: 1.5 })
    this.body.circle(-3.5, -5, 1.2).fill(0xffffff)
    this.body.circle(3.5, -5, 1.2).fill(0xffffff)
    this.body.roundRect(-6.5, 3, 13, 4, 2).fill({ color: 0x0f172a, alpha: 0.2 })
    this.body.zIndex = 2
  }
}
