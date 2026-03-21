/* eslint-disable react-refresh/only-export-components */
import React from 'react'

export interface ToastOptions {
  type?: 'success' | 'info' | 'warning' | 'error'
  category?: 'achievement' | 'relationship' | 'default'
  title?: string
  description?: string
}

type ToastType = NonNullable<ToastOptions['type']>
type ToastCategory = NonNullable<ToastOptions['category']>

interface Toast {
  id: string
  type: ToastType
  category: ToastCategory
  title: string
  description: string
}

interface ToastCtxValue {
  pushToast: (messageOrOpts: string | ToastOptions, opts?: ToastOptions) => void
}

const ToastCtx = React.createContext<ToastCtxValue>({ pushToast: () => {} })

const TOAST_VARIANTS: Record<
  ToastType,
  { icon: string; className: string; descriptionClassName: string }
> = {
  success: {
    icon: '✓',
    className: 'border-emerald-300/30 bg-emerald-400/12 text-emerald-50',
    descriptionClassName: 'text-emerald-100/80',
  },
  info: {
    icon: 'i',
    className: 'border-blue-300/30 bg-blue-400/12 text-blue-50',
    descriptionClassName: 'text-blue-100/80',
  },
  warning: {
    icon: '!',
    className: 'border-amber-300/30 bg-amber-400/14 text-amber-50',
    descriptionClassName: 'text-amber-100/80',
  },
  error: {
    icon: '×',
    className: 'border-rose-300/30 bg-rose-400/14 text-rose-50',
    descriptionClassName: 'text-rose-100/80',
  },
}

function relationshipBorderClass(title: string): string {
  if (title.includes('💚')) return 'border-l-4 border-l-emerald-400'
  if (title.includes('💖')) return 'border-l-4 border-l-pink-400'
  if (title.includes('⚡')) return 'border-l-4 border-l-amber-400'
  return 'border-l-4 border-l-blue-400'
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const timersRef = React.useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  React.useEffect(() => {
    return () => { timersRef.current.forEach(clearTimeout) }
  }, [])

  const pushToast = React.useCallback(
    (messageOrOpts: string | ToastOptions, opts?: ToastOptions) => {
      const id = String(Date.now() + Math.random())
      let type: ToastType = 'info'
      let category: ToastCategory = 'default'
      let title = ''
      let description = ''

      if (typeof messageOrOpts === 'string') {
        title = messageOrOpts
        description = opts?.description ?? ''
        type = opts?.type ?? 'info'
        category = opts?.category ?? 'default'
      } else {
        title = messageOrOpts.title ?? ''
        description = messageOrOpts.description ?? ''
        type = messageOrOpts.type ?? 'info'
        category = messageOrOpts.category ?? 'default'
      }

      setToasts((current) => [...current, { id, type, category, title, description }])
      const timer = window.setTimeout(() => {
        timersRef.current.delete(timer)
        setToasts((current) => current.filter((toast) => toast.id !== id))
      }, 3000)
      timersRef.current.add(timer)
    },
    [],
  )

  return (
    <ToastCtx.Provider value={{ pushToast }}>
      {children}
      <div
        data-testid="toast-viewport"
        className="fixed top-4 right-4 z-50 flex flex-col gap-2"
      >
        {toasts.map((toast) => {
          const variant = TOAST_VARIANTS[toast.type]
          const isAchievement = toast.category === 'achievement'
          const isRelationship = toast.category === 'relationship'

          return (
            <div
              key={toast.id}
              data-testid="toast-item"
              data-variant={toast.type}
              role="status"
              aria-live="polite"
              className={[
                'rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur',
                isAchievement ? 'toast-achievement' : 'toast-enter',
                variant.className,
                isRelationship ? relationshipBorderClass(toast.title) : '',
              ].join(' ')}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current/20 bg-black/10 text-xs font-bold">
                  {variant.icon}
                </span>
                <div>
                  {toast.title ? <p className="font-semibold">{toast.title}</p> : null}
                  {toast.description ? (
                    <p className={variant.descriptionClassName}>{toast.description}</p>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast(): ToastCtxValue {
  return React.useContext(ToastCtx)
}
