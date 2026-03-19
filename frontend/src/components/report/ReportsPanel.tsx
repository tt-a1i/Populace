import { useState } from 'react'

import { DailyReport } from './DailyReport'
import { ExperimentReport } from './ExperimentReport'

type ReportTab = 'daily' | 'experiment'

export function ReportsPanel() {
  const [activeTab, setActiveTab] = useState<ReportTab>('daily')

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('daily')}
          className={`rounded-full border px-4 py-2 text-sm transition ${
            activeTab === 'daily'
              ? 'border-amber-300/40 bg-amber-300/15 text-amber-50'
              : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
          }`}
        >
          小镇日报
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('experiment')}
          className={`rounded-full border px-4 py-2 text-sm transition ${
            activeTab === 'experiment'
              ? 'border-cyan-300/40 bg-cyan-300/15 text-cyan-50'
              : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
          }`}
        >
          实验报告
        </button>
      </div>

      {activeTab === 'daily' ? <DailyReport /> : <ExperimentReport />}
    </div>
  )
}
