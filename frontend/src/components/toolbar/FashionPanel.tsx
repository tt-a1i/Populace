import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getWorldFashion, type WorldFashionPayload } from '../../services/api'
import { PanelShell } from '../ui/PanelShell'
import { PanelEmptyState, PanelSkeletonGrid, PanelSpinner } from '../ui/PanelStates'

const EMPTY_FASHION: WorldFashionPayload = {
  current_trend: {
    color_name: 'sky',
    color: '#38BDF8',
    style: 'classic',
    category: 'casual',
    started_tick: 0,
  },
  trend_history: [],
  rankings: [],
  consumption: {
    total_purchases: 0,
    total_spent: 0,
    average_spend: 0,
    top_category: null,
    top_color: null,
    recent_purchases: [],
  },
}

export function FashionPanel() {
  const { t } = useTranslation()
  const [data, setData] = useState<WorldFashionPayload>(EMPTY_FASHION)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const nextData = await getWorldFashion()
        if (!cancelled) {
          setData(nextData)
        }
      } catch {
        if (!cancelled) {
          setData(EMPTY_FASHION)
          setError(t('fashion.error'))
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
  }, [t])

  const trend = data.current_trend

  return (
    <PanelShell icon="👗" title={t('fashion.title')} badge={t('fashion.badge')}>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {loading ? (
        <>
          <PanelSpinner title={t('fashion.loading_title')} message={t('fashion.loading_message')} />
          <PanelSkeletonGrid columns={3} rows={2} />
        </>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label={t('fashion.current_trend')} value={`${trend.color_name} · ${trend.style}`} swatch={trend.color} />
        <MetricCard label={t('fashion.total_spent')} value={`${data.consumption.total_spent}`} />
        <MetricCard label={t('fashion.avg_spend')} value={`${data.consumption.average_spend}`} />
      </div>

      <section className="grid gap-3 lg:grid-cols-[1.15fr,0.85fr]">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-white">{t('fashion.trend_section')}</h4>
              <p className="mt-1 text-xs text-slate-400">
                {t('fashion.trend_desc', { category: trend.category, color: trend.color_name })}
              </p>
            </div>
            <span
              className="h-10 w-10 rounded-full border border-white/20 shadow-inner"
              style={{ backgroundColor: trend.color }}
            />
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {data.trend_history.length === 0 ? (
              <PanelEmptyState title={t('fashion.trend_history_empty')} message={t('fashion.trend_history_hint')} />
            ) : (
              data.trend_history.map((entry) => (
                <div
                  key={`${entry.started_tick}-${entry.color_name}-${entry.style}`}
                  className="min-w-28 rounded-xl border border-white/10 bg-slate-950/40 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
                    <p className="text-sm font-medium text-white">{entry.color_name}</p>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    {entry.style} · {entry.category}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">Tick {entry.started_tick}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <h4 className="text-sm font-semibold text-white">{t('fashion.consumption_section')}</h4>
          <div className="mt-3 grid gap-2 text-sm text-slate-300">
            <StatRow label={t('fashion.purchase_count')} value={String(data.consumption.total_purchases)} />
            <StatRow label={t('fashion.top_category')} value={data.consumption.top_category ?? t('fashion.none')} />
            <StatRow label={t('fashion.top_color')} value={data.consumption.top_color ?? t('fashion.none')} />
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-[1fr,1fr]">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <h4 className="text-sm font-semibold text-white">{t('fashion.ranking_section')}</h4>
          <div className="mt-3 grid gap-2">
            {data.rankings.length === 0 ? (
              <PanelEmptyState title={t('fashion.ranking_empty')} message={t('fashion.ranking_hint')} />
            ) : (
              data.rankings.map((entry, index) => (
                <article key={entry.resident_id} className="rounded-xl border border-white/8 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-9 w-9 rounded-full border border-white/20"
                        style={{ backgroundColor: entry.accent_color }}
                      />
                      <div>
                        <p className="text-sm font-medium text-white">#{index + 1} {entry.resident_name}</p>
                        <p className="text-xs text-slate-400">{entry.current_outfit}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-amber-200">{Math.round(entry.style_score * 100)}%</p>
                      <p className="text-[11px] text-slate-500">{entry.clothing}</p>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <h4 className="text-sm font-semibold text-white">{t('fashion.recent_section')}</h4>
          <div className="mt-3 grid gap-2">
            {data.consumption.recent_purchases.length === 0 ? (
              <PanelEmptyState title={t('fashion.recent_empty')} message={t('fashion.recent_hint')} />
            ) : (
              data.consumption.recent_purchases.map((purchase) => (
                <div key={`${purchase.tick}-${purchase.resident_id}-${purchase.item_name}`} className="rounded-xl border border-white/8 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-white">{purchase.resident_name}</p>
                      <p className="text-xs text-slate-400">{purchase.item_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-emerald-300">{purchase.price}</p>
                      <p className="text-[11px] text-slate-500">Tick {purchase.tick}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </PanelShell>
  )
}

function MetricCard({
  label,
  value,
  swatch,
}: {
  label: string
  value: string
  swatch?: string
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
        {swatch ? <span className="h-3 w-3 rounded-full" style={{ backgroundColor: swatch }} /> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/40 px-3 py-2">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  )
}
