/**
 * HeatmapPanel — N×N relationship intensity matrix (max 15 residents).
 *
 * Each cell (i, j) shows the directed relationship from resident[i] → resident[j].
 * Color encodes relationship type + intensity.
 * Hovering a cell shows relationship details in a tooltip below the matrix.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useRelationshipsStore } from '../../stores/relationships'
import { PanelShell } from '../ui/PanelShell'

const MAX_N = 15
const LABEL_CHARS = 3

// ── Color helpers ─────────────────────────────────────────────────────────

function cellColor(type: string, intensity: number): string {
  const v = Math.max(0, Math.min(1, intensity))
  switch (type) {
    case 'love':
      return `hsl(340, 80%, ${12 + v * 44}%)`
    case 'friendship':
    case 'trust':
      return `hsl(200, 72%, ${10 + v * 42}%)`
    case 'rivalry':
    case 'dislike':
    case 'fear':
      return `hsl(0, 68%, ${10 + v * 38}%)`
    default:
      return `hsl(210, 20%, ${8 + v * 26}%)`
  }
}

const LEGEND_KEYS = [
  { key: 'love', color: 'hsl(340, 75%, 42%)' },
  { key: 'friendship', color: 'hsl(200, 65%, 38%)' },
  { key: 'rivalry', color: 'hsl(0, 60%, 36%)' },
  { key: 'knows', color: 'hsl(210, 18%, 28%)' },
  { key: 'none', color: '#0f172a' },
]

// ── Component ─────────────────────────────────────────────────────────────

interface HoveredCell {
  fromId: string
  toId: string
}

export function HeatmapPanel() {
  const { t } = useTranslation()
  const rawResidents = useRelationshipsStore((s) => s.residents)
  const relationships = useRelationshipsStore((s) => s.relationships)
  const [hovered, setHovered] = useState<HoveredCell | null>(null)

  const residents = useMemo(() => rawResidents.slice(0, MAX_N), [rawResidents])
  const n = residents.length

  const relMap = useMemo(() => {
    const map = new Map<string, { type: string; intensity: number; reason: string }>()
    for (const rel of relationships) {
      map.set(`${rel.from_id}::${rel.to_id}`, {
        type: rel.type,
        intensity: rel.intensity,
        reason: rel.reason,
      })
    }
    return map
  }, [relationships])

  const hoveredRel = hovered ? relMap.get(`${hovered.fromId}::${hovered.toId}`) : undefined
  const hoveredFrom = hovered ? residents.find((r) => r.id === hovered.fromId) : undefined
  const hoveredTo = hovered ? residents.find((r) => r.id === hovered.toId) : undefined

  // Dynamic sizing with gap between cells
  const GAP = 3
  const CELL = n > 10 ? 28 : n > 6 ? 34 : 42
  const LABEL_W = 60
  const LABEL_H = 68
  const svgW = LABEL_W + n * (CELL + GAP) + 4
  const svgH = LABEL_H + n * (CELL + GAP) + 4

  if (n === 0) {
    return (
      <PanelShell icon="🟥" title={t('heatmap_panel.title')} badge={t('heatmap_panel.badge')}>
        <p className="text-sm text-slate-500">{t('heatmap_panel.loading')}</p>
      </PanelShell>
    )
  }

  return (
    <PanelShell
      icon="🟥"
      title={t('heatmap_panel.title')}
      badge={t('heatmap_panel.badge')}
      headerRight={
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">
          {n} × {n}
          {rawResidents.length > MAX_N && ` (${t('heatmap_panel.first_n', { n: MAX_N })})`}
        </span>
      }
    >
      <p className="text-sm text-slate-500">{t('heatmap_panel.desc')}</p>

      {/* ── Matrix SVG ── */}
      <div className="overflow-x-auto">
        <svg
          width={svgW}
          height={svgH}
          className="select-none"
          onMouseLeave={() => setHovered(null)}
        >
          {/* Column headers (rotated -45°) */}
          {residents.map((col, j) => {
            const cx = LABEL_W + j * (CELL + GAP) + CELL / 2
            const cy = LABEL_H - 10
            return (
              <text
                key={col.id}
                x={cx}
                y={cy}
                fontSize={10}
                fill="#94a3b8"
                textAnchor="start"
                transform={`rotate(-45, ${cx}, ${cy})`}
              >
                {col.name.slice(0, LABEL_CHARS + 1)}
              </text>
            )
          })}

          {/* Row headers */}
          {residents.map((row, i) => (
            <text
              key={row.id}
              x={LABEL_W - 6}
              y={LABEL_H + i * (CELL + GAP) + CELL / 2 + 4}
              fontSize={10}
              fill="#94a3b8"
              textAnchor="end"
            >
              {row.name.slice(0, LABEL_CHARS + 1)}
            </text>
          ))}

          {/* Cells with gap + hover highlight */}
          {residents.map((from, i) =>
            residents.map((to, j) => {
              const x = LABEL_W + j * (CELL + GAP)
              const y = LABEL_H + i * (CELL + GAP)
              const isSelf = from.id === to.id
              const rel = isSelf ? undefined : relMap.get(`${from.id}::${to.id}`)
              const fill = isSelf ? '#1e293b' : rel ? cellColor(rel.type, rel.intensity) : '#0f172a'
              const isHov = hovered?.fromId === from.id && hovered?.toId === to.id

              return (
                <g key={`${i}-${j}`}>
                  <rect
                    x={x}
                    y={y}
                    width={CELL}
                    height={CELL}
                    fill={fill}
                    rx={5}
                    stroke={isHov ? '#22d3ee' : 'transparent'}
                    strokeWidth={isHov ? 2 : 0}
                    style={{
                      cursor: isSelf ? 'default' : 'pointer',
                      transition: 'transform 0.15s ease, filter 0.15s ease',
                      transform: isHov ? `translate(${x + CELL / 2}px, ${y + CELL / 2}px) scale(1.15) translate(${-(x + CELL / 2)}px, ${-(y + CELL / 2)}px)` : undefined,
                      filter: isHov ? 'brightness(1.3)' : undefined,
                      transformOrigin: `${x + CELL / 2}px ${y + CELL / 2}px`,
                    }}
                    onMouseEnter={() => !isSelf && setHovered({ fromId: from.id, toId: to.id })}
                  />
                  {/* Intensity text inside cell for larger cells */}
                  {!isSelf && rel && CELL >= 34 && (
                    <text
                      x={x + CELL / 2}
                      y={y + CELL / 2 + 3}
                      textAnchor="middle"
                      fontSize="8"
                      fill="rgba(255,255,255,0.5)"
                      style={{ pointerEvents: 'none' }}
                    >
                      {(rel.intensity * 100).toFixed(0)}
                    </text>
                  )}
                </g>
              )
            }),
          )}
        </svg>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {LEGEND_KEYS.map((item) => (
          <span key={item.key} className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span
              className="inline-block h-3 w-3 rounded"
              style={{ background: item.color }}
            />
            {t(`heatmap_panel.${item.key}`)}
          </span>
        ))}
      </div>

      {/* ── Hover tooltip ── */}
      <div
        className={`overflow-hidden rounded-xl border transition-all duration-200 ${
          hovered
            ? 'border-fuchsia-400/20 bg-slate-900/70 opacity-100'
            : 'border-transparent opacity-0'
        }`}
        style={{ minHeight: '4rem' }}
      >
        {hovered && (
          <div className="p-4">
            <div className="flex items-center gap-2">
              <span className="font-medium text-white">{hoveredFrom?.name}</span>
              <span className="text-slate-500">→</span>
              <span className="font-medium text-white">{hoveredTo?.name}</span>
              {hoveredRel && (
                <span className="ml-auto rounded-full border border-fuchsia-300/25 bg-fuchsia-300/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-fuchsia-200">
                  {hoveredRel.type}
                </span>
              )}
            </div>
            {hoveredRel ? (
              <>
                <div className="mt-2 flex items-center gap-3 text-sm">
                  <span className="text-slate-400">{t('heatmap_panel.intensity')}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${hoveredRel.intensity * 100}%`,
                        background: `linear-gradient(90deg, ${cellColor(hoveredRel.type, hoveredRel.intensity)}, ${cellColor(hoveredRel.type, Math.min(1, hoveredRel.intensity + 0.3))})`,
                      }}
                    />
                  </div>
                  <span className="text-slate-300 font-medium">{(hoveredRel.intensity * 100).toFixed(0)}%</span>
                </div>
                {hoveredRel.reason && (
                  <p className="mt-2 text-sm leading-6 text-slate-400">{hoveredRel.reason}</p>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-slate-500">{t('heatmap_panel.no_relationship')}</p>
            )}
          </div>
        )}
      </div>
    </PanelShell>
  )
}
