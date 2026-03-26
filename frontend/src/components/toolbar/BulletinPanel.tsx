import { useEffect, useState } from 'react'

import { getWorldBulletin, type WorldBulletinPayload } from '../../services/api'
import { PanelShell } from '../ui/PanelShell'

const EMPTY_BULLETIN: WorldBulletinPayload = {
  posts: [],
  hot_topics: [],
}

export function BulletinPanel() {
  const [board, setBoard] = useState<WorldBulletinPayload>(EMPTY_BULLETIN)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshBoard = async () => {
    setLoading(true)
    setError(null)
    try {
      setBoard(await getWorldBulletin())
    } catch {
      setError('公告板加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const loadInitial = async () => {
      try {
        const nextBoard = await getWorldBulletin()
        if (!cancelled) {
          setBoard(nextBoard)
        }
      } catch {
        if (!cancelled) {
          setError('公告板加载失败')
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
    <PanelShell icon="📌" title="公告板" badge="Bulletin">
      <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Town Buzz</p>
          <p className="mt-2 text-sm text-slate-200">{board.posts.length} 条新帖 · {board.hot_topics.length} 个热话题</p>
        </div>
        <button
          type="button"
          onClick={() => void refreshBoard()}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          aria-label="刷新公告板"
        >
          刷新公告板
        </button>
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-400">公告板加载中…</p> : null}

      <section className="grid gap-3 lg:grid-cols-[0.95fr,1.05fr]">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <h4 className="text-sm font-semibold text-white">热议话题</h4>
          <div className="mt-3 grid gap-2">
            {board.hot_topics.length === 0 ? (
              <p className="text-sm text-slate-500">暂无热议。</p>
            ) : (
              board.hot_topics.map((topic) => (
                <div key={topic.topic} className="rounded-lg bg-slate-900/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-white">#{topic.label}</span>
                    <span className="text-xs text-slate-400">{topic.post_count}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <h4 className="text-sm font-semibold text-white">最新帖子</h4>
          <div className="mt-3 grid gap-3">
            {board.posts.length === 0 ? (
              <p className="text-sm text-slate-500">公告板还没有内容。</p>
            ) : (
              board.posts.map((post) => (
                <article key={post.id} className="rounded-lg bg-slate-900/40 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-white">{post.author_name ?? post.author_id}</span>
                    <span className="text-xs text-slate-400">{post.likes.length} likes</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-200">{post.content}</p>
                  <p className="mt-2 text-xs text-amber-200">
                    话题：{post.topic === post.category ? post.category : board.hot_topics.find((item) => item.topic === post.topic)?.label ?? post.topic}
                  </p>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </PanelShell>
  )
}
