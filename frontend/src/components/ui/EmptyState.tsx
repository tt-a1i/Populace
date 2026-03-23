interface EmptyStateProps {
  icon?: string
  message: string
  hint?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon = '📭', message, hint, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-white/10 py-10 text-center">
      <span className="text-3xl leading-none opacity-60">{icon}</span>
      <p className="text-sm font-medium text-slate-400">{message}</p>
      {hint && <p className="max-w-xs text-xs leading-relaxed text-slate-500">{hint}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="btn-primary mt-1 rounded-xl px-4 py-2 text-xs font-semibold transition duration-200 active:scale-95"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
