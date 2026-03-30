import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getWorldBulletin, getWorldRumors, type WorldBulletinPayload, type WorldRumorsPayload } from '../../services/api'
import { PanelShell } from '../ui/PanelShell'

const EMPTY_BULLETIN: WorldBulletinPayload = {
  posts: [],
  hot_topics: [],
}

const RUMOR_TYPE_ICON: Record<string, string> = {
  affair: '💕',
  crime_witness: '🔍',
  hidden_talent: '🎭',
  past_event: '📜',
}

export function BulletinPanel() {
  const { t } = useTranslation()
  const [board, setBoard] = useState<WorldBulletinPayload>(EMPTY_BULLETIN)
  const [rumors, setRumors] = useState<WorldRumorsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshBoard = async () => {
    setLoading(true)
    setError(null)
    try {
      const [b, r] = await Promise.all([getWorldBulletin(), getWorldRumors()])
      setBoard(b)
      setRumors(r)
    } catch {
      setError(t('bulletin.error', '公告板加载失败'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const loadInitial = async () => {
      try {
        const [b, r] = await Promise.all([getWorldBulletin(), getWorldRumors()])
        if (!cancelled) {
          setBoard(b)
          setRumors(r)
        }
      } catch {
        if (!cancelled) {
          setError(t('bulletin.error', '公告板加载失败'))
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
  }, [t])

  return (
    <PanelShell icon="📌" title={t('bulletin.title', '公告板')} badge="Bulletin">
      <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Town Buzz</p>
          <p className="mt-2 text-sm text-slate-200">{board.posts.length} {t('bulletin.posts', '条新帖')} · {board.hot_topics.length} {t('bulletin.topics', '个热话题')}</p>
        </div>
        <button
          type="button"
          onClick={() => void refreshBoard()}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          aria-label={t('bulletin.refresh', '刷新公告板')}
        >
          {t('bulletin.refresh', '刷新公告板')}
        </button>
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-400">{t('bulletin.loading', '公告板加载中…')}</p> : null}

      <section className="grid gap-3 lg:grid-cols-[0.95fr,1.05fr]">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <h4 className="text-sm font-semibold text-white">{t('bulletin.hot_topics', '热议话题')}</h4>
          <div className="mt-3 grid gap-2">
            {board.hot_topics.length === 0 ? (
              <p className="text-sm text-slate-500">{t('bulletin.no_topics', '暂无热议。')}</p>
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
          <h4 className="text-sm font-semibold text-white">{t('bulletin.latest_posts', '最新帖子')}</h4>
          <div className="mt-3 grid gap-3">
            {board.posts.length === 0 ? (
              <p className="text-sm text-slate-500">{t('bulletin.no_posts', '公告板还没有内容。')}</p>
            ) : (
              board.posts.map((post) => (
                <article key={post.id} className="rounded-lg bg-slate-900/40 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-white">{post.author_name ?? post.author_id}</span>
                    <span className="text-xs text-slate-400">{post.likes.length} likes</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-200">{post.content}</p>
                  <p className="mt-2 text-xs text-amber-200">
                    {t('bulletin.topic_label', '话题')}：{post.topic === post.category ? post.category : board.hot_topics.find((item) => item.topic === post.topic)?.label ?? post.topic}
                  </p>
                </article>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Rumors / whispers section */}
      {rumors && rumors.rumors.length > 0 && (
        <section className="rounded-xl border border-violet-400/15 bg-violet-400/[0.03] p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">🤫</span>
            <h4 className="text-sm font-semibold text-violet-200">{t('bulletin.whispers', '小道消息')}</h4>
            <span className="ml-auto text-[10px] text-slate-500">{rumors.total_spread} {t('bulletin.spreading', '条流传中')}</span>
          </div>
          <div className="grid gap-2">
            {rumors.rumors.slice(0, 8).map((rumor) => (
              <div
                key={rumor.secret_id}
                className="rounded-lg border border-white/[0.04] bg-slate-950/40 px-3 py-2.5"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 text-sm">{RUMOR_TYPE_ICON[rumor.type] ?? '💬'}</span>
                  <div className="flex-1">
                    <p className="text-sm text-slate-200 italic">
                      "{rumor.content}"
                    </p>
                    <div className="mt-1.5 flex items-center gap-3 text-[10px] text-slate-500">
                      <span>{t('bulletin.about', '关于')} {rumor.owner_name}</span>
                      <span>·</span>
                      <span>{rumor.spread_count} {t('bulletin.people_know', '人知晓')}</span>
                      {rumor.is_public && (
                        <>
                          <span>·</span>
                          <span className="text-rose-400">{t('bulletin.public', '已公开')}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {rumors.recent_leaks.length > 0 && (
            <div className="mt-3 border-t border-white/[0.06] pt-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">{t('bulletin.recent_leaks', '最近泄露')}</p>
              {rumors.recent_leaks.slice(0, 3).map((leak, i) => (
                <p key={i} className="text-[11px] text-slate-400 mb-1">
                  Tick {leak.tick}: {leak.told_to_name} {t('bulletin.learned_about', '得知了关于')} {leak.owner_name} {t('bulletin.secret_suffix', '的秘密')}
                </p>
              ))}
            </div>
          )}
        </section>
      )}
    </PanelShell>
  )
}
