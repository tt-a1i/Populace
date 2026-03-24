import { useEffect, useState } from 'react'

import { getWorldEconomy, type WorldEconomyPayload } from '../../services/api'
import { PanelShell } from '../ui/PanelShell'

export function EconomyPanel() {
  const [data, setData] = useState<WorldEconomyPayload | null>(null)

  useEffect(() => {
    void getWorldEconomy().then(setData).catch(() => setData(null))
  }, [])

  return (
    <PanelShell icon="💼" title="经济面板" badge="Economy">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Employment</p>
          <p className="mt-1 text-lg font-semibold text-white">{Math.round((data?.employment_rate ?? 0) * 100)}%</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Avg Income</p>
          <p className="mt-1 text-lg font-semibold text-white">${Math.round(data?.average_income ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">GDP</p>
          <p className="mt-1 text-lg font-semibold text-white">${Math.round(data?.gdp ?? 0)}</p>
        </div>
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
        <p className="panel-section-label mb-2">就业结构</p>
        <div className="flex flex-wrap gap-2">
          {(data?.employment_distribution ?? []).map((entry) => (
            <span key={entry.occupation} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200">
              {entry.occupation}: {entry.count}
            </span>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
        <p className="panel-section-label mb-2">收入分布</p>
        <div className="space-y-2">
          {(data?.income_distribution ?? []).map((entry) => (
            <div key={entry.bucket} className="flex items-center justify-between text-sm text-slate-200">
              <span>{entry.bucket}</span>
              <span>{entry.count}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
        <p className="panel-section-label mb-2">GDP 曲线</p>
        <div className="flex items-end gap-1">
          {(data?.gdp_history ?? []).slice(-12).map((point) => (
            <div
              key={point.tick}
              title={`tick ${point.tick}: ${point.gdp}`}
              className="w-4 rounded-t bg-emerald-400/70"
              style={{ height: `${Math.max(8, Number(point.gdp) * 2)}px` }}
            />
          ))}
        </div>
      </div>
    </PanelShell>
  )
}
