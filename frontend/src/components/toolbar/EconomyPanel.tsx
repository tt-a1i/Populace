import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getWorldEconomy, getEconomyCycle, type WorldEconomyPayload, type EconomyCyclePayload } from '../../services/api'
import { AnimatedNumber } from '../ui/AnimatedNumber'
import { PanelShell } from '../ui/PanelShell'
import { PanelEmptyState, PanelSkeletonGrid, PanelSpinner } from '../ui/PanelStates'
import { SparkLine } from '../ui/SparkLine'

const PHASE_META: Record<string, { label: string; color: string; icon: string }> = {
  boom:       { label: '繁荣', color: 'text-emerald-300', icon: '📈' },
  recession:  { label: '衰退', color: 'text-amber-300',   icon: '📉' },
  depression: { label: '萧条', color: 'text-rose-300',    icon: '🔻' },
  recovery:   { label: '复苏', color: 'text-cyan-300',    icon: '🔄' },
}

export function EconomyPanel() {
  const { t } = useTranslation()
  const [data, setData] = useState<WorldEconomyPayload | null>(null)
  const [cycle, setCycle] = useState<EconomyCyclePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [ecoData, cycleData] = await Promise.all([getWorldEconomy(), getEconomyCycle()])
        if (!cancelled) {
          setData(ecoData)
          setCycle(cycleData)
        }
      } catch {
        if (!cancelled) {
          setData(null)
          setCycle(null)
          setError(t('economy.error', '经济数据加载失败'))
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

  const gdpBars = useMemo(() => (cycle?.gdp_history ?? data?.gdp_history ?? []).slice(-20), [cycle?.gdp_history, data?.gdp_history])
  const maxGdp = useMemo(() => Math.max(1, ...gdpBars.map((p) => Number(p.gdp))), [gdpBars])
  const employmentDistribution = useMemo(() => data?.employment_distribution ?? [], [data?.employment_distribution])
  const incomeDistribution = useMemo(() => data?.income_distribution ?? [], [data?.income_distribution])

  const phaseMeta = PHASE_META[cycle?.phase ?? 'recovery'] ?? PHASE_META.recovery
  const progressPct = cycle ? Math.round((cycle.ticks_in_phase / (cycle.ticks_in_phase + cycle.ticks_remaining)) * 100) : 0

  return (
    <PanelShell icon="💼" title={t('economy.title', '经济面板')} badge="Economy">
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {loading ? (
        <>
          <PanelSpinner title={t('economy.loading', '经济数据加载中…')} message={t('economy.loading_msg', '正在汇总就业率、收入与 GDP 趋势。')} />
          <PanelSkeletonGrid columns={3} rows={2} />
        </>
      ) : null}

      {/* Cycle indicator */}
      {cycle && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">{phaseMeta.icon}</span>
              <div>
                <p className={`text-sm font-semibold ${phaseMeta.color}`}>{phaseMeta.label}</p>
                <p className="text-[10px] text-slate-500">{t('economy.next_phase', '下阶段')}: {PHASE_META[cycle.next_phase]?.label ?? cycle.next_phase}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">GDP ×{cycle.gdp_modifier.toFixed(2)}</p>
              <p className="text-[10px] text-slate-500">{t('economy.seasonal', '季节')} ×{cycle.seasonal_modifier.toFixed(2)}</p>
            </div>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-cyan-400/60 transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="mt-1 text-[10px] text-slate-500 text-right">{cycle.ticks_remaining} ticks {t('economy.remaining', '剩余')}</p>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{t('economy.employment', 'Employment')}</p>
          <AnimatedNumber value={Math.round((data?.employment_rate ?? 0) * 100)} suffix="%" className="mt-1 block text-lg font-semibold text-white" />
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{t('economy.avg_income', 'Avg Income')}</p>
          <AnimatedNumber value={Math.round(data?.average_income ?? 0)} prefix="$" className="mt-1 block text-lg font-semibold text-white" />
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">GDP</p>
          <AnimatedNumber value={Math.round(data?.gdp ?? 0)} prefix="$" className="mt-1 block text-lg font-semibold text-white" />
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
        <p className="panel-section-label mb-2">{t('economy.employment_dist', '就业结构')}</p>
        {employmentDistribution.length === 0 ? (
          <PanelEmptyState title={t('economy.no_employment', '暂无就业结构数据')} message={t('economy.no_employment_hint', '等待更多居民进入工作与消费循环后，这里会显示职业分布。')} />
        ) : (
          <div className="flex flex-wrap gap-2">
            {employmentDistribution.map((entry) => (
              <span key={entry.occupation} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200">
                {entry.occupation}: {entry.count}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
        <p className="panel-section-label mb-2">{t('economy.income_dist', '收入分布')}</p>
        {incomeDistribution.length === 0 ? (
          <PanelEmptyState title={t('economy.no_income', '暂无收入分布')} message={t('economy.no_income_hint', '等待居民开始领薪、购物和交易后，这里会显示收入分层。')} />
        ) : (
          <div className="space-y-2">
            {incomeDistribution.map((entry) => (
              <div key={entry.bucket} className="flex items-center justify-between text-sm text-slate-200">
                <span>{entry.bucket}</span>
                <span>{entry.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
        <p className="panel-section-label mb-2">{t('economy.gdp_chart', 'GDP 曲线')}</p>
        {gdpBars.length >= 2 && (
          <div className="mb-2">
            <SparkLine data={gdpBars.map(p => Number(p.gdp))} color="#34d399" width={280} height={48} />
          </div>
        )}
        {gdpBars.length === 0 ? (
          <PanelEmptyState title={t('economy.no_gdp', '暂无 GDP 曲线')} message={t('economy.no_gdp_hint', '等待模拟运行几个 Tick 后，这里会出现经济曲线。')} />
        ) : (
          <div className="flex items-end gap-1 overflow-x-auto" style={{ height: '80px' }}>
            {gdpBars.map((point) => (
              <div
                key={point.tick}
                title={`tick ${point.tick}: ${point.gdp}`}
                className="w-3 shrink-0 rounded-t bg-emerald-400/70 transition-all duration-300"
                style={{ height: `${Math.max(4, (Number(point.gdp) / maxGdp) * 72)}px` }}
              />
            ))}
          </div>
        )}
      </div>
    </PanelShell>
  )
}
