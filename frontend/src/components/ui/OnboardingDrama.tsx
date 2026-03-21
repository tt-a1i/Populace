/**
 * OnboardingDrama — 90-second scripted "opening play" that teaches users
 * what Populace does through an auto-playing narrative sequence.
 *
 * Phases:
 *   1. INTRO       (0-15s)  — typewriter intro text
 *   2. FOCUS       (15-35s) — focus camera on first resident
 *   3. MEETING     (35-55s) — trigger a social interaction
 *   4. CHOICE      (55-70s) — let user pick an action
 *   5. DONE        — unmount
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { injectEvent, injectPresetEvent } from '../../services/api'
import { useSimulationStore } from '../../stores/simulation'

export interface OnboardingDramaProps {
  onComplete: () => void
}

type Phase = 'intro' | 'focus' | 'meeting' | 'choice' | 'done'

// ---------------------------------------------------------------------------
// Typewriter hook — reveals text one character at a time
// ---------------------------------------------------------------------------
function useTypewriter(text: string, speed = 60, active = true): string {
  // Track generation so we can reset display on parameter changes
  const [generation, setGeneration] = useState(0)
  const [displayed, setDisplayed] = useState('')
  const indexRef = useRef(0)

  // Bump generation on parameter change to reset displayed text
  // The onChange handler pattern avoids synchronous setState inside an effect
  const prevKey = useRef({ text, speed, active })
  if (
    prevKey.current.text !== text ||
    prevKey.current.speed !== speed ||
    prevKey.current.active !== active
  ) {
    prevKey.current = { text, speed, active }
    indexRef.current = 0
    setDisplayed('')
    setGeneration((g) => g + 1)
  }

  useEffect(() => {
    if (!active) return

    indexRef.current = 0

    const id = setInterval(() => {
      indexRef.current += 1
      if (indexRef.current >= text.length) {
        setDisplayed(text)
        clearInterval(id)
      } else {
        setDisplayed(text.slice(0, indexRef.current))
      }
    }, speed)

    return () => clearInterval(id)
    // generation ensures the effect re-runs when parameters change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation])

  return active ? displayed : ''
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function OnboardingDrama({ onComplete }: OnboardingDramaProps) {
  const { t } = useTranslation()

  const [phase, setPhase] = useState<Phase>('intro')
  const [opacity, setOpacity] = useState(1)
  const [showLine2, setShowLine2] = useState(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // Resident data from the simulation store
  const residents = useSimulationStore((s) => s.residents)
  const selectResident = useSimulationStore((s) => s.selectResident)
  const firstResident = residents[0] ?? null

  // Typewriter lines for the intro phase
  const line1Text = t('onboarding.line1')
  const line2Text = t('onboarding.line2')
  const line1 = useTypewriter(line1Text, 50, phase === 'intro')
  const line2 = useTypewriter(line2Text, 50, phase === 'intro' && showLine2)

  // Helper to schedule a timeout and track it for cleanup
  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms)
    timersRef.current.push(id)
    return id
  }, [])

  // Transition between phases with a fade
  const transitionTo = useCallback(
    (next: Phase) => {
      setOpacity(0)
      schedule(() => {
        setPhase(next)
        setOpacity(1)
      }, 500)
    },
    [schedule],
  )

  // Finish the drama and call onComplete
  const finish = useCallback(() => {
    setPhase('done')
    onComplete()
  }, [onComplete])

  // ---------------------------------------------------------------------------
  // Phase: INTRO timers
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'intro') return

    // Show line 2 after 3 seconds
    const id1 = schedule(() => setShowLine2(true), 3000)
    // Auto-advance after 12 seconds total
    const id2 = schedule(() => transitionTo('focus'), 12000)

    return () => {
      clearTimeout(id1)
      clearTimeout(id2)
    }
  }, [phase, schedule, transitionTo])

  // ---------------------------------------------------------------------------
  // Phase: FOCUS — select the first resident
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'focus') return

    if (firstResident) {
      selectResident(firstResident.id)
      window.dispatchEvent(
        new CustomEvent('populace:camera-focus', {
          detail: { residentId: firstResident.id },
        }),
      )
    }

    const id = schedule(() => transitionTo('meeting'), 8000)
    return () => clearTimeout(id)
  }, [phase, firstResident, selectResident, schedule, transitionTo])

  // ---------------------------------------------------------------------------
  // Phase: MEETING — inject an event to trigger interaction
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'meeting') return

    if (firstResident) {
      injectEvent({
        description: `${firstResident.name}在广场遇到了邻居`,
      }).catch(() => {
        // API may not be available; non-blocking
      })
    }

    const id = schedule(() => transitionTo('choice'), 10000)
    return () => clearTimeout(id)
  }, [phase, firstResident, schedule, transitionTo])

  // ---------------------------------------------------------------------------
  // Cleanup all timers on unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const id of timers) clearTimeout(id)
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Choice handlers
  // ---------------------------------------------------------------------------
  const handleRomance = () => {
    injectPresetEvent('love_letter').catch(() => {})
    finish()
  }

  const handleConflict = () => {
    injectPresetEvent('stranger').catch(() => {})
    finish()
  }

  const handleWatch = () => {
    finish()
  }

  // Phase: DONE — render nothing
  if (phase === 'done') return null

  // ---------------------------------------------------------------------------
  // Mood emoji helper
  // ---------------------------------------------------------------------------
  const moodEmoji = (mood?: string): string => {
    if (!mood) return ''
    const lower = mood.toLowerCase()
    if (lower.includes('happy') || lower.includes('开心') || lower.includes('高兴')) return '😊'
    if (lower.includes('sad') || lower.includes('悲伤') || lower.includes('难过')) return '😢'
    if (lower.includes('angry') || lower.includes('愤怒') || lower.includes('生气')) return '😡'
    if (lower.includes('anxious') || lower.includes('焦虑')) return '😰'
    if (lower.includes('neutral') || lower.includes('平静')) return '😐'
    return '🙂'
  }

  // Truncate personality to first 20 characters
  const personalityHint = firstResident?.personality
    ? firstResident.personality.length > 20
      ? firstResident.personality.slice(0, 20) + '...'
      : firstResident.personality
    : ''

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70"
      style={{
        transition: 'opacity 500ms ease',
        opacity,
      }}
    >
      {/* Skip button — always visible */}
      <button
        type="button"
        onClick={finish}
        className="fixed right-6 top-6 z-[60] rounded-full border border-white/20 bg-slate-900/80 px-4 py-2 text-sm text-slate-300 backdrop-blur transition hover:bg-slate-800/90 hover:text-white"
      >
        {t('onboarding.skip', '跳过 →')}
      </button>
      {/* ── INTRO phase ── */}
      {phase === 'intro' && (
        <div className="flex max-w-2xl flex-col items-center gap-6 px-6 text-center">
          <p
            className="text-2xl font-bold leading-relaxed text-white sm:text-3xl"
            style={{ textShadow: '0 2px 20px rgba(0,0,0,0.5)' }}
          >
            {line1}
            {line1.length < line1Text.length && (
              <span className="animate-pulse">|</span>
            )}
          </p>
          {showLine2 && (
            <p
              className="text-lg leading-relaxed text-slate-300 sm:text-xl"
              style={{ textShadow: '0 2px 16px rgba(0,0,0,0.4)' }}
            >
              {line2}
              {line2.length < line2Text.length && (
                <span className="animate-pulse">|</span>
              )}
            </p>
          )}
        </div>
      )}

      {/* ── FOCUS phase ── */}
      {phase === 'focus' && firstResident && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 flex justify-center pb-24">
          <div className="rounded-2xl border border-cyan-300/25 bg-slate-950/85 px-8 py-5 text-center shadow-[0_20px_60px_rgba(2,6,23,0.7)] backdrop-blur">
            <p
              className="text-xl font-bold text-white sm:text-2xl"
              style={{ textShadow: '0 2px 16px rgba(0,0,0,0.4)' }}
            >
              {t('onboarding.meet_resident', { name: firstResident.name })}
            </p>
            <p className="mt-2 text-sm text-slate-400">
              {t('onboarding.personality_hint', { personality: personalityHint })}
            </p>
            {firstResident.mood && (
              <p className="mt-2 text-base text-slate-300">
                {moodEmoji(firstResident.mood)} {firstResident.mood}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── MEETING phase ── */}
      {phase === 'meeting' && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 flex justify-center pb-24">
          <div className="flex max-w-lg flex-col gap-3 rounded-2xl border border-amber-300/25 bg-slate-950/85 px-8 py-5 text-center shadow-[0_20px_60px_rgba(2,6,23,0.7)] backdrop-blur">
            <p
              className="text-lg font-bold text-white sm:text-xl"
              style={{ textShadow: '0 2px 16px rgba(0,0,0,0.4)' }}
            >
              {t('onboarding.watch_meeting')}
            </p>
            <p className="text-sm text-slate-400">
              {t('onboarding.ai_explains')}
            </p>
          </div>
        </div>
      )}

      {/* ── CHOICE phase ── */}
      {phase === 'choice' && (
        <div className="flex max-w-3xl flex-col items-center gap-8 px-4">
          <h2
            className="text-center text-2xl font-bold text-white sm:text-3xl"
            style={{ textShadow: '0 2px 20px rgba(0,0,0,0.5)' }}
          >
            {t('onboarding.your_turn')}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Romance */}
            <button
              type="button"
              onClick={handleRomance}
              className="group flex flex-col items-center gap-3 rounded-2xl border border-pink-400/25 bg-pink-400/10 px-6 py-6 text-center transition hover:border-pink-400/50 hover:bg-pink-400/20 hover:shadow-[0_0_30px_rgba(244,114,182,0.2)]"
            >
              <span className="text-4xl">💕</span>
              <span className="text-lg font-bold text-white">{t('onboarding.romance')}</span>
              <span className="text-xs text-slate-400">{t('onboarding.romance_desc')}</span>
            </button>
            {/* Conflict */}
            <button
              type="button"
              onClick={handleConflict}
              className="group flex flex-col items-center gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-6 py-6 text-center transition hover:border-amber-400/50 hover:bg-amber-400/20 hover:shadow-[0_0_30px_rgba(251,191,36,0.2)]"
            >
              <span className="text-4xl">⚡</span>
              <span className="text-lg font-bold text-white">{t('onboarding.conflict')}</span>
              <span className="text-xs text-slate-400">{t('onboarding.conflict_desc')}</span>
            </button>
            {/* Watch */}
            <button
              type="button"
              onClick={handleWatch}
              className="group flex flex-col items-center gap-3 rounded-2xl border border-slate-400/25 bg-slate-400/10 px-6 py-6 text-center transition hover:border-slate-400/50 hover:bg-slate-400/20 hover:shadow-[0_0_30px_rgba(148,163,184,0.2)]"
            >
              <span className="text-4xl">👀</span>
              <span className="text-lg font-bold text-white">{t('onboarding.watch')}</span>
              <span className="text-xs text-slate-400">{t('onboarding.watch_desc')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
