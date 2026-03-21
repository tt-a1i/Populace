/**
 * TutorialOverlay — 5-step guided tour with spotlight highlighting.
 *
 * Usage:
 *   <TutorialOverlay />    auto-starts on first visit (localStorage)
 *   resetTutorial()        clears localStorage and re-shows via custom event
 */
import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export const TUTORIAL_STORAGE_KEY = 'populace:tutorial_done'

const RESET_EVENT = 'populace:reset-tutorial'

// eslint-disable-next-line react-refresh/only-export-components
export function resetTutorial(): void {
  localStorage.removeItem(TUTORIAL_STORAGE_KEY)
  window.dispatchEvent(new CustomEvent(RESET_EVENT))
}

interface Step {
  title: string
  desc: string
  icon: string
  /** CSS selector for the element to spotlight; null = center card */
  selector: string | null
  tooltipSide: 'below' | 'above' | 'center'
}

const STEPS: Step[] = [
  {
    title: '地图导航',
    desc: '鼠标滚轮缩放地图，拖拽平移视角。双击居民头像可锁定跟随模式，右键任意位置打开上下文菜单。',
    icon: '🗺️',
    selector: '[data-testid="town-canvas-shell"]',
    tooltipSide: 'below',
  },
  {
    title: '查看居民',
    desc: '点击地图或小地图中的彩色圆点，右侧弹出居民侧栏：记忆流、性格描述、实时关系网络。',
    icon: '👤',
    selector: '[data-testid="town-minimap"]',
    tooltipSide: 'above',
  },
  {
    title: '投放事件',
    desc: '右键地图选择「投放事件」，或在下方工具栏的「事件投放」标签注入戏剧导火索，实时影响所有居民行为。',
    icon: '⚡',
    selector: null,
    tooltipSide: 'center',
  },
  {
    title: '关系图谱',
    desc: '页面右侧是力导向关系图谱，实时展示居民社交网络演化。悬停边线可查看类型与强度，支持时间轴回放。',
    icon: '🕸️',
    selector: null,
    tooltipSide: 'center',
  },
  {
    title: '速度控制',
    desc: '工具栏右侧可调整模拟速度（1×~50×）或随时暂停精细观察。建造、导出、上帝模式均在工具栏各标签中。',
    icon: '⏩',
    selector: null,
    tooltipSide: 'center',
  },
]

interface SpotlightRect {
  left: number
  top: number
  width: number
  height: number
}

export function TutorialOverlay() {
  // Lazy initializer avoids setState-in-effect anti-pattern for the initial show
  const [visible, setVisible] = useState(() => !localStorage.getItem(TUTORIAL_STORAGE_KEY))
  const [step, setStep] = useState(0)
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null)

  // Listen for the reset custom event (state updates happen inside event handlers,
  // not synchronously within the effect body, satisfying the lint rule)
  useEffect(() => {
    const handler = () => {
      setStep(0)
      setVisible(true)
    }
    window.addEventListener(RESET_EVENT, handler)
    return () => window.removeEventListener(RESET_EVENT, handler)
  }, [])

  // Measure the spotlight target element after each step/visibility change.
  // useLayoutEffect is appropriate here: DOM measurement must happen before paint
  // to avoid a one-frame flicker. The single setState call is intentional.
  useLayoutEffect(() => {
    let rect: SpotlightRect | null = null
    if (visible) {
      const sel = STEPS[step]?.selector
      if (sel) {
        const el = document.querySelector(sel)
        if (el) {
          const r = el.getBoundingClientRect()
          rect = { left: r.left - 10, top: r.top - 10, width: r.width + 20, height: r.height + 20 }
        }
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSpotlight(rect)
  }, [visible, step])

  const finish = () => {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, '1')
    setVisible(false)
  }

  const goNext = () => {
    const next = step + 1
    if (next < STEPS.length) setStep(next)
    else finish()
  }

  const goPrev = () => {
    if (step > 0) setStep(step - 1)
  }

  if (!visible) return null

  const cur = STEPS[step]
  const isLast = step === STEPS.length - 1

  // ── Tooltip position ──────────────────────────────────────────
  let cardStyle: React.CSSProperties = {}
  if (spotlight && cur.tooltipSide !== 'center') {
    const left = Math.max(16, Math.min(spotlight.left, window.innerWidth - 380))
    if (cur.tooltipSide === 'below') {
      cardStyle = { left, top: spotlight.top + spotlight.height + 18 }
    } else {
      cardStyle = { left, top: Math.max(16, spotlight.top - 218) }
    }
  } else {
    cardStyle = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  }

  return createPortal(
    <>
      {/* Spotlight dim / cutout */}
      {spotlight ? (
        <div
          className="pointer-events-none fixed z-[9001] rounded-2xl ring-2 ring-cyan-400/50"
          style={{
            left: spotlight.left,
            top: spotlight.top,
            width: spotlight.width,
            height: spotlight.height,
            boxShadow: '0 0 0 9999px rgba(2,6,23,0.78)',
          }}
        />
      ) : (
        <div className="pointer-events-none fixed inset-0 z-[9001] bg-slate-950/78" />
      )}

      {/* Tooltip card */}
      <div
        className="pointer-events-auto fixed z-[9002] w-[min(23rem,calc(100vw-2rem))] rounded-[24px] border border-cyan-300/25 bg-slate-950/96 p-5 shadow-[0_28px_80px_rgba(2,6,23,0.70)] backdrop-blur"
        style={cardStyle}
      >
        {/* Progress pills */}
        <div className="mb-4 flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step
                  ? 'w-7 bg-cyan-400'
                  : i < step
                  ? 'w-4 bg-cyan-400/40'
                  : 'w-4 bg-slate-600'
              }`}
            />
          ))}
          <span className="ml-auto shrink-0 text-[11px] text-slate-500">{step + 1} / {STEPS.length}</span>
        </div>

        {/* Content */}
        <div className="flex items-start gap-3">
          <span className="shrink-0 text-3xl leading-none">{cur.icon}</span>
          <div>
            <h3 className="font-display text-xl text-white">{cur.title}</h3>
            <p className="mt-2 text-sm leading-[1.7] text-slate-300">{cur.desc}</p>
          </div>
        </div>

        {/* Navigation */}
        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={finish}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:bg-white/8"
          >
            跳过
          </button>
          <div className="flex flex-1 justify-end gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={goPrev}
                className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm text-slate-200 transition hover:bg-white/10"
              >
                ← 上一步
              </button>
            )}
            <button
              type="button"
              onClick={goNext}
              className="rounded-full bg-cyan-500/90 px-5 py-1.5 text-sm font-semibold text-white transition hover:bg-cyan-400"
            >
              {isLast ? '开始探索 ✓' : '下一步 →'}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
