import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  type ApiResident,
  type WhatIfEventParam,
  type WhatIfResidentMod,
  type WhatIfResponse,
  type WhatIfStateSnapshot,
  getResidents,
  runWhatIf,
} from '../../services/api'
import { PanelShell } from '../ui/PanelShell'

function KpiCard({
  label,
  current,
  predicted,
}: {
  label: string
  current: string | number
  predicted: string | number
}) {
  const cur = typeof current === 'number' ? current : parseFloat(current)
  const pred = typeof predicted === 'number' ? predicted : parseFloat(predicted)
  const diff = pred - cur
  const arrow = diff > 0 ? '\u2191' : diff < 0 ? '\u2193' : '\u2192'
  const color =
    diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-rose-400' : 'text-slate-400'

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <div className="text-xs text-slate-300">
          <span className="text-slate-500 mr-1">{current}</span>
          <span className={`font-semibold ${color}`}>
            {arrow} {predicted}
          </span>
        </div>
      </div>
    </div>
  )
}

function ResidentDiffTable({
  current,
  predicted,
  t,
}: {
  current: WhatIfStateSnapshot
  predicted: WhatIfStateSnapshot
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any
}) {
  const predMap = new Map(predicted.residents.map((r) => [r.id, r]))

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-slate-400 border-b border-white/10">
            <th className="text-left py-1.5 pr-2 font-medium">{t('whatif.name', 'Name')}</th>
            <th className="text-left py-1.5 px-2 font-medium">{t('whatif.mood', 'Mood')}</th>
            <th className="text-right py-1.5 px-2 font-medium">{t('whatif.coins', 'Coins')}</th>
            <th className="text-right py-1.5 pl-2 font-medium">{t('whatif.energy', 'Energy')}</th>
          </tr>
        </thead>
        <tbody>
          {current.residents.map((cur) => {
            const pred = predMap.get(cur.id)
            if (!pred) return null
            const moodChanged = cur.mood !== pred.mood
            const coinsChanged = cur.coins !== pred.coins
            const energyChanged = Math.abs(cur.energy - pred.energy) > 0.01
            return (
              <tr key={cur.id} className="border-b border-white/5">
                <td className="py-1.5 pr-2 text-slate-200">{cur.name}</td>
                <td className="py-1.5 px-2">
                  {moodChanged ? (
                    <span>
                      <span className="text-slate-500">{cur.mood}</span>
                      <span className="text-slate-500 mx-1">&rarr;</span>
                      <span className="text-amber-400">{pred.mood}</span>
                    </span>
                  ) : (
                    <span className="text-slate-400">{cur.mood}</span>
                  )}
                </td>
                <td className="py-1.5 px-2 text-right">
                  {coinsChanged ? (
                    <span className={pred.coins > cur.coins ? 'text-emerald-400' : 'text-rose-400'}>
                      {pred.coins - cur.coins > 0 ? '+' : ''}{pred.coins - cur.coins}
                    </span>
                  ) : (
                    <span className="text-slate-400">{cur.coins}</span>
                  )}
                </td>
                <td className="py-1.5 pl-2 text-right">
                  {energyChanged ? (
                    <span className={pred.energy > cur.energy ? 'text-emerald-400' : 'text-rose-400'}>
                      {(pred.energy - cur.energy).toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-slate-400">{cur.energy.toFixed(1)}</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function WhatIfPanel() {
  const { t } = useTranslation()
  const [ticks, setTicks] = useState(50)
  const [eventText, setEventText] = useState('')
  const [events, setEvents] = useState<WhatIfEventParam[]>([])
  const [residents, setResidents] = useState<ApiResident[]>([])
  const [residentMods, setResidentMods] = useState<WhatIfResidentMod[]>([])
  const [selectedResidentId, setSelectedResidentId] = useState('')
  const [modMood, setModMood] = useState('')
  const [modCoins, setModCoins] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<WhatIfResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void getResidents().then((r) => {
      if (active) setResidents(r)
    })
    return () => { active = false }
  }, [])

  const addEvent = useCallback(() => {
    const desc = eventText.trim()
    if (!desc) return
    setEvents((prev) => [...prev, { description: desc }])
    setEventText('')
  }, [eventText])

  const addResidentMod = useCallback(() => {
    if (!selectedResidentId) return
    const mod: WhatIfResidentMod = { resident_id: selectedResidentId }
    if (modMood.trim()) mod.mood = modMood.trim()
    if (modCoins.trim()) mod.coins = parseInt(modCoins, 10)
    if (!mod.mood && mod.coins === undefined) return
    setResidentMods((prev) => [...prev.filter((m) => m.resident_id !== mod.resident_id), mod])
    setModMood('')
    setModCoins('')
    setSelectedResidentId('')
  }, [selectedResidentId, modMood, modCoins])

  const run = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const res = await runWhatIf({
        ticks,
        events: events.length > 0 ? events : undefined,
        resident_mods: residentMods.length > 0 ? residentMods : undefined,
      })
      setResult(res)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [ticks, events, residentMods])

  const MOODS = ['happy', 'sad', 'angry', 'fearful', 'excited', 'calm', 'neutral', 'tired']

  return (
    <PanelShell
      icon="\uD83D\uDD2E"
      title={t('whatif.title', 'What-If Analysis')}
      badge={t('whatif.badge', 'Hypothetical')}
    >
      {/* --- Input Section --- */}
      <div className="grid gap-3">
        {/* Tick count */}
        <div>
          <label className="block text-[11px] text-slate-400 mb-1">
            {t('whatif.ticks_label', 'Simulation ticks')}
          </label>
          <input
            type="number"
            min={1}
            max={500}
            value={ticks}
            onChange={(e) => setTicks(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-white/20"
          />
        </div>

        {/* Inject events */}
        <div>
          <label className="block text-[11px] text-slate-400 mb-1">
            {t('whatif.inject_event', 'Inject event')}
          </label>
          <div className="flex gap-1.5">
            <input
              value={eventText}
              onChange={(e) => setEventText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addEvent()}
              placeholder={t('whatif.event_placeholder', 'e.g. A sudden rainstorm hits the town')}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-white/20"
            />
            <button
              type="button"
              onClick={addEvent}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
            >
              +
            </button>
          </div>
          {events.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {events.map((ev, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-slate-300"
                >
                  {ev.description.slice(0, 30)}{ev.description.length > 30 ? '...' : ''}
                  <button
                    type="button"
                    onClick={() => setEvents((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-slate-500 hover:text-white"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Resident modifications */}
        <div>
          <label className="block text-[11px] text-slate-400 mb-1">
            {t('whatif.modify_resident', 'Modify resident')}
          </label>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1.5 items-end">
            <select
              value={selectedResidentId}
              onChange={(e) => setSelectedResidentId(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-slate-100 outline-none"
            >
              <option value="">{t('whatif.select_resident', 'Select...')}</option>
              {residents.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <select
              value={modMood}
              onChange={(e) => setModMood(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-slate-100 outline-none"
            >
              <option value="">{t('whatif.mood', 'Mood')}</option>
              {MOODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input
              type="number"
              value={modCoins}
              onChange={(e) => setModCoins(e.target.value)}
              placeholder={t('whatif.coins', 'Coins')}
              className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={addResidentMod}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
            >
              +
            </button>
          </div>
          {residentMods.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {residentMods.map((mod) => {
                const name = residents.find((r) => r.id === mod.resident_id)?.name ?? mod.resident_id
                return (
                  <span
                    key={mod.resident_id}
                    className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-slate-300"
                  >
                    {name}: {mod.mood ?? ''} {mod.coins !== undefined ? `$${mod.coins}` : ''}
                    <button
                      type="button"
                      onClick={() => setResidentMods((prev) => prev.filter((m) => m.resident_id !== mod.resident_id))}
                      className="text-slate-500 hover:text-white"
                    >
                      &times;
                    </button>
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* Run button */}
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="w-full rounded-lg border border-white/10 bg-white/10 py-2 text-xs font-medium text-white transition hover:bg-white/15 disabled:opacity-50"
        >
          {busy
            ? t('whatif.running', 'Running analysis...')
            : t('whatif.run', 'Run What-If Analysis')}
        </button>

        {error && (
          <p className="text-xs text-rose-400">{error}</p>
        )}
      </div>

      {/* --- Results Section --- */}
      {result && (
        <div className="grid gap-3 mt-1">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">
            {t('whatif.results_badge', 'Prediction')} &mdash; {result.ticks_simulated} {t('whatif.ticks_unit', 'ticks')}
          </p>

          {/* KPI comparison grid */}
          <div className="grid grid-cols-2 gap-2">
            <KpiCard
              label={t('whatif.population', 'Population')}
              current={result.current.population}
              predicted={result.predicted.population}
            />
            <KpiCard
              label={t('whatif.avg_mood', 'Avg Mood')}
              current={result.current.avg_mood_score}
              predicted={result.predicted.avg_mood_score}
            />
            <KpiCard
              label={t('whatif.total_coins', 'Total Coins')}
              current={result.current.total_coins}
              predicted={result.predicted.total_coins}
            />
            <KpiCard
              label={t('whatif.relationships', 'Relationships')}
              current={result.current.total_relationships}
              predicted={result.predicted.total_relationships}
            />
            <KpiCard
              label={t('whatif.gini', 'Gini Coeff.')}
              current={result.current.gini_coefficient}
              predicted={result.predicted.gini_coefficient}
            />
            <KpiCard
              label={t('whatif.tick_range', 'Tick')}
              current={result.current.tick}
              predicted={result.predicted.tick}
            />
          </div>

          {/* Per-resident diff table */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">
              {t('whatif.resident_changes', 'Resident Changes')}
            </p>
            <ResidentDiffTable current={result.current} predicted={result.predicted} t={t} />
          </div>
        </div>
      )}
    </PanelShell>
  )
}
