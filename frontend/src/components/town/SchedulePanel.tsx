import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

// ── Schedule phase definitions (mirrors engine/schedule.py) ──────────────

const EXTROVERT_KW = ['外向', '开朗', '活泼', '健谈', '社牛', 'extrovert', 'outgoing']
const INTROVERT_KW = ['内向', '安静', '害羞', '社恐', 'introvert', 'shy']

function personalityType(personality: string): 'extrovert' | 'introvert' | 'neutral' {
  const p = personality.toLowerCase()
  if (EXTROVERT_KW.some((k) => p.includes(k))) return 'extrovert'
  if (INTROVERT_KW.some((k) => p.includes(k))) return 'introvert'
  return 'neutral'
}

interface ScheduleBlock {
  phase: string
  startHour: number
  endHour: number
}

function buildSchedule(personality: string): ScheduleBlock[] {
  const ptype = personalityType(personality)
  const homeStart = ptype === 'extrovert' ? 21 : ptype === 'introvert' ? 18 : 20

  return [
    { phase: 'sleep', startHour: 0, endHour: 6 },
    { phase: 'morning', startHour: 6, endHour: 8 },
    { phase: 'work', startHour: 8, endHour: 12 },
    { phase: 'lunch', startHour: 12, endHour: 13 },
    { phase: 'afternoon', startHour: 13, endHour: 17 },
    { phase: 'evening', startHour: 17, endHour: homeStart },
    { phase: 'home', startHour: homeStart, endHour: 22 },
    { phase: 'sleep', startHour: 22, endHour: 24 },
  ].filter((b) => b.startHour < b.endHour)
}

const PHASE_COLOR: Record<string, string> = {
  sleep: 'bg-indigo-900/80',
  morning: 'bg-yellow-500/70',
  work: 'bg-orange-500/70',
  lunch: 'bg-emerald-500/70',
  afternoon: 'bg-orange-400/60',
  evening: 'bg-violet-500/70',
  home: 'bg-slate-500/60',
}

const PHASE_COLOR_HEX: Record<string, string> = {
  sleep: '#312e81',
  morning: '#eab308',
  work: '#f97316',
  lunch: '#10b981',
  afternoon: '#fb923c',
  evening: '#8b5cf6',
  home: '#64748b',
}

// ── Parse current hour from time string ──────────────────────────────────

function parseCurrentHour(time: string): number {
  const match = time.match(/(\d{1,2}):(\d{2})/)
  if (!match) return 12
  return Number(match[1]) + Number(match[2]) / 60
}

// ── Components ───────────────────────────────────────────────────────────

interface ScheduleBarProps {
  personality: string
  currentHour: number
  label?: string
  color?: string
}

function ScheduleBar({ personality, currentHour, label, color }: ScheduleBarProps) {
  const { t } = useTranslation()
  const blocks = useMemo(() => buildSchedule(personality), [personality])
  const ptype = personalityType(personality)

  return (
    <div className="group">
      {label && (
        <div className="mb-1 flex items-center gap-2">
          {color && <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
          <span className="text-[10px] font-medium text-slate-300">{label}</span>
          {ptype !== 'neutral' && (
            <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[8px] text-slate-500">
              {t(`schedule.ptype_${ptype}`)}
            </span>
          )}
        </div>
      )}
      <div className="relative h-5 w-full overflow-hidden rounded-md border border-white/8">
        {blocks.map((block, i) => {
          const left = (block.startHour / 24) * 100
          const width = ((block.endHour - block.startHour) / 24) * 100
          return (
            <div
              key={i}
              className={`absolute top-0 h-full ${PHASE_COLOR[block.phase] ?? 'bg-slate-600/50'}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${t(`schedule.phase_${block.phase}`)} ${block.startHour}:00–${block.endHour}:00`}
            />
          )
        })}
        {/* Current time marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-white shadow-[0_0_4px_rgba(255,255,255,0.6)]"
          style={{ left: `${(currentHour / 24) * 100}%` }}
        />
      </div>
    </div>
  )
}

// ── Hour labels ──────────────────────────────────────────────────────────

function HourLabels() {
  const hours = [0, 3, 6, 9, 12, 15, 18, 21, 24]
  return (
    <div className="relative mt-0.5 h-3 w-full">
      {hours.map((h) => (
        <span
          key={h}
          className="absolute -translate-x-1/2 text-[8px] tabular-nums text-slate-600"
          style={{ left: `${(h / 24) * 100}%` }}
        >
          {h}
        </span>
      ))}
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────

function Legend() {
  const { t } = useTranslation()
  const phases = ['sleep', 'morning', 'work', 'lunch', 'afternoon', 'evening', 'home']

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {phases.map((p) => (
        <div key={p} className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: PHASE_COLOR_HEX[p] }} />
          <span className="text-[9px] text-slate-500">{t(`schedule.phase_${p}`)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────

const COMPARE_COLORS = ['#38bdf8', '#f97316', '#a78bfa']

interface SchedulePanelProps {
  /** Primary resident */
  residentId: string
  personality: string
  name: string
  /** Current simulation time string (e.g. "Day 3, 14:30") */
  currentTime: string
  /** Optional comparison residents */
  compareResidents?: Array<{ id: string; name: string; personality: string }>
}

export function SchedulePanel({
  personality,
  name,
  currentTime,
  compareResidents,
}: SchedulePanelProps) {
  const { t } = useTranslation()
  const currentHour = useMemo(() => parseCurrentHour(currentTime), [currentTime])

  const allResidents = useMemo(() => {
    const list = [{ name, personality, color: COMPARE_COLORS[0] }]
    if (compareResidents) {
      for (let i = 0; i < Math.min(compareResidents.length, 2); i++) {
        list.push({
          name: compareResidents[i].name,
          personality: compareResidents[i].personality,
          color: COMPARE_COLORS[i + 1],
        })
      }
    }
    return list
  }, [name, personality, compareResidents])

  return (
    <div className="grid gap-3">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          {t('schedule.title')}
        </p>
        <p className="mt-0.5 text-[10px] text-slate-600">
          {t('schedule.current_time')}: {currentTime}
        </p>
      </div>

      <div className="grid gap-2">
        {allResidents.map((r, i) => (
          <ScheduleBar
            key={i}
            personality={r.personality}
            currentHour={currentHour}
            label={allResidents.length > 1 ? r.name : undefined}
            color={allResidents.length > 1 ? r.color : undefined}
          />
        ))}
        <HourLabels />
      </div>

      <Legend />
    </div>
  )
}
