interface PanelTextProps {
  title: string
  message?: string
}

export function PanelSpinner({ title, message }: PanelTextProps) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-8 text-center">
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-300/70 border-t-transparent" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-white">{title}</p>
        {message ? <p className="text-xs text-slate-400">{message}</p> : null}
      </div>
    </div>
  )
}

export function PanelEmptyState({ title, message }: PanelTextProps) {
  return (
    <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-5 py-8 text-center">
      <p className="text-sm font-medium text-white">{title}</p>
      {message ? <p className="mt-2 text-xs leading-5 text-slate-400">{message}</p> : null}
    </div>
  )
}

export function PanelSkeletonGrid({ columns = 3, rows = 1 }: { columns?: 2 | 3 | 4; rows?: number }) {
  return (
    <div className={`grid gap-3 ${columns === 2 ? 'md:grid-cols-2' : columns === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
      {Array.from({ length: columns * rows }).map((_, index) => (
        <div
          key={index}
          className="h-20 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]"
        />
      ))}
    </div>
  )
}
