import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

interface SplitPaneProps {
  left: ReactNode
  right: ReactNode
  defaultRatio?: number
  minLeftRatio?: number
  minRightRatio?: number
  storageKey?: string
  onRatioChange?: (ratio: number) => void
}

const DEFAULT_RATIO = 60
const HANDLE_WIDTH = 4

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function SplitPane({
  left,
  right,
  defaultRatio = DEFAULT_RATIO,
  minLeftRatio = 30,
  minRightRatio = 20,
  storageKey = 'populace:split-pane-ratio',
  onRatioChange,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [ratio, setRatio] = useState(() => {
    if (typeof window === 'undefined') {
      return defaultRatio
    }

    const stored = Number(window.localStorage.getItem(storageKey))
    if (Number.isNaN(stored) || stored <= 0) {
      return defaultRatio
    }

    return clamp(stored, minLeftRatio, 100 - minRightRatio)
  })

  useEffect(() => {
    window.localStorage.setItem(storageKey, String(ratio))
    onRatioChange?.(ratio)
  }, [onRatioChange, ratio, storageKey])

  const maxRatio = 100 - minRightRatio
  const gridTemplateColumns = useMemo(
    () => `${ratio}% ${HANDLE_WIDTH}px calc(${100 - ratio}% - ${HANDLE_WIDTH}px)`,
    [ratio],
  )

  const updateRatioFromClientX = (clientX: number) => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const bounds = container.getBoundingClientRect()
    const nextRatio = ((clientX - bounds.left) / bounds.width) * 100
    setRatio(clamp(nextRatio, minLeftRatio, maxRatio))
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const pointerId = event.pointerId
    event.currentTarget.setPointerCapture(pointerId)

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateRatioFromClientX(moveEvent.clientX)
    }

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
  }

  return (
    <div
      ref={containerRef}
      className="grid h-full min-h-[calc(100vh-15rem)] gap-0"
      style={{ gridTemplateColumns }}
    >
      <div className="min-w-0 pr-2">{left}</div>
      <button
        type="button"
        aria-label="调整地图和图谱面板宽度"
        onDoubleClick={() => setRatio(defaultRatio)}
        onPointerDown={handlePointerDown}
        className="group relative h-full w-full cursor-col-resize touch-none bg-transparent p-0"
      >
        <span className="absolute inset-y-0 left-1/2 w-[4px] -translate-x-1/2 rounded-full bg-white/8 transition-colors group-hover:bg-cyan-300/65 group-active:bg-cyan-200/85" />
        <span className="absolute inset-y-[20%] left-1/2 w-[10px] -translate-x-1/2 rounded-full border border-white/10 bg-slate-950/85 opacity-0 shadow-[0_14px_34px_rgba(8,15,31,0.42)] transition-opacity group-hover:opacity-100" />
      </button>
      <div className="min-w-0 pl-2">{right}</div>
    </div>
  )
}
