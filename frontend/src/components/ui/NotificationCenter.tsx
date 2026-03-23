import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast, type NotificationEntry } from './ToastProvider'

const CATEGORY_ICON: Record<string, string> = {
  achievement: '\u{1F3C6}',
  relationship: '\u{1F495}',
  default: '\u{1F514}',
}

const TYPE_DOT: Record<string, string> = {
  success: 'bg-emerald-400',
  info: 'bg-blue-400',
  warning: 'bg-amber-400',
  error: 'bg-rose-400',
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts)
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

function NotificationItem({
  entry,
  onMarkRead,
}: {
  entry: NotificationEntry
  onMarkRead: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onMarkRead(entry.id)}
      className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition duration-150 hover:bg-white/5 ${
        entry.read ? 'opacity-50' : ''
      }`}
    >
      <span className="mt-0.5 text-sm">
        {CATEGORY_ICON[entry.category] ?? CATEGORY_ICON.default}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${TYPE_DOT[entry.type] ?? TYPE_DOT.info}`}
          />
          <p className="truncate text-xs font-medium text-white">{entry.title}</p>
        </div>
        {entry.description && (
          <p className="mt-0.5 truncate text-[11px] text-slate-400">{entry.description}</p>
        )}
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
        {formatTimestamp(entry.timestamp)}
      </span>
    </button>
  )
}

export function NotificationCenter() {
  const { t } = useTranslation()
  const { notifications, unreadCount, markRead, markAllRead, clearNotifications } = useToast()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return undefined
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return undefined
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  return (
    <div ref={panelRef} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-micro relative flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[11px] text-slate-300 transition duration-200 hover:bg-white/10 hover:text-white active:scale-95"
        title={t('notifications.title', '\u901A\u77E5\u4E2D\u5FC3')}
        aria-label={t('notifications.title', '\u901A\u77E5\u4E2D\u5FC3')}
        data-testid="notification-bell"
      >
        {'\u{1F514}'}
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[8px] font-bold text-white shadow-sm">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          data-testid="notification-panel"
          className="absolute right-0 top-8 z-50 w-80 rounded-xl border border-white/10 bg-slate-950/95 shadow-xl backdrop-blur-sm animate-[scaleIn_150ms_ease-out]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
            <h3 className="text-xs font-semibold text-white">
              {t('notifications.title', '\u901A\u77E5\u4E2D\u5FC3')}
              {unreadCount > 0 && (
                <span className="ml-2 rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-300">
                  {unreadCount}
                </span>
              )}
            </h3>
            <div className="flex gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="rounded-full px-2 py-0.5 text-[10px] text-slate-400 transition hover:bg-white/5 hover:text-white"
                >
                  {t('notifications.mark_all_read', '\u5168\u90E8\u5DF2\u8BFB')}
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={clearNotifications}
                  className="rounded-full px-2 py-0.5 text-[10px] text-slate-400 transition hover:bg-white/5 hover:text-white"
                >
                  {t('notifications.clear', '\u6E05\u7A7A')}
                </button>
              )}
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length > 0 ? (
              notifications.map((entry) => (
                <NotificationItem key={entry.id} entry={entry} onMarkRead={markRead} />
              ))
            ) : (
              <div className="flex h-20 items-center justify-center">
                <p className="text-xs text-slate-500">
                  {t('notifications.empty', '\u6682\u65E0\u901A\u77E5')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
