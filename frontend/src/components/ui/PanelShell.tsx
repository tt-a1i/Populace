interface PanelShellProps {
  icon: string
  title: string
  badge?: string
  children: React.ReactNode
  onClose?: () => void
  headerRight?: React.ReactNode
}

export function PanelShell({ icon, title, badge, children, onClose, headerRight }: PanelShellProps) {
  const handleClose = () => {
    if (onClose) {
      onClose()
    } else {
      window.dispatchEvent(new CustomEvent('populace:close-panel'))
    }
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-slate-900/88 p-4 text-slate-100 shadow-[0_18px_48px_rgba(2,6,23,0.32)] backdrop-blur-lg sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-lg leading-none">{icon}</span>
          <div>
            {badge && <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400 mb-0.5">{badge}</p>}
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white">{title}</h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {headerRight}
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close panel"
            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400 transition duration-200 hover:bg-white/10 hover:text-white active:scale-95"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>
      </div>
      <div className="grid max-h-[min(65vh,42rem)] gap-3 overflow-y-auto pr-1 sm:gap-4">
        {children}
      </div>
    </div>
  )
}
