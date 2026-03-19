import { useEffect, useState } from 'react'

const STORAGE_KEY = 'populace:first-run-guide-seen'

interface FirstRunGuideProps {
  enabled: boolean
}

export function FirstRunGuide({ enabled }: FirstRunGuideProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    if (window.localStorage.getItem(STORAGE_KEY) === '1') {
      return undefined
    }

    const showTimer = window.setTimeout(() => {
      setVisible(true)
    }, 0)

    const timer = window.setTimeout(() => {
      setVisible(false)
      window.localStorage.setItem(STORAGE_KEY, '1')
    }, 4500)

    return () => {
      window.clearTimeout(showTimer)
      window.clearTimeout(timer)
    }
  }, [enabled])

  if (!enabled || !visible) {
    return null
  }

  const dismiss = () => {
    setVisible(false)
    window.localStorage.setItem(STORAGE_KEY, '1')
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 w-[min(24rem,calc(100vw-2rem))] rounded-[24px] border border-cyan-300/20 bg-slate-950/92 p-5 shadow-[0_24px_80px_rgba(8,15,31,0.58)] backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.34em] text-cyan-100/70">Quick Guide</p>
          <h3 className="mt-2 font-display text-2xl text-white">第一次进入操作提示</h3>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10"
        >
          关闭
        </button>
      </div>
      <div className="mt-4 grid gap-3 text-sm leading-6 text-slate-300">
        <p>滚轮缩放地图 | 拖拽平移 | 双击角色跟随</p>
        <p>底部工具栏可投放事件、编辑人设，也能查看最新事件流。</p>
      </div>
    </div>
  )
}
