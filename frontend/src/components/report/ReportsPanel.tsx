import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DailyReport } from './DailyReport'
import { ExperimentReport } from './ExperimentReport'

type ReportTab = 'daily' | 'experiment'

export function ReportsPanel() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<ReportTab>('daily')

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={activeTab === 'daily'}
          onClick={() => setActiveTab('daily')}
          className={`rounded-full border px-4 py-2 text-sm transition duration-200 active:scale-95 ${
            activeTab === 'daily'
              ? 'border-amber-300/40 bg-amber-300/15 text-amber-50'
              : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
          }`}
        >
          {t('report.title')}
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'experiment'}
          onClick={() => setActiveTab('experiment')}
          className={`rounded-full border px-4 py-2 text-sm transition duration-200 active:scale-95 ${
            activeTab === 'experiment'
              ? 'border-cyan-300/40 bg-cyan-300/15 text-cyan-50'
              : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
          }`}
        >
          {t('report.experiment_tab')}
        </button>
      </div>

      {activeTab === 'daily' ? <DailyReport /> : <ExperimentReport />}
    </div>
  )
}
