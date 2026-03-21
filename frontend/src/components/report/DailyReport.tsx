import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSound } from '../../audio'
import { generateReport, getLatestReport, type ReportPayload } from '../../services/api'
import { useToast } from '../ui/ToastProvider'
import { ReportShare } from './ReportShare'

function makeFallbackReport(t: (key: string) => string): ReportPayload {
  return {
    title: t('report.fallback_title'),
    generated_at: '',
    tick: 0,
    sections: [
      { heading: t('report.fallback_s1_heading'), content: t('report.fallback_s1_content') },
      { heading: t('report.fallback_s2_heading'), content: t('report.fallback_s2_content') },
      { heading: t('report.fallback_s3_heading'), content: t('report.fallback_s3_content') },
      { heading: t('report.fallback_s4_heading'), content: t('report.fallback_s4_content') },
    ],
  }
}

export function DailyReport() {
  const { t } = useTranslation()
  const { play } = useSound()
  const { pushToast } = useToast()
  const [report, setReport] = useState<ReportPayload>(() => makeFallbackReport(t))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const reportRef = useRef<HTMLElement | null>(null)

  const handleGenerate = async () => {
    setBusy(true)
    setMessage('')
    try {
      const nextReport = await generateReport()
      setReport(nextReport)
      play('report')
      pushToast({
        type: 'success',
        title: t('report.generated_toast'),
        description: nextReport.title,
      })
    } catch {
      setMessage(t('report.generate_failed_desc'))
      pushToast({
        type: 'error',
        title: t('report.generate_failed_toast'),
        description: t('report.generate_failed_desc'),
      })
    } finally {
      setBusy(false)
    }
  }

  const handleLoadLatest = async () => {
    setBusy(true)
    setMessage('')
    try {
      const latest = await getLatestReport()
      setReport(latest)
      pushToast({
        type: 'info',
        title: t('report.loaded_toast'),
        description: latest.title,
      })
    } catch {
      setMessage(t('report.no_latest_hint'))
      pushToast({
        type: 'warning',
        title: t('report.no_latest_toast'),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(68,32,17,0.92),rgba(21,16,13,0.96))] p-4 text-amber-50 shadow-[0_18px_44px_rgba(15,23,42,0.35)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-amber-200/70">{t('report.badge')}</p>
          <h3 className="mt-2 font-display text-3xl text-amber-50">{t('report.title')}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-100/75">
            {t('report.desc')}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={busy}
            className="rounded-full border border-amber-200/30 bg-amber-100/10 px-4 py-2 text-sm text-amber-50 transition duration-200 hover:bg-amber-100/20 active:scale-95 disabled:opacity-60"
          >
            {t('report.generate')}
          </button>
          <button
            type="button"
            onClick={() => void handleLoadLatest()}
            disabled={busy}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-amber-50 transition duration-200 hover:bg-white/10 active:scale-95 disabled:opacity-60"
          >
            {t('report.latest')}
          </button>
        </div>
      </div>

      <article
        ref={reportRef}
        className="relative overflow-hidden rounded-[26px] border border-amber-100/20 bg-[linear-gradient(180deg,#f6e7c8_0%,#ecd4a4_47%,#e4c58e_100%)] p-5 text-slate-900 shadow-[0_30px_70px_rgba(15,23,42,0.3),inset_0_1px_0_rgba(255,255,255,0.42)]"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.06)_0,rgba(255,255,255,0.06)_2px,transparent_2px,transparent_18px)] opacity-70" />
        <div className="relative border-b border-slate-900/12 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500">Populace Daily</p>
              <h4 className="mt-3 font-display text-4xl leading-tight text-slate-900">{report.title}</h4>
            </div>
            <div className="rounded-[18px] border border-slate-900/10 bg-white/35 px-4 py-2 text-right">
              <p className="text-[10px] uppercase tracking-[0.26em] text-slate-500">Edition</p>
              <p className="mt-1 text-sm font-medium text-slate-700">Tick {report.tick || '--'}</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-600">{report.generated_at || t('report.waiting')}</p>
        </div>

        <div className="relative mt-5 grid gap-4 lg:grid-cols-2">
          {report.sections.map((section, index) => (
            <section
              key={section.heading}
              className={`rounded-[18px] border border-slate-900/10 p-4 ${
                index === 0
                  ? 'bg-[linear-gradient(180deg,rgba(255,255,255,0.42),rgba(255,255,255,0.2))] lg:col-span-2'
                  : 'bg-white/28'
              }`}
            >
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">{section.heading}</p>
              <p className="mt-3 text-sm leading-7 text-slate-700">{section.content}</p>
            </section>
          ))}
        </div>

        <div className="relative mt-5 flex items-center justify-between border-t border-slate-900/10 pt-4 text-xs uppercase tracking-[0.24em] text-slate-500">
          <span>Pixel gossip edition</span>
          <span>Share-ready card</span>
        </div>
      </article>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <ReportShare title={report.title} reportElement={reportRef.current} />
        <p className="text-xs uppercase tracking-[0.24em] text-amber-100/65">
          {message || t('report.hint')}
        </p>
      </div>
    </div>
  )
}
