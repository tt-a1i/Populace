import { useEffect, useState } from 'react'

import { getWorldDiplomacy, type WorldDiplomacyPayload } from '../../services/api'
import { PanelShell } from '../ui/PanelShell'
import { PanelEmptyState, PanelSkeletonGrid, PanelSpinner } from '../ui/PanelStates'

const EMPTY_DIPLOMACY: WorldDiplomacyPayload = {
  towns: [],
  trade_routes: [],
  summary: {
    active_routes: 0,
    total_profit: 0,
    total_trade_balance: 0,
  },
  ledger: [],
}

export function DiplomacyPanel() {
  const [data, setData] = useState<WorldDiplomacyPayload>(EMPTY_DIPLOMACY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await getWorldDiplomacy())
    } catch {
      setData(EMPTY_DIPLOMACY)
      setError('外交数据加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const loadInitial = async () => {
      try {
        const nextData = await getWorldDiplomacy()
        if (!cancelled) {
          setData(nextData)
        }
      } catch {
        if (!cancelled) {
          setData(EMPTY_DIPLOMACY)
          setError('外交数据加载失败')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadInitial()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <PanelShell icon="🤝" title="外交面板" badge="Diplomacy">
      <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">贸易总览</p>
          <p className="mt-2 text-3xl font-semibold text-white">{data.summary.active_routes} 条路线</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          aria-label="刷新外交"
        >
          刷新外交
        </button>
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {loading ? (
        <>
          <PanelSpinner title="外交数据加载中…" message="正在同步邻镇关系、贸易路线与账本记录。" />
          <PanelSkeletonGrid columns={3} />
        </>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard label="活跃路线" value={String(data.summary.active_routes)} />
        <MetricCard label="累计利润" value={data.summary.total_profit.toFixed(1)} />
        <MetricCard label="贸易余额" value={data.summary.total_trade_balance.toFixed(1)} />
      </section>

      <section className="grid gap-3 lg:grid-cols-[1fr,1fr]">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <h4 className="text-sm font-semibold text-white">邻近城镇</h4>
          <div className="mt-3 grid gap-2">
            {data.towns.length === 0 ? (
              <PanelEmptyState title="暂无邻镇" message="当前还没有建立稳定的对外联系。" />
            ) : (
              data.towns.map((town) => (
                <div key={town.name} className="rounded-lg bg-slate-950/40 px-3 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm text-white">
                    <span>{town.name}</span>
                    <span>{town.relation_status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {town.specialties.join(' / ') || 'no specialties'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <h4 className="text-sm font-semibold text-white">贸易路线</h4>
          <div className="mt-3 grid gap-2">
            {data.trade_routes.length === 0 ? (
              <PanelEmptyState title="暂无路线" message="当前没有活跃的跨镇贸易路线。" />
            ) : (
              data.trade_routes.map((route) => (
                <div key={route.id} className="rounded-lg bg-slate-950/40 px-3 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm text-white">
                    <span>{`${route.from_town} → ${route.to_town}`}</span>
                    <span>{route.relation_status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{route.goods.join(', ') || 'no goods'}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
        <h4 className="text-sm font-semibold text-white">外交账本</h4>
        <div className="mt-3 grid gap-2">
          {data.ledger.length === 0 ? (
            <PanelEmptyState title="暂无账本记录" message="贸易或外交事件发生后，这里会显示流水。" />
          ) : (
            data.ledger.map((entry) => (
              <div key={`${entry.route_id}-${entry.tick}`} className="rounded-lg bg-slate-950/40 px-3 py-3">
                <div className="flex items-center justify-between gap-3 text-sm text-white">
                  <span>{`${entry.town_name} 账本`}</span>
                  <span>{entry.amount.toFixed(1)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{entry.description}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </PanelShell>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  )
}
