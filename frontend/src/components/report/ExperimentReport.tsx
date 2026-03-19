import { useMemo, useRef, useState } from 'react'

import { toPng } from 'html-to-image'

import {
  generateExperimentReport,
  type ExperimentReportPayload,
} from '../../services/api'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ReportShare } from './ReportShare'

const fallbackReport: ExperimentReportPayload = {
  title: '社会实验报告',
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
    { heading: '实验摘要', content: '点击“生成实验报告”后，这里会出现跨多天的社会实验摘要。' },
    { heading: '社交网络分析', content: '系统会总结网络密度变化、三角关系和关系类型分布。' },
    { heading: '关键发现', content: '高影响事件、关系升温/破裂与热点地点都会被整合进报告。' },
    { heading: 'AI 行为观察', content: '报告会描述代理的聚集模式、情绪偏移和互动习惯。' },
    { heading: '伦理思考', content: '实验面板会提示观察结论的局限，以及潜在的伦理问题。' },
  ],
}

const dayOptions = [1, 3, 5, 7]

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function ExperimentReport() {
  const [report, setReport] = useState<ExperimentReportPayload>(fallbackReport)
  const [days, setDays] = useState(3)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const reportRef = useRef<HTMLElement | null>(null)

  const topHotspot = report.stats.social_hotspots[0]?.name ?? '暂无'

  const statCards = useMemo(
    () => [
      { label: '观察窗口', value: `${report.stats.days} 天` },
      { label: '网络密度', value: formatPercent(report.stats.density_end) },
      { label: '密度变化', value: `${report.stats.density_change >= 0 ? '+' : ''}${formatPercent(report.stats.density_change)}` },
      { label: '关系边数', value: String(report.stats.edge_count) },
      { label: '三角关系', value: String(report.stats.triangle_count) },
      { label: '主导情绪', value: report.stats.dominant_mood },
      { label: '社交热点', value: topHotspot },
    ],
    [report.stats.days, report.stats.density_change, report.stats.density_end, report.stats.dominant_mood, report.stats.edge_count, report.stats.triangle_count, topHotspot],
  )

  const handleGenerate = async () => {
    setBusy(true)
    setMessage('')
    try {
      const nextReport = await generateExperimentReport(days)
      setReport(nextReport)
    } catch {
      setMessage('生成实验报告失败，已保留当前内容。')
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
      setMessage('导出 PDF 失败，请检查浏览器弹窗权限后重试。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,23,43,0.96),rgba(11,18,32,0.98))] p-4 text-slate-100 shadow-[0_18px_44px_rgba(15,23,42,0.35)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-100/70">Experiment Lab</p>
          <h3 className="mt-2 font-display text-3xl text-white">实验报告</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            以更学术的视角回顾最近多天模拟，聚合网络密度变化、关键事件冲击、情绪分布与热点空间。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs uppercase tracking-[0.24em] text-slate-400">
            观察天数
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="ml-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none"
            >
              {dayOptions.map((option) => (
                <option key={option} value={option}>
                  最近 {option} 天
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={busy}
            className="rounded-full border border-cyan-300/30 bg-cyan-300/15 px-4 py-2 text-sm text-cyan-50 transition hover:bg-cyan-300/25 disabled:opacity-60"
          >
            生成实验报告
          </button>
          <button
            type="button"
            onClick={() => void handleExportPdf()}
            disabled={!reportRef.current || busy}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10 disabled:opacity-60"
          >
            导出 PDF
          </button>
        </div>
      </div>

      <article
        ref={reportRef}
        className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,#f8fafc_0%,#edf2f7_100%)] p-6 text-slate-900 shadow-[0_30px_70px_rgba(15,23,42,0.28)]"
      >
        <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_70%)]" />
        <div className="relative border-b border-slate-900/10 pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500">V3 Social Experiment</p>
              <h4 className="mt-3 font-display text-4xl leading-tight text-slate-900">{report.title}</h4>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                统计窗口：Tick {report.stats.start_tick} - {report.stats.end_tick}，累计 {report.stats.recorded_ticks} 个观测切片。
              </p>
            </div>
            <div className="rounded-[18px] border border-slate-900/10 bg-white/55 px-4 py-3 text-right">
              <p className="text-[10px] uppercase tracking-[0.26em] text-slate-500">Generated</p>
              <p className="mt-1 text-sm font-medium text-slate-700">{report.generated_at || '等待生成'}</p>
            </div>
          </div>
        </div>

        <div className="relative mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <div key={card.label} className="rounded-[18px] border border-slate-900/10 bg-white/55 p-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">{card.label}</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="relative mt-6 grid gap-4">
          {report.sections.map((section) => (
            <section key={section.heading} className="rounded-[22px] border border-slate-900/10 bg-white/50 p-5">
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
          {message || '可复制图片、下载 PNG，或通过 PDF 按钮调用浏览器打印为 PDF。'}
        </p>
      </div>
    </div>
  )
}
