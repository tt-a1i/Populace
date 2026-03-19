import type { ReactNode } from 'react'

interface MarkdownRendererProps {
  markdown: string
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*)/g).filter(Boolean)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={`${part}-${index}`} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return part
  })
}

export function MarkdownRenderer({ markdown }: MarkdownRendererProps) {
  const lines = markdown.split('\n')
  const elements: ReactNode[] = []
  let bulletItems: string[] = []

  const flushBullets = () => {
    if (bulletItems.length === 0) {
      return
    }

    elements.push(
      <ul key={`list-${elements.length}`} className="ml-5 list-disc space-y-2 text-sm leading-7 text-slate-700">
        {bulletItems.map((item, index) => (
          <li key={`${item}-${index}`}>{renderInline(item)}</li>
        ))}
      </ul>,
    )
    bulletItems = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushBullets()
      continue
    }

    if (trimmed.startsWith('- ')) {
      bulletItems.push(trimmed.slice(2))
      continue
    }

    flushBullets()

    if (trimmed.startsWith('### ')) {
      elements.push(
        <h5 key={`${trimmed}-${elements.length}`} className="mt-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          {trimmed.slice(4)}
        </h5>,
      )
      continue
    }

    if (trimmed.startsWith('## ')) {
      elements.push(
        <h4 key={`${trimmed}-${elements.length}`} className="mt-4 text-lg font-semibold text-slate-900">
          {trimmed.slice(3)}
        </h4>,
      )
      continue
    }

    elements.push(
      <p key={`${trimmed}-${elements.length}`} className="text-sm leading-7 text-slate-700">
        {renderInline(trimmed)}
      </p>,
    )
  }

  flushBullets()
  return <div className="grid gap-3">{elements}</div>
}
