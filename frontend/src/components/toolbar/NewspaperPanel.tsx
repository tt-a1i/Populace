import { useEffect, useState } from 'react'

import {
  getWorldNewspaper,
  getWorldNewspaperArchive,
  type NewspaperArchivePayload,
  type NewspaperIssuePayload,
  type NewspaperLatestPayload,
} from '../../services/api'

const SECTION_LABELS: Record<string, { icon: string; label: string }> = {
  economy: { icon: '💰', label: '经济' },
  society: { icon: '🏘', label: '社会' },
  gossip: { icon: '💬', label: '坊间' },
  events: { icon: '⚡', label: '要闻' },
}

const EMPTY_LATEST: NewspaperLatestPayload = { issue: null }
const EMPTY_ARCHIVE: NewspaperArchivePayload = { issues: [] }

export function NewspaperPanel() {
  const [latest, setLatest] = useState<NewspaperLatestPayload>(EMPTY_LATEST)
  const [archive, setArchive] = useState<NewspaperArchivePayload>(EMPTY_ARCHIVE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showArchive, setShowArchive] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [lat, arc] = await Promise.all([getWorldNewspaper(), getWorldNewspaperArchive()])
      setLatest(lat)
      setArchive(arc)
    } catch {
      setError('日报加载失败')
      setLatest(EMPTY_LATEST)
      setArchive(EMPTY_ARCHIVE)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const loadInitial = async () => {
      try {
        const [lat, arc] = await Promise.all([getWorldNewspaper(), getWorldNewspaperArchive()])
        if (!cancelled) {
          setLatest(lat)
          setArchive(arc)
        }
      } catch {
        if (!cancelled) {
          setError('日报加载失败')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadInitial()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="grid gap-3">
      {/* Masthead */}
      <div className="rounded-xl border border-amber-400/20 bg-amber-950/30 px-4 py-3 text-center">
        <p className="text-[9px] uppercase tracking-[0.5em] text-amber-400/50">✦ 号外 · 号外 ✦</p>
        <h1 className="mt-1 text-2xl font-bold tracking-widest text-amber-200" aria-label="小镇日报">
          《小镇日报》
        </h1>
        <div className="mt-1 flex items-center justify-center gap-3 text-[10px] text-amber-400/60">
          {latest.issue ? (
            <>
              <span>第 {latest.issue.issue_id.split('-')[1]} 期</span>
              <span>·</span>
              <span>Tick {latest.issue.tick}</span>
            </>
          ) : (
            <span>暂无发行</span>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="ml-2 rounded border border-amber-400/20 px-2 py-0.5 text-[9px] text-amber-400/60 transition hover:bg-amber-400/10 disabled:opacity-40"
            aria-label="刷新日报"
          >
            {loading ? '…' : '刷新'}
          </button>
        </div>
        <div className="mt-2 border-t border-amber-400/15" />
      </div>

      {error ? <p className="text-center text-sm text-rose-300">{error}</p> : null}

      {loading && !latest.issue ? (
        <p className="py-6 text-center text-sm text-amber-400/40">正在排版印刷中…</p>
      ) : latest.issue ? (
        <IssueDisplay issue={latest.issue} />
      ) : (
        <p className="py-6 text-center text-sm text-amber-400/40">日报尚未发行，模拟运行 20 tick 后自动生成第一期。</p>
      )}

      {/* Archive toggle */}
      <div className="border-t border-amber-400/10 pt-2">
        <button
          type="button"
          onClick={() => setShowArchive((v) => !v)}
          className="w-full rounded-lg border border-amber-400/15 bg-amber-950/20 px-3 py-2 text-xs text-amber-300/70 transition hover:bg-amber-950/40"
          aria-expanded={showArchive}
          aria-label="查看往期"
        >
          {showArchive ? '▲ 收起往期' : '▼ 查看往期'}
        </button>
        {showArchive && (
          <div className="mt-2 space-y-2" role="list" aria-label="往期日报列表">
            {archive.issues.length === 0 ? (
              <p className="py-3 text-center text-xs text-amber-400/40">暂无往期存档</p>
            ) : (
              archive.issues.map((issue) => (
                <div
                  key={issue.issue_id}
                  role="listitem"
                  className="rounded-lg border border-amber-400/10 bg-amber-950/20 px-3 py-2"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-amber-300">
                      第 {issue.issue_id.split('-')[1]} 期
                    </span>
                    <span className="text-[10px] text-amber-400/50">Tick {issue.tick}</span>
                  </div>
                  {issue.headlines[0] ? (
                    <p className="mt-0.5 text-[11px] text-amber-200/70">{issue.headlines[0]}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function IssueDisplay({ issue }: { issue: NewspaperIssuePayload }) {
  const [mainHeadline, ...subHeadlines] = issue.headlines

  return (
    <div className="grid gap-3">
      {/* Main headline */}
      <div className="rounded-xl border border-amber-400/25 bg-amber-950/40 px-4 py-4 text-center">
        <p className="text-[9px] uppercase tracking-[0.3em] text-amber-400/50">头条</p>
        <h2 className="mt-2 text-base font-bold leading-snug text-amber-100" aria-label={`头条：${mainHeadline}`}>
          {mainHeadline}
        </h2>
      </div>

      {/* Sub-headlines */}
      {subHeadlines.length > 0 && (
        <div className="space-y-1">
          {subHeadlines.map((hl, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg border border-amber-400/10 bg-amber-950/20 px-3 py-2"
            >
              <span className="mt-0.5 text-[10px] text-amber-400/50">◆</span>
              <p className="text-xs text-amber-200/80">{hl}</p>
            </div>
          ))}
        </div>
      )}

      {/* Sections */}
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(SECTION_LABELS).map(([key, meta]) => {
          const content = issue.sections[key]
          if (!content) return null
          return (
            <div
              key={key}
              className="rounded-lg border border-amber-400/10 bg-amber-950/20 px-3 py-2"
            >
              <div className="mb-1 flex items-center gap-1.5">
                <span className="text-sm">{meta.icon}</span>
                <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-amber-400/60">
                  {meta.label}
                </span>
              </div>
              <p className="text-[11px] leading-5 text-amber-200/70">{content}</p>
            </div>
          )
        })}
      </div>

      {/* Footer rule */}
      <p className="text-center text-[9px] text-amber-400/30">
        ── 本期日报由模拟引擎自动排版 · 第 {issue.issue_id.split('-')[1]} 期 ──
      </p>
    </div>
  )
}
