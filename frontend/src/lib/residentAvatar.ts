export type AvatarHairStyle = 'short' | 'long' | 'bun' | 'spiky' | 'curly'

export interface ResidentAvatarSeed {
  id: string
  name?: string
  skinColor?: string | null
  hairStyle?: string | null
  hairColor?: string | null
  outfitColor?: string | null
  mood?: string | null
  appearance?: {
    hair?: string | null
    clothing?: string | null
    style_score?: number | null
  } | null
}

const DEFAULT_SKIN = '#d6a77a'
const DEFAULT_HAIR = '#2d1f1a'
const DEFAULT_OUTFIT = '#38bdf8'
const HAIR_STYLES: AvatarHairStyle[] = ['short', 'long', 'bun', 'spiky', 'curly']
const CLOTHING_ACCENTS: Record<string, string> = {
  work: '#94a3b8',
  formal: '#f59e0b',
  casual: '#22d3ee',
  festive: '#f472b6',
}
const avatarCache = new Map<string, string>()

function checksum(value: string): number {
  return [...value].reduce((total, char) => total + char.charCodeAt(0), 0)
}

function normalizeColor(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback
  const trimmed = value.trim()
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : fallback
}

function normalizeHairStyle(value: string | null | undefined, id: string): AvatarHairStyle {
  const normalized = (value ?? '').trim().toLowerCase()
  if (HAIR_STYLES.includes(normalized as AvatarHairStyle)) {
    return normalized as AvatarHairStyle
  }
  return HAIR_STYLES[checksum(`${id}-hair-style`) % HAIR_STYLES.length]
}

function moodAccent(mood: string | null | undefined): string {
  switch ((mood ?? '').toLowerCase()) {
    case 'happy':
    case 'excited':
    case 'ecstatic':
      return '#facc15'
    case 'sad':
    case 'fearful':
      return '#60a5fa'
    case 'angry':
      return '#f87171'
    default:
      return '#cbd5e1'
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function mixHex(base: string, overlay: string, ratio: number): string {
  const safeRatio = clamp(ratio, 0, 1)
  const baseValue = parseInt(base.slice(1), 16)
  const overlayValue = parseInt(overlay.slice(1), 16)
  const mixChannel = (shift: number) => {
    const baseChannel = (baseValue >> shift) & 0xff
    const overlayChannel = (overlayValue >> shift) & 0xff
    return Math.round(baseChannel * (1 - safeRatio) + overlayChannel * safeRatio)
  }
  const red = mixChannel(16).toString(16).padStart(2, '0')
  const green = mixChannel(8).toString(16).padStart(2, '0')
  const blue = mixChannel(0).toString(16).padStart(2, '0')
  return `#${red}${green}${blue}`
}

function resolveAppearance(seed: ResidentAvatarSeed) {
  const baseHash = checksum(seed.id)
  const clothing = (seed.appearance?.clothing ?? 'casual').trim().toLowerCase()
  const styleScore = clamp(seed.appearance?.style_score ?? 0.35, 0, 1)
  const accentBase = CLOTHING_ACCENTS[clothing] ?? '#22d3ee'
  return {
    skinColor: normalizeColor(seed.skinColor, baseHash % 2 === 0 ? DEFAULT_SKIN : '#f1c7a3'),
    hairStyle: normalizeHairStyle(seed.hairStyle ?? seed.appearance?.hair, seed.id),
    hairColor: normalizeColor(seed.hairColor, DEFAULT_HAIR),
    outfitColor: normalizeColor(seed.outfitColor, baseHash % 2 === 0 ? DEFAULT_OUTFIT : '#10b981'),
    moodColor: moodAccent(seed.mood),
    accentColor: mixHex(accentBase, '#ffffff', styleScore * 0.28),
    styleScore,
    clothing,
  }
}

function avatarSignature(seed: ResidentAvatarSeed): string {
  const appearance = resolveAppearance(seed)
  return [
    seed.id,
    seed.name ?? '',
    appearance.skinColor,
    appearance.hairStyle,
    appearance.hairColor,
    appearance.outfitColor,
    appearance.moodColor,
    appearance.accentColor,
    appearance.styleScore.toFixed(2),
    appearance.clothing,
  ].join('|')
}

function drawHair(ctx: CanvasRenderingContext2D, style: AvatarHairStyle, color: string): void {
  ctx.fillStyle = color
  switch (style) {
    case 'long':
      ctx.fillRect(3, 2, 10, 4)
      ctx.fillRect(2, 5, 2, 5)
      ctx.fillRect(12, 5, 2, 5)
      break
    case 'bun':
      ctx.fillRect(4, 2, 8, 3)
      ctx.fillRect(6, 0, 4, 2)
      ctx.fillRect(3, 4, 10, 2)
      break
    case 'spiky':
      ctx.fillRect(3, 3, 10, 2)
      ctx.fillRect(4, 2, 2, 1)
      ctx.fillRect(7, 1, 2, 2)
      ctx.fillRect(10, 2, 2, 1)
      break
    case 'curly':
      ctx.fillRect(3, 2, 10, 3)
      ctx.fillRect(2, 4, 2, 2)
      ctx.fillRect(12, 4, 2, 2)
      ctx.fillRect(5, 5, 6, 1)
      break
    default:
      ctx.fillRect(3, 3, 10, 3)
      break
  }
}

function drawFace(ctx: CanvasRenderingContext2D, skinColor: string, moodColor: string): void {
  ctx.fillStyle = skinColor
  ctx.fillRect(4, 5, 8, 7)
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(6, 8, 1, 1)
  ctx.fillRect(9, 8, 1, 1)
  ctx.fillStyle = moodColor
  ctx.fillRect(6, 10, 4, 1)
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  color: string,
  accentColor: string,
  styleScore: number,
): void {
  ctx.fillStyle = color
  ctx.fillRect(3, 12, 10, 4)
  ctx.fillRect(4, 11, 8, 2)
  ctx.fillStyle = accentColor
  ctx.fillRect(4, 12, 8, 1)
  if (styleScore >= 0.7) {
    ctx.fillRect(11, 12, 1, 4)
  }
}

function svgFallback(seed: ResidentAvatarSeed): string {
  const appearance = resolveAppearance(seed)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 16 16" shape-rendering="crispEdges">
      <rect width="16" height="16" rx="4" fill="#0f172a"/>
      <rect x="3" y="12" width="10" height="4" fill="${appearance.outfitColor}"/>
      <rect x="4" y="12" width="8" height="1" fill="${appearance.accentColor}"/>
      ${appearance.styleScore >= 0.7 ? `<rect x="11" y="12" width="1" height="4" fill="${appearance.accentColor}"/>` : ''}
      <rect x="4" y="5" width="8" height="7" fill="${appearance.skinColor}"/>
      <rect x="3" y="3" width="10" height="3" fill="${appearance.hairColor}"/>
      <rect x="6" y="8" width="1" height="1" fill="#0f172a"/>
      <rect x="9" y="8" width="1" height="1" fill="#0f172a"/>
      <rect x="6" y="10" width="4" height="1" fill="${appearance.moodColor}"/>
    </svg>
  `.trim()

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export function generateResidentAvatarDataUrl(seed: ResidentAvatarSeed): string {
  const signature = avatarSignature(seed)
  const cached = avatarCache.get(signature)
  if (cached) return cached

  if (typeof document === 'undefined') {
    const fallback = svgFallback(seed)
    avatarCache.set(signature, fallback)
    return fallback
  }

  const canvas = document.createElement('canvas')
  canvas.width = 16
  canvas.height = 16
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    const fallback = svgFallback(seed)
    avatarCache.set(signature, fallback)
    return fallback
  }

  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, 16, 16)
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, 16, 16)

  const appearance = resolveAppearance(seed)
  drawBody(ctx, appearance.outfitColor, appearance.accentColor, appearance.styleScore)
  drawFace(ctx, appearance.skinColor, appearance.moodColor)
  drawHair(ctx, appearance.hairStyle, appearance.hairColor)

  const dataUrl = canvas.toDataURL('image/png')
  avatarCache.set(signature, dataUrl)
  return dataUrl
}
