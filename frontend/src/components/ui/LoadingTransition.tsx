import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface LoadingTransitionProps {
  onRetry: () => void
  timedOut: boolean
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
    <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
      {/* Subtle ambient glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.08),transparent_60%)]" />

      <div className="relative z-10 flex flex-col items-center gap-6 px-6 text-center">
        {timedOut ? (
          <>
            <span className="text-4xl">⚠️</span>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-amber-200/70">{t('loading.timeout_badge')}</p>
              <p className="mt-2 text-lg font-medium text-amber-50">{t('loading.timeout_title')}</p>
              <p className="mt-2 max-w-sm text-sm text-slate-400">{t('loading.timeout_desc')}</p>
            </div>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-full border border-amber-200/30 bg-amber-200/12 px-6 py-2.5 text-sm font-medium text-amber-50 transition hover:bg-amber-200/20"
            >
              {t('loading.retry')}
            </button>
          </>
        ) : (
          <>
            <div className="relative">
              <span className="block h-12 w-12 animate-spin rounded-full border-2 border-cyan-300/80 border-t-transparent" />
              <span className="absolute inset-0 animate-ping rounded-full border border-cyan-400/20" />
            </div>
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-widest text-cyan-300/70">POPULACE</p>
              <p
                key={msgIdx}
                className="mt-3 animate-fade-up text-base font-medium text-white"
              >
                {Array.isArray(funMessages) && funMessages.length > 0
                  ? funMessages[msgIdx]
                  : t('loading.connecting')}
              </p>
              <p className="mt-2 text-xs text-slate-500">{t('loading.desc')}</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
