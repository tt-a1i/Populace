import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  type SimulationStats,
  type EconomyStats,
  type NetworkAnalysisEntry,
  type SocialIndicators,
  type ApiResident,
  getSimulationStats,
  getEconomyStats,
  getNetworkAnalysis,
  getSocialIndicators,
  getResidents,
} from '../../services/api'
import { useSimulationStore } from '../../stores/simulation'
import { PanelShell } from '../ui/PanelShell'

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

interface ReportData {
  stats: SimulationStats
  economy: EconomyStats | null
  network: NetworkAnalysisEntry[]
  social: SocialIndicators | null
  residents: ApiResident[]
}

function generateMarkdown(data: ReportData, season: string, weather: string): string {
  const { stats, economy, network, social, residents } = data
  const now = new Date().toLocaleString()
  const lines: string[] = []

  lines.push(`# Populace Simulation Report`)
  lines.push(``)
  lines.push(`> Generated: ${now}`)
  lines.push(``)

  // ── Overview
  lines.push(`## Simulation Overview`)
  lines.push(``)
  lines.push(`| Metric | Value |`)
  lines.push(`|--------|-------|`)
  lines.push(`| Total Ticks | ${stats.total_ticks} |`)
  lines.push(`| Population | ${residents.length} |`)
  lines.push(`| Season | ${season} |`)
  lines.push(`| Weather | ${weather} |`)
  lines.push(`| Total Dialogues | ${stats.total_dialogues} |`)
  lines.push(`| Total Memories | ${stats.total_memories} |`)
  lines.push(`| Relationship Changes | ${stats.total_relationship_changes} |`)
  lines.push(`| Active Events | ${stats.active_events} |`)
  lines.push(`| Average Mood | ${stats.average_mood_score.toFixed(2)} |`)
  lines.push(``)

  // ── Economy
  if (economy) {
    lines.push(`## Economy`)
    lines.push(``)
    lines.push(`| Metric | Value |`)
    lines.push(`|--------|-------|`)
    lines.push(`| Total Coins | ${economy.total_coins} |`)
    lines.push(`| Average Coins | ${economy.avg_coins.toFixed(1)} |`)
    if (economy.richest) lines.push(`| Richest | ${economy.richest} |`)
    if (economy.poorest) lines.push(`| Poorest | ${economy.poorest} |`)
    lines.push(``)

    if (economy.occupation_distribution.length > 0) {
      lines.push(`### Occupation Distribution`)
      lines.push(``)
      lines.push(`| Occupation | Count |`)
      lines.push(`|-----------|-------|`)
      for (const occ of economy.occupation_distribution) {
        lines.push(`| ${occ.occupation} | ${occ.count} |`)
      }
      lines.push(``)
    }
  }

  // ── Social Indicators
  if (social) {
    lines.push(`## Social Indicators`)
    lines.push(``)
    lines.push(`| Indicator | Value |`)
    lines.push(`|-----------|-------|`)
    lines.push(`| Gini Coefficient | ${social.gini_coefficient.toFixed(4)} |`)
    lines.push(`| Social Cohesion | ${social.social_cohesion.toFixed(3)} |`)
    lines.push(`| Happiness Index | ${(social.happiness_index * 100).toFixed(1)}% |`)
    lines.push(`| Avg Energy | ${social.avg_energy.toFixed(1)} |`)
    lines.push(`| Total Relationships | ${social.total_relationships} |`)
    lines.push(``)
  }

  // ── Network
  if (network.length > 0) {
    lines.push(`## Social Network — Top Influencers`)
    lines.push(``)
    lines.push(`| Rank | Name | Influence | Relationships |`)
    lines.push(`|------|------|-----------|---------------|`)
    for (const [i, entry] of network.slice(0, 10).entries()) {
      lines.push(`| ${i + 1} | ${entry.name} | ${entry.influence_score.toFixed(2)} | ${entry.relationship_count} |`)
    }
    lines.push(``)
  }

  // ── Key residents
  if (stats.most_social_resident) {
    lines.push(`## Notable Residents`)
    lines.push(``)
    lines.push(`- **Most Social**: ${stats.most_social_resident.name} (${stats.most_social_resident.relationship_count} relationships)`)
  }
  if (stats.loneliest_resident) {
    lines.push(`- **Loneliest**: ${stats.loneliest_resident.name} (${stats.loneliest_resident.relationship_count} relationships)`)
  }
  if (stats.strongest_relationship) {
    lines.push(`- **Strongest Bond**: ${stats.strongest_relationship.from_name} ↔ ${stats.strongest_relationship.to_name} (${stats.strongest_relationship.type}, ${stats.strongest_relationship.intensity.toFixed(2)})`)
  }
  lines.push(``)

  // ── Resident Profiles
  lines.push(`## Resident Profiles`)
  lines.push(``)
  for (const r of residents) {
    lines.push(`### ${r.name}`)
    lines.push(``)
    lines.push(`- **Mood**: ${r.mood ?? 'neutral'}`)
    lines.push(`- **Occupation**: ${r.occupation ?? 'unemployed'}`)
    lines.push(`- **Coins**: ${r.coins ?? 0}`)
    if (r.personality) lines.push(`- **Personality**: ${r.personality}`)
    if (r.goals && r.goals.length > 0) lines.push(`- **Goals**: ${r.goals.join(', ')}`)
    lines.push(``)
  }

  lines.push(`---`)
  lines.push(`*Report generated by Populace Simulation Engine*`)

  return lines.join('\n')
}

export function FullReportPanel() {
  const { t } = useTranslation()
  const season = useSimulationStore((s) => s.season)
  const weather = useSimulationStore((s) => s.weather)
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const generate = useCallback(async () => {
    setLoading(true)
    try {
      const [stats, economy, network, social, residents] = await Promise.all([
        getSimulationStats(),
        getEconomyStats().catch(() => null),
        getNetworkAnalysis().catch(() => []),
        getSocialIndicators().catch(() => null),
        getResidents(),
      ])
      const md = generateMarkdown({ stats, economy, network, social, residents }, season, weather)
      setMarkdown(md)
    } catch {
      setMarkdown('# Error\n\nFailed to generate report. Please try again.')
    }
    setLoading(false)
  }, [season, weather])

  const exportMd = () => {
    if (!markdown) return
    downloadFile(markdown, `populace-report-${Date.now()}.md`, 'text/markdown;charset=utf-8')
  }

  const exportHtml = () => {
    if (!markdown) return
    // Simple markdown to HTML for PDF-printable page
    const html = markdownToHtml(markdown)
    const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Populace Report</title>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #1e293b; line-height: 1.6; }
  h1 { border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
  h2 { color: #334155; margin-top: 32px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px; }
  h3 { color: #475569; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
  th { background: #f8fafc; font-weight: 600; }
  blockquote { border-left: 3px solid #cbd5e1; padding-left: 12px; color: #64748b; }
  code { background: #f1f5f9; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
  em { color: #64748b; }
  @media print { body { margin: 20px; } }
</style>
</head><body>${html}</body></html>`
    downloadFile(fullHtml, `populace-report-${Date.now()}.html`, 'text/html;charset=utf-8')
  }

  return (
    <PanelShell
      icon="📋"
      title={t('full_report.title', { defaultValue: 'Full Report' })}
      badge={t('full_report.badge', { defaultValue: 'Export' })}
      headerRight={
        markdown ? (
          <div className="flex gap-1.5">
            <button type="button" onClick={exportMd} className="btn-secondary rounded-lg px-2.5 py-1 text-[10px] font-medium transition active:scale-95">
              📄 MD
            </button>
            <button type="button" onClick={exportHtml} className="btn-secondary rounded-lg px-2.5 py-1 text-[10px] font-medium transition active:scale-95">
              🖨️ HTML
            </button>
          </div>
        ) : undefined
      }
    >
      {!markdown && !loading && (
        <div className="flex flex-col items-center gap-3 py-8">
          <span className="text-4xl opacity-60">📊</span>
          <p className="text-sm text-slate-400">{t('full_report.desc', { defaultValue: 'Generate a comprehensive simulation report with all statistics, social indicators, and resident profiles.' })}</p>
          <button
            type="button"
            onClick={() => void generate()}
            className="btn-primary rounded-xl px-6 py-2.5 text-sm font-semibold transition duration-200 active:scale-95"
          >
            {t('full_report.generate', { defaultValue: 'Generate Report' })}
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-8">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          <span className="text-sm text-slate-400">{t('full_report.generating', { defaultValue: 'Generating report...' })}</span>
        </div>
      )}

      {markdown && !loading && (
        <>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void generate()}
              className="btn-secondary rounded-lg px-3 py-1 text-xs transition active:scale-95"
            >
              ↻ {t('full_report.regenerate', { defaultValue: 'Regenerate' })}
            </button>
          </div>

          {/* Rendered markdown preview */}
          <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="prose-invert prose-sm max-w-none">
              <MarkdownPreview content={markdown} />
            </div>
          </div>
        </>
      )}
    </PanelShell>
  )
}

// ── Simple Markdown renderer ─────────────────────────────────────────────

function markdownToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^\| (.+) \|$/gm, (match) => {
      const cells = match.slice(1, -1).split('|').map(c => c.trim())
      return '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>'
    })
    .replace(/^\|[-| ]+\|$/gm, '')
    .replace(/(<tr>.*<\/tr>\n?)+/g, (block) => `<table>${block}</table>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`)
    .replace(/^---$/gm, '<hr/>')
    .replace(/\n\n/g, '<br/>')
}

function MarkdownPreview({ content }: { content: string }) {
  const sections = content.split('\n\n')

  return (
    <div className="grid gap-2.5 text-sm">
      {sections.map((block, i) => {
        const trimmed = block.trim()
        if (!trimmed) return null

        // Heading
        if (trimmed.startsWith('# ')) {
          const level = trimmed.match(/^#+/)![0].length
          const text = trimmed.replace(/^#+\s*/, '')
          if (level === 1) return <h1 key={i} className="font-display text-xl text-white">{text}</h1>
          if (level === 2) return <h2 key={i} className="mt-2 text-base font-semibold text-white">{text}</h2>
          return <h3 key={i} className="mt-1 text-sm font-semibold text-slate-200">{text}</h3>
        }

        // Blockquote
        if (trimmed.startsWith('> ')) {
          return <blockquote key={i} className="border-l-2 border-slate-500 pl-3 text-xs text-slate-400">{trimmed.slice(2)}</blockquote>
        }

        // Table
        if (trimmed.includes('|') && trimmed.startsWith('|')) {
          const rows = trimmed.split('\n').filter(r => r.trim() && !r.match(/^\|[-| ]+\|$/))
          return (
            <div key={i} className="overflow-x-auto">
              <table className="w-full text-xs">
                <tbody>
                  {rows.map((row, ri) => {
                    const cells = row.slice(1, -1).split('|').map(c => c.trim())
                    const Tag = ri === 0 ? 'th' : 'td'
                    return (
                      <tr key={ri} className={ri === 0 ? 'border-b border-white/10 text-slate-400' : 'border-b border-white/[0.04]'}>
                        {cells.map((c, ci) => <Tag key={ci} className="px-2 py-1.5 text-left">{c}</Tag>)}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        }

        // List items
        if (trimmed.startsWith('- ')) {
          const items = trimmed.split('\n').filter(l => l.startsWith('- '))
          return (
            <ul key={i} className="list-inside list-disc space-y-0.5 text-xs text-slate-300">
              {items.map((item, ii) => {
                const text = item.slice(2)
                return <li key={ii} dangerouslySetInnerHTML={{ __html: text.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>') }} />
              })}
            </ul>
          )
        }

        // Horizontal rule
        if (trimmed === '---') {
          return <hr key={i} className="border-white/10" />
        }

        // Italic line
        if (trimmed.startsWith('*') && trimmed.endsWith('*')) {
          return <p key={i} className="text-xs italic text-slate-500">{trimmed.slice(1, -1)}</p>
        }

        // Regular paragraph
        return <p key={i} className="text-xs leading-5 text-slate-300">{trimmed}</p>
      })}
    </div>
  )
}
