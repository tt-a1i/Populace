import { useEffect, useState } from 'react'

import { getWorldGangs, type GangData, type GangEvent, type WorldGangsPayload } from '../../services/api'
import { PanelShell } from '../ui/PanelShell'
import { PanelEmptyState, PanelSkeletonGrid, PanelSpinner } from '../ui/PanelStates'

const EMPTY_GANGS: WorldGangsPayload = {
  gangs: [],
  recent_events: [],
}

interface GangCardProps {
  gang: GangData
}

function GangCard({ gang }: GangCardProps) {
  return (
    <div
      className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4"
      style={{ borderColor: `${gang.color}40` }}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">{gang.name}</h4>
        <span
          className="rounded-full px-2 py-0.5 text-xs"
          style={{ backgroundColor: gang.color, color: '#fff' }}
        >
          {gang.activity}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-sm">
        <div className="flex items-center justify-between text-slate-300">
          <span>领袖</span>
          <span className="text-white">{gang.leader_name || '无'}</span>
        </div>
        <div className="flex items-center justify-between text-slate-300">
          <span>成员</span>
          <span className="text-white">{gang.member_count} 人</span>
        </div>
        <div className="flex items-center justify-between text-slate-300">
          <span>领地</span>
          <span className="text-white">{gang.territory || '无'}</span>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>影响力</span>
          <span>{Math.round(gang.influence * 100)}%</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-900/60">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${gang.influence * 100}%`, backgroundColor: gang.color }}
          />
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-500">
        创建于 Tick {gang.created_tick} · 最后行动 Tick {gang.last_action_tick}
      </div>
    </div>
  )
}

interface EventItemProps {
  event: GangEvent
}

function EventItem({ event }: EventItemProps) {
  const typeLabels: Record<string, string> = {
    成立: '🎯',
    招募: '👥',
    冲突: '⚔️',
    扩张: '📍',
  }

  const icon = typeLabels[event.type] || '📋'

  return (
    <div className="rounded-lg bg-slate-900/40 px-3 py-3">
      <div className="flex items-start gap-2">
        <span className="text-lg">{icon}</span>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-200">{event.description}</span>
            <span className="text-xs text-slate-500">Tick {event.tick}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: event.gang_color }}
            />
            <span className="text-xs text-slate-400">{event.gang_name} · {event.type}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function GangPanel() {
  const [data, setData] = useState<WorldGangsPayload>(EMPTY_GANGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const nextData = await getWorldGangs()
        if (!cancelled) {
          setData(nextData)
        }
      } catch {
        if (!cancelled) {
          setData(EMPTY_GANGS)
          setError('帮派数据加载失败')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <PanelShell icon="🗡️" title="势力面板" badge="Gangs">
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {loading ? (
        <>
          <PanelSpinner title="帮派数据加载中…" message="正在汇总地下势力分布与近期事件。" />
          <PanelSkeletonGrid columns={3} rows={2} />
        </>
      ) : null}

      {data.gangs.length === 0 && !loading ? (
        <section className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-6">
          <PanelEmptyState
            title="暂无帮派势力"
            message="小镇目前风平浪静，没有地下势力活动。随着模拟进行，可能会随机生成帮派。"
          />
        </section>
      ) : (
        <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.gangs.map((gang) => (
            <GangCard key={gang.name} gang={gang} />
          ))}
        </section>
      )}

      <section className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">近期事件</h4>
          <span className="text-xs text-slate-400">{data.recent_events.length} 条</span>
        </div>
        <div className="mt-3 grid gap-2">
          {data.recent_events.length === 0 ? (
            <PanelEmptyState
              title="暂无事件记录"
              message="帮派活动、冲突或扩张事件会显示在这里。"
            />
          ) : (
            data.recent_events.map((event, index) => (
              <EventItem key={`${event.gang_name}-${event.tick}-${index}`} event={event} />
            ))
          )}
        </div>
      </section>
    </PanelShell>
  )
}
