import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getWorldMarket, type MarketGood } from '../../services/api'
import { PanelShell } from '../ui/PanelShell'
import { PanelEmptyState, PanelSkeletonGrid, PanelSpinner } from '../ui/PanelStates'
import { SparkLine } from '../ui/SparkLine'

function TrendArrow({ trend }: { trend: MarketGood['trend'] }) {
  if (trend === 'up') return <span className="text-rose-400 font-bold">↑</span>
  if (trend === 'down') return <span className="text-emerald-400 font-bold">↓</span>
  return <span className="text-slate-400">→</span>
}

function ChangeBadge({ pct }: { pct: number }) {
  if (Math.abs(pct) < 0.5) return null
  const up = pct > 0
  return (
    <span className={`text-xs font-semibold ${up ? 'text-rose-400' : 'text-emerald-400'}`}>
      {up ? '+' : ''}{pct.toFixed(1)}%
    </span>
  )
}

export function MarketPanel() {
  const { t } = useTranslation()
  const [goods, setGoods] = useState<MarketGood[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getWorldMarket()
      setGoods(data.goods)
    } catch {
      setError(t('market.error', '市场数据加载失败'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <PanelShell icon="🛒" title={t('market.title', '市场行情')} badge="Market">
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {loading ? (
        <>
          <PanelSpinner
            title={t('market.loading', '市场数据加载中…')}
            message={t('market.loading_msg', '正在汇总商品价格与库存。')}
          />
          <PanelSkeletonGrid columns={2} rows={4} />
        </>
      ) : null}

      {!loading && goods.length === 0 ? (
        <PanelEmptyState title={t('market.empty', '暂无市场数据。')} />
      ) : null}

      {!loading && goods.length > 0 ? (
        <>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-slate-400">{goods.length} {t('market.goods_count', '种商品')}</span>
            <button
              aria-label={t('market.refresh', '刷新市场')}
              className="rounded px-2 py-0.5 text-xs text-slate-400 hover:text-white hover:bg-white/10 transition"
              onClick={() => void load()}
            >
              {t('market.refresh', '刷新市场')}
            </button>
          </div>

          <div className="grid gap-2">
            {goods.map((good) => (
              <div
                key={good.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl" aria-hidden="true">{good.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{good.name}</p>
                      <p className="text-xs text-slate-400">
                        {t('market.stock', '库存')}: {good.inventory}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <TrendArrow trend={good.trend} />
                        <span className="text-sm font-bold text-white">
                          {good.current_price.toFixed(2)}
                        </span>
                      </div>
                      <ChangeBadge pct={good.change_pct} />
                    </div>
                    {good.price_history.length >= 2 ? (
                      <SparkLine
                        data={good.price_history}
                        width={64}
                        height={28}
                        color={good.trend === 'up' ? '#f87171' : good.trend === 'down' ? '#34d399' : '#94a3b8'}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </PanelShell>
  )
}
