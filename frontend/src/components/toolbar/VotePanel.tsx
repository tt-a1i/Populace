import { useEffect, useState } from 'react'

import { createVote, getActiveVotes, getVoteHistory } from '../../services/api'
import { useSimulationStore } from '../../stores/simulation'
import { PanelShell } from '../ui/PanelShell'

function normalizeOptions(raw: string): string[] {
  const deduped: string[] = []
  for (const line of raw.split('\n').map((item) => item.trim()).filter(Boolean)) {
    if (!deduped.includes(line)) {
      deduped.push(line)
    }
  }
  return deduped
}

export function VotePanel() {
  const activeVotes = useSimulationStore((state) => state.activeVotes)
  const voteHistory = useSimulationStore((state) => state.voteHistory)
  const setActiveVotes = useSimulationStore((state) => state.setActiveVotes)
  const setVoteHistory = useSimulationStore((state) => state.setVoteHistory)

  const [issue, setIssue] = useState('')
  const [optionsText, setOptionsText] = useState('建新公园\n维持现状')
  const [durationTicks, setDurationTicks] = useState(8)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [active, history] = await Promise.all([getActiveVotes(), getVoteHistory()])
        if (!cancelled) {
          setActiveVotes(active)
          setVoteHistory(history)
        }
      } catch {
        if (!cancelled) {
          setError('投票数据加载失败')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [setActiveVotes, setVoteHistory])

  const handleSubmit = async () => {
    const options = normalizeOptions(optionsText)
    if (!issue.trim()) {
      setError('请输入投票议题')
      return
    }
    if (options.length < 2) {
      setError('至少需要两个投票选项')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await createVote({
        issue: issue.trim(),
        options,
        duration_ticks: durationTicks,
      })
      const [active, history] = await Promise.all([getActiveVotes(), getVoteHistory()])
      setActiveVotes(active)
      setVoteHistory(history)
      setIssue('')
      setOptionsText('建新公园\n维持现状')
      setDurationTicks(8)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '发起投票失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PanelShell icon="🗳️" title="社区投票" badge="Community">
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs text-slate-300">
            投票议题
            <input
              value={issue}
              onChange={(event) => setIssue(event.target.value)}
              placeholder="例如：社区是否扩建图书馆"
              className="panel-input"
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-300">
            投票选项
            <textarea
              value={optionsText}
              onChange={(event) => setOptionsText(event.target.value)}
              rows={3}
              className="panel-input resize-none"
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-300">
            持续 Tick
            <input
              type="number"
              min={1}
              max={240}
              value={durationTicks}
              onChange={(event) => setDurationTicks(Number(event.target.value))}
              className="panel-input"
            />
          </label>
          {error && <p className="text-xs text-rose-300">{error}</p>}
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy}
            className="btn-primary rounded-xl px-3 py-2 text-sm font-semibold"
          >
            {busy ? '提交中…' : '发起投票'}
          </button>
        </div>
      </div>

      <section className="grid gap-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">进行中</h4>
          <span className="text-xs text-slate-500">{activeVotes.length} 项</span>
        </div>
        {activeVotes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-sm text-slate-500">当前没有进行中的社区投票。</p>
        ) : (
          activeVotes.map((vote) => (
            <article key={vote.id} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
              <div className="flex items-center justify-between gap-3">
                <h5 className="text-sm font-semibold text-white">{vote.issue}</h5>
                <span className="text-xs text-cyan-300">{vote.total_votes} 票</span>
              </div>
              <div className="mt-3 grid gap-2">
                {vote.options.map((option) => (
                  <div key={option} className="flex items-center justify-between rounded-lg bg-slate-900/40 px-3 py-2 text-sm">
                    <span>{option}</span>
                    <span>{vote.counts[option] ?? 0} 票</span>
                  </div>
                ))}
              </div>
            </article>
          ))
        )}
      </section>

      <section className="grid gap-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">历史决议</h4>
          <span className="text-xs text-slate-500">{voteHistory.length} 项</span>
        </div>
        {voteHistory.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-sm text-slate-500">尚未产生社区决议。</p>
        ) : (
          voteHistory.map((vote) => (
            <article key={vote.id} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
              <div className="flex items-center justify-between gap-3">
                <h5 className="text-sm font-semibold text-white">{vote.issue}</h5>
                <span className="text-xs text-emerald-300">{vote.winning_option ?? '未定'}</span>
              </div>
              {vote.effects && vote.effects.length > 0 ? (
                <p className="mt-2 text-xs text-slate-400">{vote.effects.join('，')}</p>
              ) : null}
            </article>
          ))
        )}
      </section>
    </PanelShell>
  )
}
