/* eslint-disable react-refresh/only-export-components */
import React from 'react'

export interface ToastOptions {
  type?: 'success' | 'info' | 'warning' | 'error'
  title?: string
  description?: string
}

interface Toast { id: string; title: string; description: string }

interface ToastCtxValue {
  pushToast: (messageOrOpts: string | ToastOptions, opts?: ToastOptions) => void
}

const ToastCtx = React.createContext<ToastCtxValue>({ pushToast: () => {} })

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const pushToast = React.useCallback(
    (messageOrOpts: string | ToastOptions, opts?: ToastOptions) => {
      const id = String(Date.now() + Math.random())
      let title = ''
      let description = ''
      if (typeof messageOrOpts === 'string') {
        title = messageOrOpts
        description = opts?.description ?? ''
      } else {
        title = messageOrOpts.title ?? ''
        description = messageOrOpts.description ?? ''
      }
      setToasts((t) => [...t, { id, title, description }])
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000)
    },
    [],
  )

  return (
    <ToastCtx.Provider value={{ pushToast }}>
      {children}
      <div className="fixed bottom-16 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className="rounded-xl border border-white/10 bg-slate-900/90 px-4 py-2 text-sm text-slate-100 shadow-lg"
          >
            {t.title && <p className="font-semibold">{t.title}</p>}
            {t.description && <p className="text-slate-300">{t.description}</p>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast(): ToastCtxValue {
  return React.useContext(ToastCtx)
}
