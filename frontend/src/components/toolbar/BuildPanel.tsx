import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { addBuilding, getBuildings, removeBuilding } from '../../services/api'
import { useSimulationStore } from '../../stores/simulation'
import type { Building } from '../../types'

const BUILDING_TYPE_KEYS = [
  { value: 'home', i18nKey: 'build_panel.type_home' },
  { value: 'cafe', i18nKey: 'build_panel.type_cafe' },
  { value: 'park', i18nKey: 'build_panel.type_park' },
  { value: 'shop', i18nKey: 'build_panel.type_shop' },
  { value: 'school', i18nKey: 'build_panel.type_school' },
  { value: 'gym', i18nKey: 'build_panel.type_gym' },
  { value: 'library', i18nKey: 'build_panel.type_library' },
  { value: 'hospital', i18nKey: 'build_panel.type_hospital' },
]

const TYPE_COLORS: Record<string, string> = {
  home: '#1e40af',
  cafe: '#b45309',
  park: '#15803d',
  shop: '#dc2626',
  school: '#7c3aed',
  gym: '#0e7490',
  library: '#9333ea',
  hospital: '#be185d',
}

function typeBadgeStyle(type: string): React.CSSProperties {
  const color = TYPE_COLORS[type] ?? '#475569'
  return { background: color + '33', border: `1px solid ${color}66`, color }
}

async function refreshBuildings(
  setBuildings: (b: Array<Building & { occupants: number }>) => void,
) {
  const list = await getBuildings()
  setBuildings(list.map((b) => ({ ...b, occupants: 0 })))
}

export function BuildPanel() {
  const { t } = useTranslation()
  const buildings = useSimulationStore((s) => s.buildings)
  const setBuildings = useSimulationStore((s) => s.setBuildings)

  // New-building form state
  const [formOpen, setFormOpen] = useState(false)
  const [bType, setBType] = useState('home')
  const [bName, setBName] = useState('')
  const [bCapacity, setBCapacity] = useState(4)
  const [bX, setBX] = useState(0)
  const [bY, setBY] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [demolishBusy, setDemolishBusy] = useState<string | null>(null)

  const handleBuild = async () => {
    if (!bName.trim()) { setError(t('build_panel.name_required')); return }
    setBusy(true)
    setError(null)
    try {
      await addBuilding({ type: bType, name: bName.trim(), capacity: bCapacity, position: [bX, bY] })
      await refreshBuildings(setBuildings)
      setBName('')
      setFormOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('build_panel.build_fail_default'))
    } finally {
      setBusy(false)
    }
  }

  const handleDemolish = async (id: string) => {
    setDemolishBusy(id)
    try {
      await removeBuilding(id)
      await refreshBuildings(setBuildings)
    } catch {
      /* silently ignore */
    } finally {
      setDemolishBusy(null)
    }
  }

  return (
    <div className="rounded-xl border border-emerald-300/20 bg-slate-950/70 p-5 text-slate-100 ">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-200/70">{t('build_panel.badge')}</p>
          <h3 className="mt-1 font-display text-2xl text-white">{t('build_panel.title')}</h3>
        </div>
        <button
          type="button"
          onClick={() => { setFormOpen((o) => !o); setError(null) }}
          className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1.5 text-sm font-medium text-emerald-200 transition hover:bg-emerald-300/20"
        >
          {formOpen ? t('build_panel.collapse') : t('build_panel.new_building')}
        </button>
      </div>

      {/* ── Build form ── */}
      {formOpen && (
        <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4">
          <p className="mb-3 text-[11px] uppercase tracking-[0.28em] text-emerald-300/70">{t('build_panel.form_title')}</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 grid gap-1 text-xs text-slate-300">
              {t('build_panel.type_label')}
              <select
                value={bType}
                onChange={(e) => setBType(e.target.value)}
                className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none"
              >
                {BUILDING_TYPE_KEYS.map((bt) => (
                  <option key={bt.value} value={bt.value}>{t(bt.i18nKey)}</option>
                ))}
              </select>
            </label>
            <label className="col-span-2 grid gap-1 text-xs text-slate-300">
              {t('build_panel.name_label')}
              <input
                value={bName}
                onChange={(e) => setBName(e.target.value)}
                placeholder={t('build_panel.name_placeholder')}
                className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none placeholder-slate-600"
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-300">
              {t('build_panel.capacity_label')}
              <input
                type="number"
                min={1}
                max={200}
                value={bCapacity}
                onChange={(e) => setBCapacity(Number(e.target.value))}
                className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none"
              />
            </label>
            <div className="grid gap-1 text-xs text-slate-300">
              {t('build_panel.position_label')}
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  max={39}
                  value={bX}
                  onChange={(e) => setBX(Number(e.target.value))}
                  placeholder="X"
                  className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none"
                />
                <input
                  type="number"
                  min={0}
                  max={29}
                  value={bY}
                  onChange={(e) => setBY(Number(e.target.value))}
                  placeholder="Y"
                  className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none"
                />
              </div>
            </div>
          </div>
          {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleBuild()}
              className="flex-1 rounded-xl bg-emerald-600/80 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy ? t('build_panel.building_busy') : t('build_panel.building_btn')}
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 hover:bg-white/10"
            >
              {t('build_panel.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* ── Building list ── */}
      <div className="mt-4">
        <p className="mb-2 text-[11px] uppercase tracking-[0.28em] text-slate-500">
          {t('build_panel.existing_title')} · {buildings.length} {t('build_panel.existing_count')}
        </p>
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {buildings.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-slate-500">
              {t('build_panel.no_buildings')}
            </p>
          ) : (
            buildings.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-slate-900/50 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-white">{b.name}</p>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                      style={typeBadgeStyle(b.type)}
                    >
                      {b.type}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {t('build_panel.position_info')} ({b.position[0]}, {b.position[1]}) · {t('build_panel.capacity_info')} {b.capacity}
                    {b.occupants ? ` · ${t('build_panel.occupants_info')} ${b.occupants}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={demolishBusy === b.id}
                  onClick={() => void handleDemolish(b.id)}
                  className="shrink-0 rounded-xl border border-rose-400/25 bg-rose-400/8 px-2.5 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-400/18 disabled:opacity-40"
                >
                  {demolishBusy === b.id ? '…' : t('build_panel.demolish')}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
