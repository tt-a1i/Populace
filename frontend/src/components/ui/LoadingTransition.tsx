interface LoadingTransitionProps {
  onRetry: () => void
  timedOut: boolean
}

export function LoadingTransition({ onRetry, timedOut }: LoadingTransitionProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-6 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(249,115,22,0.14),_transparent_28%)]" />
      <div className="relative z-10 w-full max-w-2xl rounded-[32px] border border-white/10 bg-slate-900/82 p-8 shadow-[0_32px_100px_rgba(2,6,23,0.65)] backdrop-blur">
        <p className="text-xs uppercase tracking-[0.38em] text-cyan-200/70">Simulation Boot</p>
        <h1 className="mt-4 font-display text-4xl text-white sm:text-5xl">正在生成小镇...</h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
          正在等待 WebSocket 建立连接，并同步第一份小镇快照。完成后将自动进入主界面。
        </p>

        <div className="mt-8 overflow-hidden rounded-[20px] border border-cyan-300/20 bg-slate-950/70 p-4">
          <div className="grid grid-cols-12 gap-1">
            {Array.from({ length: 24 }).map((_, index) => (
              <span
                key={index}
                className="h-3 rounded-sm bg-cyan-300/15 shadow-[0_0_18px_rgba(34,211,238,0.18)] animate-[pulse_1.6s_ease-in-out_infinite]"
                style={{ animationDelay: `${index * 90}ms` }}
              />
            ))}
          </div>
        </div>

        {timedOut ? (
          <div className="mt-8 rounded-[24px] border border-amber-300/20 bg-amber-400/10 p-5 text-left">
            <p className="text-xs uppercase tracking-[0.3em] text-amber-100/70">Backend Required</p>
            <h2 className="mt-2 text-xl font-semibold text-amber-50">后端未启动，请运行 docker compose up</h2>
            <p className="mt-3 text-sm leading-6 text-amber-100/80">
              前端已启动，但尚未收到后端快照。请确认容器服务已就绪，然后点击下方按钮重试连接。
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-5 rounded-full border border-amber-200/30 bg-amber-200/12 px-5 py-2 text-sm text-amber-50 transition hover:bg-amber-200/20"
            >
              重新尝试连接
            </button>
          </div>
        ) : (
          <p className="mt-6 text-sm text-cyan-100/72">连接成功并收到首帧快照后将自动切换。</p>
        )}
      </div>
    </div>
  )
}
