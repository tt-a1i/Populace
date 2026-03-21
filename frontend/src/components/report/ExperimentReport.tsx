import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toPng } from 'html-to-image'

import {
  generateExperimentReport,
  type ExperimentReportPayload,
} from '../../services/api'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ReportShare } from './ReportShare'

function makeFallbackReport(t: (key: string) => string): ExperimentReportPayload {
  return {
    title: t('experiment.fallback_title'),
    generated_at: '',
    stats: {
      days: 3,
      start_tick: 0,
      end_tick: 0,
      node_count: 0,
      edge_count: 0,
      density_start: 0,
      density_end: 0,
      density_change: 0,
      triangle_count: 0,
      dominant_mood: 'neutral',
      relation_type_distribution: {},
      social_hotspots: [],
      recorded_ticks: 0,
    },
    sections: [
      { heading: t('experiment.fallback_s1_heading'), content: t('experiment.fallback_s1_content') },
      { heading: t('experiment.fallback_s2_heading'), content: t('experiment.fallback_s2_content') },
      { heading: t('experiment.fallback_s3_heading'), content: t('experiment.fallback_s3_content') },
      { heading: t('experiment.fallback_s4_heading'), content: t('experiment.fallback_s4_content') },
      { heading: t('experiment.fallback_s5_heading'), content: t('experiment.fallback_s5_content') },
    ],
  }
}

const dayOptions = [1, 3, 5, 7]

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function ExperimentReport() {
  const { t } = useTranslation()
  const [report, setReport] = useState<ExperimentReportPayload>(() => makeFallbackReport(t))
  const [days, setDays] = useState(3)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const reportRef = useRef<HTMLElement | null>(null)

  const topHotspot = report.stats.social_hotspots[0]?.name ?? t('experiment.no_hotspot')

  const statCards = useMemo(
    () => [
      { label: t('experiment.stat_window'), value: t('experiment.stat_window_value', { days: report.stats.days }) },
      { label: t('experiment.stat_density'), value: formatPercent(report.stats.density_end) },
      { label: t('experiment.stat_density_change'), value: `${report.stats.density_change >= 0 ? '+' : ''}${formatPercent(report.stats.density_change)}` },
      { label: t('experiment.stat_edges'), value: String(report.stats.edge_count) },
      { label: t('experiment.stat_triangles'), value: String(report.stats.triangle_count) },
      { label: t('experiment.stat_mood'), value: report.stats.dominant_mood },
      { label: t('experiment.stat_hotspot'), value: topHotspot },
    ],
    [report.stats.days, report.stats.density_change, report.stats.density_end, report.stats.dominant_mood, report.stats.edge_count, report.stats.triangle_count, topHotspot, t],
  )

  const handleGenerate = async () => {
    setBusy(true)
    setMessage('')
    try {
      const nextReport = await generateExperimentReport(days)
      setReport(nextReport)
    } catch {
      setMessage(t('experiment.generate_failed'))
    } finally {
      setBusy(false)
    }
  }

  const handleExportPdf = async () => {
    if (!reportRef.current) {
      return
    }

    setBusy(true)
    setMessage('')
    try {
      const dataUrl = await toPng(reportRef.current, {
        cacheBust: true,
        pixelRatio: 2,
      })
      const popup = window.open('', '_blank', 'noopener,noreferrer')
      if (!popup) {
        throw new Error('popup blocked')
      }
      popup.document.open()
      popup.document.write(`
        <html>
          <head>
            <title>${report.title}</title>
            <style>
              body { margin: 0; background: #0f172a; display: flex; justify-content: center; }
              img { width: min(1100px, 100%); display: block; }
              @page { size: A4 portrait; margin: 12mm; }
            </style>
          </head>
          <body>
            <img src="${dataUrl}" alt="${report.title}" />
          </body>
        </html>
      `)
      popup.document.close()
      popup.focus()
      popup.print()
    } catch {
      setMessage(t('experiment.export_failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(14,23,43,0.96),rgba(11,18,32,0.98))] p-4 text-slate-100 shadow-[0_18px_44px_rgba(15,23,42,0.35)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-100/70">{t('experiment.badge')}</p>
          <h3 className="mt-2 font-display text-3xl text-white">{t('experiment.title')}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            {t('experiment.desc')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs uppercase tracking-[0.24em] text-slate-400">
            {t('experiment.days_label')}
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="ml-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none"
            >
              {dayOptions.map((option) => (
                <option key={option} value={option}>
                  {t('experiment.days_option', { n: option })}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={busy}
            className="rounded-full border border-cyan-300/30 bg-cyan-300/15 px-4 py-2 text-sm text-cyan-50 transition duration-200 hover:bg-cyan-300/25 active:scale-95 disabled:opacity-60"
          >
            {t('experiment.generate')}
          </button>
          <button
            type="button"
            onClick={() => void handleExportPdf()}
            disabled={!reportRef.current || busy}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 transition duration-200 hover:bg-white/10 active:scale-95 disabled:opacity-60"
          >
            {t('experiment.export_pdf')}
          </button>
        </div>
      </div>

      <article
        ref={reportRef}
        className="relative overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(180deg,#f8fafc_0%,#edf2f7_100%)] p-6 text-slate-900 shadow-[0_30px_70px_rgba(15,23,42,0.28)]"
      >
        <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_70%)]" />
        <div className="relative border-b border-slate-900/10 pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500">V3 Social Experiment</p>
              <h4 className="mt-3 font-display text-4xl leading-tight text-slate-900">{report.title}</h4>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                {t('experiment.window_stats', { start: report.stats.start_tick, end: report.stats.end_tick, recorded: report.stats.recorded_ticks })}
              </p>
            </div>
            <div className="rounded-xl border border-slate-900/10 bg-white/55 px-4 py-3 text-right">
              <p className="text-[10px] uppercase tracking-[0.26em] text-slate-500">Generated</p>
              <p className="mt-1 text-sm font-medium text-slate-700">{report.generated_at || t('experiment.waiting')}</p>
            </div>
          </div>
        </div>

        <div className="relative mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <div key={card.label} className="rounded-xl border border-slate-900/10 bg-white/55 p-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">{card.label}</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="relative mt-6 grid gap-4">
          {report.sections.map((section) => (
            <section key={section.heading} className="rounded-xl border border-slate-900/10 bg-white/50 p-5">
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">{section.heading}</p>
              <div className="mt-4">
                <MarkdownRenderer markdown={section.content} />
              </div>
            </section>
          ))}
        </div>
      </article>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <ReportShare title={report.title} reportElement={reportRef.current} />
        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
          {message || t('experiment.hint')}
        </p>
      </div>
    </div>
  )
}
