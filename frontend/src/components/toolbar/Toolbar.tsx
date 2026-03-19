import { useMemo, useState } from 'react'

import { EventInjector } from './EventInjector'
import { PersonaEditor } from './PersonaEditor'
import { SpeedControl } from './SpeedControl'
import { DailyReport } from '../report'

type ToolKey = 'event' | 'persona' | 'build' | 'report'

const tools: Array<{ key: ToolKey; label: string; icon: string; tone: string }> = [
  { key: 'event', label: '事件投放', icon: '⚡', tone: 'cyan' },
  { key: 'persona', label: '人设编辑', icon: '👤', tone: 'amber' },
  { key: 'build', label: '建造模式', icon: '🏗', tone: 'emerald' },
  { key: 'report', label: '小镇日报', icon: '📰', tone: 'rose' },
]

function toneClass(tone: string, active: boolean): string {
  if (!active) {
    return 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
  }

  if (tone === 'cyan') {
    return 'border-cyan-300/40 bg-cyan-300/15 text-cyan-50'
  }

  if (tone === 'amber') {
    return 'border-amber-300/40 bg-amber-300/15 text-amber-50'
  }

  if (tone === 'emerald') {
    return 'border-emerald-300/40 bg-emerald-300/15 text-emerald-50'
  }

  return 'border-rose-300/40 bg-rose-300/15 text-rose-50'
}

export function Toolbar() {
  const [activeTool, setActiveTool] = useState<ToolKey>('event')

  const panel = useMemo(() => {
    if (activeTool === 'event') {
      return <EventInjector />
    }

    if (activeTool === 'persona') {
      return <PersonaEditor />
    }

    if (activeTool === 'build') {
      return (
        <div className="rounded-[24px] border border-white/10 bg-slate-950/70 p-4 text-slate-300 shadow-[0_18px_44px_rgba(15,23,42,0.35)]">
          <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-200/70">Build Mode</p>
          <h3 className="mt-2 font-display text-2xl text-white">建造模式稍后接线</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6">
            本轮保留占位，用于后续接入建筑拖拽、环境改造与地图编辑工作流。
          </p>
        </div>
      )
    }

    return <DailyReport />
  }, [activeTool])

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/5 px-5 py-4 shadow-[0_18px_48px_rgba(15,23,42,0.25)] backdrop-blur xl:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2 text-sm text-slate-100">
            {tools.map((tool) => (
              <button
                key={tool.key}
                type="button"
                onClick={() => setActiveTool(tool.key)}
                className={`rounded-full border px-4 py-2 transition ${toneClass(tool.tone, activeTool === tool.key)}`}
              >
                <span className="mr-2">{tool.icon}</span>
                {tool.label}
              </button>
            ))}
          </div>

          <SpeedControl />
        </div>

        <div className="rounded-full border border-white/10 bg-slate-950/45 px-4 py-2 text-sm text-slate-300">
          当前工具：
          <span className="ml-2 font-medium text-white">
            {tools.find((tool) => tool.key === activeTool)?.label}
          </span>
        </div>
      </div>

      {panel}
    </div>
  )
}
