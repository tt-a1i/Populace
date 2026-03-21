import { useState } from 'react'

import { addBuilding, getBuildings, removeBuilding } from '../../services/api'
import { useSimulationStore } from '../../stores/simulation'
import type { Building } from '../../types'

const BUILDING_TYPES = [
  { value: 'home', label: '住宅 Home' },
  { value: 'cafe', label: '咖啡馆 Cafe' },
  { value: 'park', label: '公园 Park' },
  { value: 'shop', label: '商店 Shop' },
  { value: 'school', label: '学校 School' },
  { value: 'gym', label: '健身房 Gym' },
  { value: 'library', label: '图书馆 Library' },
  { value: 'hospital', label: '医院 Hospital' },
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
    if (!bName.trim()) { setError('请输入建筑名称'); return }
    setBusy(true)
    setError(null)
    try {
      await addBuilding({ type: bType, name: bName.trim(), capacity: bCapacity, position: [bX, bY] })
      await refreshBuildings(setBuildings)
      setBName('')
      setFormOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '建造失败，请检查位置是否被占用')
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
    <div className="rounded-[24px] border border-emerald-300/20 bg-slate-950/70 p-5 text-slate-100 shadow-[0_18px_44px_rgba(15,23,42,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-200/70">Build Mode</p>
          <h3 className="mt-1 font-display text-2xl text-white">建造 &amp; 拆除</h3>
        </div>
        <button
          type="button"
          onClick={() => { setFormOpen((o) => !o); setError(null) }}
          className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1.5 text-sm font-medium text-emerald-200 transition hover:bg-emerald-300/20"
        >
          {formOpen ? '收起' : '+ 新建建筑'}
        </button>
      </div>

      {/* ── Build form ── */}
      {formOpen && (
        <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4">
          <p className="mb-3 text-[11px] uppercase tracking-[0.28em] text-emerald-300/70">新建建筑参数</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 grid gap-1 text-xs text-slate-300">
              建筑类型
              <select
                value={bType}
                onChange={(e) => setBType(e.target.value)}
                className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none"
              >
                {BUILDING_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="col-span-2 grid gap-1 text-xs text-slate-300">
              建筑名称
              <input
                value={bName}
                onChange={(e) => setBName(e.target.value)}
                placeholder="例如：星光书店"
                className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none placeholder-slate-600"
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-300">
              容量 (1-200)
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
              入口坐标 (x, y)
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
              {busy ? '建造中…' : '🏗️ 建造'}
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 hover:bg-white/10"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* ── Building list ── */}
      <div className="mt-4">
        <p className="mb-2 text-[11px] uppercase tracking-[0.28em] text-slate-500">
          现有建筑 · {buildings.length} 栋
        </p>
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {buildings.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-slate-500">
              暂无建筑数据
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
                    位置 ({b.position[0]}, {b.position[1]}) · 容量 {b.capacity}
                    {b.occupants ? ` · 占用 ${b.occupants}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={demolishBusy === b.id}
                  onClick={() => void handleDemolish(b.id)}
                  className="shrink-0 rounded-xl border border-rose-400/25 bg-rose-400/8 px-2.5 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-400/18 disabled:opacity-40"
                >
                  {demolishBusy === b.id ? '…' : '🗑 拆除'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
