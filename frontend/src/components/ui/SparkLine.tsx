/**
 * SparkLine — lightweight SVG trend line for stat panels.
 * Renders a smooth area chart with gradient fill.
 */
interface SparkLineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  label?: string
}

export function SparkLine({ data, width = 200, height = 48, color = '#22d3ee', label }: SparkLineProps) {
  if (data.length < 2) return null

  const maxVal = Math.max(...data, 1)
  const minVal = Math.min(...data, 0)
  const range = maxVal - minVal || 1
  const pad = 2

  const points = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (width - pad * 2),
    y: pad + (1 - (v - minVal) / range) * (height - pad * 2),
  }))

  const linePath = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ')
  const areaPath = `${linePath} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`
  const id = `spark-${color.replace('#', '')}-${data.length}`

  return (
    <div>
      {label && <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${id})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2.5} fill={color} />
      </svg>
    </div>
  )
}
