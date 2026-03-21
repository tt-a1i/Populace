interface EmptyStateProps {
  icon?: string
  message: string
  hint?: string
}

export function EmptyState({ icon = '📭', message, hint }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <span className="text-3xl leading-none opacity-60">{icon}</span>
      <p className="text-sm font-medium text-slate-400">{message}</p>
      {hint && <p className="max-w-xs text-xs leading-relaxed text-slate-500">{hint}</p>}
    </div>
  )
}
