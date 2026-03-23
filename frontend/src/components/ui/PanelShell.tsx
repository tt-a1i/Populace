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
    <div className="rounded-xl bg-slate-800/80 backdrop-blur-lg border border-white/[0.08] p-4 text-slate-100 shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
      <div className="flex items-center justify-between gap-3 mb-3">
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
      <div className="grid gap-3">
        {children}
      </div>
    </div>
  )
}
