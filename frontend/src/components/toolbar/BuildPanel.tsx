import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { addBuilding, getBuildings, removeBuilding } from '../../services/api'
import { useSimulationStore } from '../../stores/simulation'
import type { Building } from '../../types'
import { EmptyState } from '../ui/EmptyState'
import { PanelShell } from '../ui/PanelShell'

const BUILDING_TYPE_KEYS = [
  { value: 'home', i18nKey: 'build_panel.type_home', icon: '🏠' },
  { value: 'cafe', i18nKey: 'build_panel.type_cafe', icon: '☕' },
  { value: 'park', i18nKey: 'build_panel.type_park', icon: '🌳' },
  { value: 'shop', i18nKey: 'build_panel.type_shop', icon: '🛍️' },
  { value: 'school', i18nKey: 'build_panel.type_school', icon: '🏫' },
  { value: 'gym', i18nKey: 'build_panel.type_gym', icon: '💪' },
  { value: 'library', i18nKey: 'build_panel.type_library', icon: '📚' },
  { value: 'hospital', i18nKey: 'build_panel.type_hospital', icon: '🏥' },
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

const TYPE_ICONS: Record<string, string> = {
  home: '🏠', cafe: '☕', park: '🌳', shop: '🛍️',
  school: '🏫', gym: '💪', library: '📚', hospital: '🏥',
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
    <PanelShell
      icon="🏗️"
      title={t('build_panel.title')}
      badge={t('build_panel.badge')}
      headerRight={
        <button
          type="button"
          onClick={() => { setFormOpen((o) => !o); setError(null) }}
          aria-label={formOpen ? t('build_panel.collapse') : t('build_panel.new_building')}
          className="btn-primary rounded-xl px-3 py-1.5 text-xs font-medium transition duration-200 active:scale-95"
        >
          {formOpen ? t('build_panel.collapse') : `+ ${t('build_panel.new_building')}`}
        </button>
      }
    >
      {/* ── Build form ── */}
      {formOpen && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <p className="panel-section-label mb-3">{t('build_panel.form_title')}</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 grid gap-1 text-xs text-slate-300">
              {t('build_panel.type_label')}
              <select
                value={bType}
                onChange={(e) => setBType(e.target.value)}
                aria-label={t('build_panel.type_label')}
                className="panel-select"
              >
                {BUILDING_TYPE_KEYS.map((bt) => (
                  <option key={bt.value} value={bt.value}>{bt.icon} {t(bt.i18nKey)}</option>
                ))}
              </select>
            </label>
            <label className="col-span-2 grid gap-1 text-xs text-slate-300">
              {t('build_panel.name_label')}
              <input
                value={bName}
                onChange={(e) => setBName(e.target.value)}
                placeholder={t('build_panel.name_placeholder')}
                aria-label={t('build_panel.name_label')}
                className="panel-input"
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
                aria-label={t('build_panel.capacity_label')}
                className="panel-input"
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
                  aria-label={`${t('build_panel.position_label')} X`}
                  className="panel-input w-full"
                />
                <input
                  type="number"
                  min={0}
                  max={29}
                  value={bY}
                  onChange={(e) => setBY(Number(e.target.value))}
                  placeholder="Y"
                  aria-label={`${t('build_panel.position_label')} Y`}
                  className="panel-input w-full"
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
              aria-label={busy ? t('build_panel.building_busy') : t('build_panel.building_btn')}
              className="btn-primary flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition duration-200 active:scale-95"
            >
              {busy ? t('build_panel.building_busy') : t('build_panel.building_btn')}
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              aria-label={t('build_panel.cancel')}
              className="btn-secondary rounded-xl px-3 py-2 text-sm transition duration-200"
            >
              {t('build_panel.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* ── Building list (card style) ── */}
      <div>
        <p className="panel-section-label mb-2">
          {t('build_panel.existing_title')} · {buildings.length} {t('build_panel.existing_count')}
        </p>
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {buildings.length === 0 ? (
            <EmptyState
              icon="🏗️"
              message={t('build_panel.no_buildings')}
              actionLabel={!formOpen ? t('build_panel.new_building') : undefined}
              onAction={!formOpen ? () => setFormOpen(true) : undefined}
            />
          ) : (
            buildings.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="text-lg leading-none">{TYPE_ICONS[b.type] ?? '🏢'}</span>
                  <div className="min-w-0">
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
                </div>
                <button
                  type="button"
                  disabled={demolishBusy === b.id}
                  onClick={() => void handleDemolish(b.id)}
                  aria-label={`${t('build_panel.demolish')} ${b.name}`}
                  className="btn-danger shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-medium transition duration-200 active:scale-95"
                >
                  {demolishBusy === b.id ? '…' : t('build_panel.demolish')}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </PanelShell>
  )
}
