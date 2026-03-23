/**
 * TutorialOverlay — 5-step guided tour with spotlight highlighting.
 *
 * Usage:
 *   <TutorialOverlay />    auto-starts on first visit (localStorage)
 *   resetTutorial()        clears localStorage and re-shows via custom event
 */
import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

export const TUTORIAL_STORAGE_KEY = 'populace:tutorial_done'

const RESET_EVENT = 'populace:reset-tutorial'

// eslint-disable-next-line react-refresh/only-export-components
export function resetTutorial(): void {
  localStorage.removeItem(TUTORIAL_STORAGE_KEY)
  window.dispatchEvent(new CustomEvent(RESET_EVENT))
}

interface StepDef {
  titleKey: string
  descKey: string
  icon: string
  gesture: 'click' | 'scroll' | 'drag' | 'dblclick' | null
  selector: string | null
  tooltipSide: 'below' | 'above' | 'center'
}

const STEP_DEFS: StepDef[] = [
  { titleKey: 'tutorial.step1_title', descKey: 'tutorial.step1_desc', icon: '\uD83D\uDDFA\uFE0F', gesture: 'scroll', selector: '[data-testid="town-canvas-shell"]', tooltipSide: 'below' },
  { titleKey: 'tutorial.step2_title', descKey: 'tutorial.step2_desc', icon: '\uD83D\uDC64', gesture: 'click', selector: '[data-testid="town-minimap"]', tooltipSide: 'above' },
  { titleKey: 'tutorial.step3_title', descKey: 'tutorial.step3_desc', icon: '\u26A1', gesture: 'click', selector: null, tooltipSide: 'center' },
  { titleKey: 'tutorial.step4_title', descKey: 'tutorial.step4_desc', icon: '\uD83D\uDD78\uFE0F', gesture: 'drag', selector: null, tooltipSide: 'center' },
  { titleKey: 'tutorial.step5_title', descKey: 'tutorial.step5_desc', icon: '\u23E9', gesture: 'dblclick', selector: null, tooltipSide: 'center' },
]

/** Gesture hint icons with animation class names */
const GESTURE_HINTS: Record<string, { icon: string; animClass: string }> = {
  click: { icon: '👆', animClass: 'animate-[tutorialTap_1.2s_ease-in-out_infinite]' },
  dblclick: { icon: '👆', animClass: 'animate-[tutorialDoubleTap_1.6s_ease-in-out_infinite]' },
  scroll: { icon: '🖱️', animClass: 'animate-[tutorialScroll_2s_ease-in-out_infinite]' },
  drag: { icon: '✋', animClass: 'animate-[tutorialDrag_2s_ease-in-out_infinite]' },
}

interface SpotlightRect {
  left: number
  top: number
  width: number
  height: number
}

export function TutorialOverlay() {
  const { t } = useTranslation()
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
      const sel = STEP_DEFS[step]?.selector
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
    if (next < STEP_DEFS.length) setStep(next)
    else finish()
  }

  const goPrev = () => {
    if (step > 0) setStep(step - 1)
  }

  if (!visible) return null

  const curDef = STEP_DEFS[step]
  const isLast = step === STEP_DEFS.length - 1
  const gestureHint = curDef.gesture ? GESTURE_HINTS[curDef.gesture] : null

  // ── Tooltip position ──────────────────────────────────────────
  let cardStyle: React.CSSProperties = {}
  if (spotlight && curDef.tooltipSide !== 'center') {
    const left = Math.max(16, Math.min(spotlight.left, window.innerWidth - 380))
    if (curDef.tooltipSide === 'below') {
      cardStyle = { left, top: spotlight.top + spotlight.height + 18 }
    } else {
      cardStyle = { left, top: Math.max(16, spotlight.top - 218) }
    }
  } else {
    cardStyle = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  }

  return createPortal(
    <>
      {/* Spotlight dim / cutout — smooth transition on position changes */}
      {spotlight ? (
        <div
          className="pointer-events-none fixed z-[9001] rounded-2xl ring-2 ring-cyan-400/50 transition-all duration-500 ease-out"
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

      {/* Tooltip card — animate entry on step change */}
      <div
        key={step}
        className="pointer-events-auto fixed z-[9002] w-[min(23rem,calc(100vw-2rem))] animate-[scaleIn_250ms_ease-out] rounded-xl border border-cyan-300/25 bg-slate-950/96 p-5 shadow-[0_28px_80px_rgba(2,6,23,0.70)] backdrop-blur"
        style={cardStyle}
      >
        {/* Progress pills */}
        <div className="mb-4 flex items-center gap-1.5">
          {STEP_DEFS.map((_, i) => (
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
          <span className="ml-auto shrink-0 text-[11px] text-slate-500">{step + 1} / {STEP_DEFS.length}</span>
        </div>

        {/* Content */}
        <div className="flex items-start gap-3">
          <span className="shrink-0 text-3xl leading-none">{curDef.icon}</span>
          <div className="flex-1">
            <h3 className="font-display text-xl text-white">{t(curDef.titleKey)}</h3>
            <p className="mt-2 text-sm leading-[1.7] text-slate-300">{t(curDef.descKey)}</p>
          </div>
          {/* Gesture animation hint */}
          {gestureHint && (
            <span className={`shrink-0 text-2xl ${gestureHint.animClass}`} aria-hidden="true">
              {gestureHint.icon}
            </span>
          )}
        </div>

        {/* Navigation */}
        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={finish}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition duration-200 hover:bg-white/8 active:scale-95"
          >
            {t('tutorial.skip')}
          </button>
          <div className="flex flex-1 justify-end gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={goPrev}
                className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm text-slate-200 transition duration-200 hover:bg-white/10 active:scale-95"
              >
                {t('tutorial.prev')}
              </button>
            )}
            <button
              type="button"
              onClick={goNext}
              className="rounded-full bg-cyan-500/90 px-5 py-1.5 text-sm font-semibold text-white transition duration-200 hover:bg-cyan-400 active:scale-95"
            >
              {isLast ? t('tutorial.finish') : t('tutorial.next')}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
