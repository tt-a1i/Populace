import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getPersonalityStats, type PersonalityStatsPayload } from '../../services/api'
import { PanelShell } from '../ui/PanelShell'
import { PanelEmptyState, PanelSpinner } from '../ui/PanelStates'

const TRAIT_META: Record<
  keyof PersonalityStatsPayload,
  { icon: string; color: string; bgColor: string; labelKey: string; defaultLabel: string; descKey: string; defaultDesc: string }
> = {
  extraversion: {
    icon: '🗣️',
    color: 'bg-cyan-400',
    bgColor: 'bg-cyan-400/20',
    labelKey: 'personality.extraversion',
    defaultLabel: '外向性',
    descKey: 'personality.extraversion_desc',
    defaultDesc: '社交主动性',
  },
  optimism: {
    icon: '🌟',
    color: 'bg-amber-400',
    bgColor: 'bg-amber-400/20',
    labelKey: 'personality.optimism',
    defaultLabel: '乐观性',
    descKey: 'personality.optimism_desc',
    defaultDesc: '情绪恢复力',
  },
  thrift: {
    icon: '💰',
    color: 'bg-emerald-400',
    bgColor: 'bg-emerald-400/20',
    labelKey: 'personality.thrift',
    defaultLabel: '节俭性',
    descKey: 'personality.thrift_desc',
    defaultDesc: '消费克制度',
  },
  adventurousness: {
    icon: '🧭',
    color: 'bg-violet-400',
    bgColor: 'bg-violet-400/20',
    labelKey: 'personality.adventurousness',
    defaultLabel: '冒险性',
    descKey: 'personality.adventurousness_desc',
    defaultDesc: '旅行意愿',
  },
}

const TRAIT_ORDER: (keyof PersonalityStatsPayload)[] = [
  'extraversion',
  'optimism',
  'thrift',
  'adventurousness',
]

function TraitBar({
  traitKey,
  value,
}: {
  traitKey: keyof PersonalityStatsPayload
  value: number
}) {
  const { t } = useTranslation()
  const meta = TRAIT_META[traitKey]
  const pct = Math.round(value * 100)

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">{meta.icon}</span>
          <div>
            <p className="text-xs font-semibold text-slate-200">
              {t(meta.labelKey, meta.defaultLabel)}
            </p>
            <p className="text-[10px] text-slate-500">{t(meta.descKey, meta.defaultDesc)}</p>
          </div>
        </div>
        <span className="text-sm font-bold text-slate-200">{pct}%</span>
      </div>
      <div className={`h-2 w-full overflow-hidden rounded-full ${meta.bgColor}`}>
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${meta.color}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  )
}

export function PersonalityPanel() {
  const { t } = useTranslation()
  const [data, setData] = useState<PersonalityStatsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const stats = await getPersonalityStats()
        if (!cancelled) {
          setData(stats)
        }
      } catch {
        if (!cancelled) {
          setData(null)
          setError(t('personality.error', '个性统计加载失败'))
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

  return (
    <PanelShell icon="🧠" title={t('personality.title', '个性特征面板')} badge="Personality">
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {loading ? (
        <PanelSpinner
          title={t('personality.loading', '个性数据加载中…')}
          message={t('personality.loading_msg', '正在统计居民性格特征。')}
        />
      ) : null}

      {!loading && !error && data === null ? (
        <PanelEmptyState message={t('personality.no_data', '暂无居民数据')} />
      ) : null}

      {!loading && data ? (
        <>
          <p className="text-[11px] text-slate-400">
            {t('personality.subtitle', '以下为全体居民各性格维度的平均值')}
          </p>
          <div className="grid gap-2">
            {TRAIT_ORDER.map((key) => (
              <TraitBar key={key} traitKey={key} value={data[key]} />
            ))}
          </div>
        </>
      ) : null}
    </PanelShell>
  )
}
