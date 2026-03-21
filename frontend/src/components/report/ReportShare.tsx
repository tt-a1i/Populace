import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toBlob, toPng } from 'html-to-image'

interface ReportShareProps {
  reportElement: HTMLElement | null
  title: string
}

export function ReportShare({ reportElement, title }: ReportShareProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleCopy = async () => {
    if (!reportElement) {
      return
    }

    setBusy(true)
    try {
      const blob = await toBlob(reportElement, {
        cacheBust: true,
        pixelRatio: 2,
      })

      if (!blob) {
        throw new Error('failed to render report image')
      }

      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } finally {
      setBusy(false)
    }
  }

  const handleDownload = async () => {
    if (!reportElement) {
      return
    }

    setBusy(true)
    try {
      const dataUrl = await toPng(reportElement, {
        cacheBust: true,
        pixelRatio: 2,
      })
      const url = dataUrl
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${title.replace(/\s+/g, '-').toLowerCase() || 'populace-report'}.png`
      anchor.click()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={!reportElement || busy}
        onClick={() => void handleCopy()}
        className="rounded-full border border-rose-300/30 bg-rose-300/15 px-4 py-2 text-sm text-rose-50 transition duration-200 hover:bg-rose-300/25 active:scale-95 disabled:opacity-50"
      >
        {copied ? t('report.copied') : t('report.copy_image')}
      </button>
      <button
        type="button"
        disabled={!reportElement || busy}
        onClick={() => void handleDownload()}
        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 transition duration-200 hover:bg-white/10 active:scale-95 disabled:opacity-50"
      >
        {t('report.download_png')}
      </button>
    </div>
  )
}
