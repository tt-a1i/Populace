import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface LoadingTransitionProps {
  onRetry: () => void
  timedOut: boolean
}

function SkeletonBlock({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={['rounded-xl skeleton-shimmer', className].join(' ')} style={style} />
}

export function LoadingTransition({ onRetry, timedOut }: LoadingTransitionProps) {
  const { t } = useTranslation()
  const funMessages = t('loading.fun_messages', { returnObjects: true }) as string[]
  const [msgIdx, setMsgIdx] = useState(0)

  useEffect(() => {
    if (timedOut || !Array.isArray(funMessages) || funMessages.length === 0) return
    const id = setInterval(() => setMsgIdx((i) => (i + 1) % funMessages.length), 3000)
    return () => clearInterval(id)
  }, [timedOut, funMessages])

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-slate-950 px-3 py-3 text-slate-100 sm:px-6 sm:py-4 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.14),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(249,115,22,0.10),_transparent_24%)]" />

      <div className="relative z-10 mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4">
        {/* Header skeleton */}
        <div className="flex items-center justify-between rounded-[28px] border border-white/10 bg-white/5 px-5 py-4">
          <div className="flex flex-col gap-2">
            <SkeletonBlock className="h-3 w-20 bg-cyan-300/10" />
            <SkeletonBlock className="h-7 w-40 bg-white/8" />
          </div>
          <div className="flex gap-2">
            <SkeletonBlock className="h-8 w-28 rounded-full bg-white/6" />
            <SkeletonBlock className="h-8 w-24 rounded-full bg-white/6" />
          </div>
        </div>

        {/* Two-panel skeleton */}
        <div className="flex flex-1 gap-3 rounded-[32px] border border-white/10 bg-slate-900/80 p-3">
          {/* Left panel */}
          <div className="flex flex-1 flex-col gap-3 rounded-[24px] border border-cyan-300/15 bg-slate-950/35 p-4">
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-3 w-14 bg-cyan-300/12" />
              <SkeletonBlock className="h-5 w-24 bg-white/8" />
            </div>
            <SkeletonBlock className="flex-1 rounded-2xl bg-white/4" style={{ minHeight: '320px' }} />
            <div className="flex gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-6 w-6 rounded-full bg-white/6" />
              ))}
            </div>
          </div>
          {/* Right panel */}
          <div className="flex flex-1 flex-col gap-3 rounded-[24px] border border-amber-200/15 bg-slate-950/35 p-4">
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-3 w-14 bg-amber-300/12" />
              <SkeletonBlock className="h-5 w-28 bg-white/8" />
            </div>
            <SkeletonBlock className="flex-1 rounded-2xl bg-white/4" style={{ minHeight: '320px' }} />
          </div>
        </div>

        {/* Toolbar skeleton */}
        <div className="flex flex-wrap items-center gap-2 rounded-[20px] border border-white/10 bg-white/5 p-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-8 w-20 rounded-full bg-white/6" />
          ))}
        </div>
      </div>

      {/* Connecting overlay badge */}
      <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
        <div className="flex items-center gap-3 rounded-[20px] border border-white/10 bg-slate-900/90 px-6 py-3 shadow-[0_8px_32px_rgba(2,6,23,0.5)] backdrop-blur">
          {timedOut ? (
            <>
              <span className="text-lg">⚠️</span>
              <div className="flex flex-col gap-1">
                <p className="text-xs uppercase tracking-[0.3em] text-amber-200/70">{t('loading.timeout_badge')}</p>
                <p className="text-sm font-medium text-amber-50">{t('loading.timeout_title')}</p>
              </div>
              <button
                type="button"
                onClick={onRetry}
                className="ml-2 rounded-full border border-amber-200/30 bg-amber-200/12 px-4 py-1.5 text-xs text-amber-50 transition hover:bg-amber-200/20"
              >
                {t('loading.retry')}
              </button>
            </>
          ) : (
            <>
              <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-cyan-300/90 border-t-transparent" />
              <div className="flex flex-col gap-0.5">
                <p className="text-[10px] uppercase tracking-[0.36em] text-cyan-200/70">{t('loading.badge')}</p>
                <p key={msgIdx} className="animate-fade-up text-sm font-medium text-cyan-50">
                  {Array.isArray(funMessages) && funMessages.length > 0
                    ? funMessages[msgIdx]
                    : t('loading.connecting')}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
