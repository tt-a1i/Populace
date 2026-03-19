import type { RelationshipSnapshot } from '../../stores/relationships'

interface TimelineSliderProps {
  history: RelationshipSnapshot[]
  replayTick: number | null
  liveTick: number
  onReplayTickChange: (tick: number | null) => void
}

export function TimelineSlider({
  history,
  replayTick,
  liveTick,
  onReplayTickChange,
}: TimelineSliderProps) {
  if (history.length === 0) {
    return (
      <div className="rounded-[18px] border border-white/10 bg-slate-950/78 px-4 py-3 text-sm text-slate-400">
        关系时间轴准备中，等待 tick 数据累计...
      </div>
    )
  }

  const maxIndex = history.length - 1
  const selectedIndex =
    replayTick === null
      ? maxIndex
      : Math.max(0, history.findIndex((snapshot) => snapshot.tick === replayTick))
  const selectedTick = history[selectedIndex]?.tick ?? liveTick

  return (
    <div className="rounded-[20px] border border-white/10 bg-slate-950/82 px-4 py-3 shadow-[0_18px_44px_rgba(8,15,31,0.42)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.32em] text-amber-100/70">Timeline Replay</p>
          <p className="mt-1 text-sm text-slate-200">
            {replayTick === null ? `实时 Tick ${liveTick}` : `回放 Tick ${selectedTick}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onReplayTickChange(null)}
          disabled={replayTick === null}
          className="rounded-full border border-amber-200/20 bg-amber-200/10 px-3 py-1 text-xs font-medium text-amber-50 transition hover:bg-amber-200/18 disabled:cursor-default disabled:opacity-45"
        >
          返回实时
        </button>
      </div>

      <div className="mt-3 grid gap-2">
        <input
          type="range"
          min={0}
          max={maxIndex}
          value={selectedIndex}
          onChange={(event) => {
            const index = Number(event.target.value)
            onReplayTickChange(history[index]?.tick ?? null)
          }}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-amber-300"
        />
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-slate-400">
          <span>Tick {history[0]?.tick}</span>
          <span>{replayTick === null ? 'Live' : `Tick ${selectedTick}`}</span>
          <span>Tick {history[maxIndex]?.tick}</span>
        </div>
      </div>
    </div>
  )
}
