import { useEffect, useState } from 'react'

import { getWorldPolitics, type WorldPoliticsPayload } from '../../services/api'
import { PanelShell } from '../ui/PanelShell'
import { PanelEmptyState, PanelSkeletonGrid, PanelSpinner } from '../ui/PanelStates'

const EMPTY_POLITICS: WorldPoliticsPayload = {
  mayor: null,
  active_policies: [],
  election_countdown: 0,
  public_satisfaction: 0,
  party_distribution: {},
  active_election: null,
  impeachment_risk: false,
}

export function PoliticsPanel() {
  const [data, setData] = useState<WorldPoliticsPayload>(EMPTY_POLITICS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await getWorldPolitics())
    } catch {
      setData(EMPTY_POLITICS)
      setError('政治数据加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const loadInitial = async () => {
      try {
        const nextData = await getWorldPolitics()
        if (!cancelled) {
          setData(nextData)
        }
      } catch {
        if (!cancelled) {
          setData(EMPTY_POLITICS)
          setError('政治数据加载失败')
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
    <PanelShell icon="🏛️" title="政治面板" badge="Politics">
      <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">公共满意度</p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {Math.round(data.public_satisfaction * 100)}%
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          aria-label="刷新政治"
        >
          刷新政治
        </button>
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {loading ? (
        <>
          <PanelSpinner title="政治数据加载中…" message="正在整理镇长、政策与选举信息。" />
          <PanelSkeletonGrid columns={4} />
        </>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard label="镇长" value={data.mayor?.resident_name ?? '空缺'} />
        <MetricCard label="党派" value={data.mayor?.party ?? 'neutral'} />
        <MetricCard label="下次选举" value={`${data.election_countdown} tick`} />
        <MetricCard label="弹劾风险" value={data.impeachment_risk ? '高' : '低'} />
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.1fr,0.9fr]">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <h4 className="text-sm font-semibold text-white">现任镇长与政策</h4>
          {data.mayor ? (
            <div className="mt-3 rounded-lg bg-slate-950/40 px-3 py-3 text-sm text-slate-200">
              <div className="flex items-center justify-between gap-3 text-white">
                <span>{data.mayor.resident_name}</span>
                <span>{Math.round(data.mayor.approval * 100)}%</span>
              </div>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">{data.mayor.party}</p>
            </div>
          ) : (
            <PanelEmptyState title="暂无镇长" message="当前没有活跃的镇长记录。" />
          )}
          <div className="mt-3 grid gap-2">
            {data.active_policies.length === 0 ? (
              <PanelEmptyState title="暂无政策" message="当前没有处于生效中的公共政策。" />
            ) : (
              data.active_policies.map((policy) => (
                <div key={`${policy.type}-${policy.issued_tick ?? 0}`} className="rounded-lg bg-slate-950/40 px-3 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm text-white">
                    <span>{policy.type}</span>
                    <span>{policy.duration} tick</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{Object.keys(policy.effect).join(', ') || 'no effect'}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
            <h4 className="text-sm font-semibold text-white">党派分布</h4>
            <div className="mt-3 grid gap-2">
              {Object.entries(data.party_distribution).map(([party, count]) => (
                <div key={party} className="flex items-center justify-between rounded-lg bg-slate-950/40 px-3 py-2 text-sm text-slate-200">
                  <span>{party}</span>
                  <span>{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
            <h4 className="text-sm font-semibold text-white">当前选举</h4>
            {data.active_election ? (
              <div className="mt-3 rounded-lg bg-slate-950/40 px-3 py-3 text-sm text-slate-200">
                <div className="flex items-center justify-between gap-3 text-white">
                  <span>{data.active_election.issue}</span>
                  <span>{data.active_election.total_votes}</span>
                </div>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                  {data.active_election.status}
                </p>
              </div>
            ) : (
              <PanelEmptyState title="暂无进行中选举" message="当前没有需要投票表决的政治事件。" />
            )}
          </div>
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
