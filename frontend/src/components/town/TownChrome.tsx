import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { GraphRelationship } from '../../stores/relationships'
import type { ResidentPosition } from '../../stores/simulation'
import {
  getTownLevel,
  teleportResident,
} from '../../services/api'
import { BuildingDetailPanel } from '../toolbar/BuildingDetailPanel'
import type { Building, Zone } from '../../types'
import { ResidentStoryPanel } from './ResidentStoryPanel'
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  formatTileKind,
  getBuildingFootprint,
  type PlaceholderBuilding,
  type TileInspectionDetails,
  type TileKind,
} from './townMap'

export interface TownContextMenuState {
  screenX: number
  screenY: number
  tileX: number
  tileY: number
  tileKind: TileKind
  nearbyResidentId?: string   // set when right-clicking on/near a resident
}

export type TownPlaceholder = PlaceholderBuilding
export type TownInspectionState = TileInspectionDetails

interface TownChromeProps {
  residents: ResidentPosition[]
  buildings: Array<Building & { occupants?: number }>
  relationships: GraphRelationship[]
  selectedResidentId: string | null
  followedResidentId: string | null
  currentTime: string
  messageFeed: Array<{ text: string }>
  contextMenu: TownContextMenuState | null
  inspection: TownInspectionState | null
  selectedZone?: Zone | null
  placeholders: TownPlaceholder[]
  onCloseContextMenu: () => void
  onInjectEvent: () => void
  onInspectTile: () => void
  onViewBuilding?: (buildingId: string) => void
  onPlacePlaceholder: () => void
  onClearResidentSelection: () => void
  onDismissInspection: () => void
  onDismissZone?: () => void
  onCancelFollow: () => void
  onFollowResident?: (id: string) => void
  onGiftResident?: (id: string) => void
}

export function TownChrome({
  residents,
  buildings,
  selectedResidentId,
  followedResidentId,
  contextMenu,
  inspection,
  selectedZone = null,
  placeholders,
  onCloseContextMenu,
  onInjectEvent,
  onInspectTile,
  onViewBuilding,
  onPlacePlaceholder,
  onClearResidentSelection,
  onDismissInspection,
  onDismissZone = () => {},
  onCancelFollow,
  onFollowResident,
  onGiftResident,
}: TownChromeProps) {
  const { t } = useTranslation()
  const [detailBuildingId, setDetailBuildingId] = useState<string | null>(null)
  const [townLevel, setTownLevel] = useState(1)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      void getTownLevel().then((d) => { if (!cancelled) setTownLevel(d.level) }).catch(() => {})
    }
    load()
    const timer = setInterval(load, 15000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  const followedResident = followedResidentId
    ? residents.find((r) => r.id === followedResidentId)
    : null

  const handleTeleport = async (x: number, y: number, rid?: string) => {
    const targetId = rid ?? selectedResidentId
    if (!targetId) return
    try { await teleportResident(targetId, x, y) }
    catch { /* silently ignore */ }
  }

  return (
    <>
      {/* Town level HUD badge */}
      <div
        data-testid="town-level-badge"
        className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-slate-950/80 px-3 py-1.5 shadow-lg backdrop-blur-md cursor-pointer"
        onClick={() => window.dispatchEvent(new CustomEvent('populace:open-tool', { detail: { tool: 'milestones' } }))}
      >
        <span className="text-xs font-bold text-amber-300">Lv.{townLevel}</span>
      </div>

      {inspection && (
        <section
          data-testid="town-inspection"
          className="absolute left-3 top-12 z-20 w-[min(15rem,calc(100vw-2rem))] rounded-xl border border-white/10 bg-slate-950/80 px-3 py-3 text-slate-100 shadow-lg backdrop-blur-sm animate-[fadeIn_200ms_ease-out]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-100/70">{t('chrome.inspect_badge')}</p>
              <h3 className="mt-2 font-mono text-lg font-bold text-white">{t('chrome.tile_label', { x: inspection.tileX, y: inspection.tileY })}</h3>
            </div>
            <button
              type="button"
              onClick={onDismissInspection}
              aria-label={t('chrome.close')}
              className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 transition duration-200 hover:bg-white/10 active:scale-95"
            >
              {t('chrome.close')}
            </button>
          </div>
          <dl className="mt-4 grid gap-3 text-sm text-slate-300">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">{t('chrome.terrain')}</dt>
              <dd>{formatTileKind(inspection.tileKind)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">{t('chrome.building_label')}</dt>
              <dd>{inspection.buildingName ?? t('chrome.no_building')}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">{t('chrome.resident_count')}</dt>
              <dd>{inspection.residentCount}</dd>
            </div>
          </dl>
          {inspection.buildingId && (
            <button
              type="button"
              onClick={() => setDetailBuildingId(inspection.buildingId)}
              className="mt-3 w-full rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-200 transition duration-200 hover:bg-cyan-400/20 active:scale-95"
            >
              {t('building_detail.view_details')}
            </button>
          )}
        </section>
      )}

      {selectedZone && (
        <section
          data-testid="town-zone-panel"
          className="absolute left-3 top-56 z-20 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-white/10 bg-slate-950/85 px-3 py-3 text-slate-100 shadow-lg backdrop-blur-sm animate-[fadeIn_200ms_ease-out]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-100/70">Zone</p>
              <h3 className="mt-2 font-mono text-lg font-bold text-white">{selectedZone.name}</h3>
              <p className="mt-1 text-xs text-slate-400">{selectedZone.type}</p>
            </div>
            <button
              type="button"
              onClick={onDismissZone}
              aria-label={t('chrome.close')}
              className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 transition duration-200 hover:bg-white/10 active:scale-95"
            >
              {t('chrome.close')}
            </button>
          </div>
          <dl className="mt-4 grid gap-3 text-sm text-slate-300">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">居民</dt>
              <dd>{selectedZone.resident_count}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">建筑</dt>
              <dd>{selectedZone.building_count}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Noise</dt>
              <dd>{Math.round(selectedZone.atmosphere.noise * 100)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Safety</dt>
              <dd>{Math.round(selectedZone.atmosphere.safety * 100)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Beauty</dt>
              <dd>{Math.round(selectedZone.atmosphere.beauty * 100)}</dd>
            </div>
          </dl>
        </section>
      )}

      {/* Building detail panel */}
      {detailBuildingId && (
        <section
          className="absolute left-3 top-56 z-20 w-[min(17rem,calc(100vw-2rem))] rounded-xl border border-white/10 bg-slate-950/85 px-3 py-3 text-slate-100 shadow-xl backdrop-blur-sm animate-[fadeIn_200ms_ease-out]"
        >
          <BuildingDetailPanel
            buildingId={detailBuildingId}
            onClose={() => setDetailBuildingId(null)}
          />
        </section>
      )}

      {selectedResidentId && (
        <aside
          data-testid="resident-sidebar"
          className="absolute bottom-14 right-3 top-3 z-30 flex w-[min(20rem,calc(100%-2rem))] flex-col rounded-xl border border-white/10 bg-slate-950/85 p-4 text-slate-100 shadow-xl backdrop-blur-sm animate-[slideInRight_250ms_ease-out]"
        >
          {/* Quick-action bar */}
          <div data-testid="resident-quick-actions" className="mb-3 flex gap-1.5 rounded-lg border border-white/8 bg-white/[0.03] p-1.5">
            <button
              type="button"
              onClick={() => {
                if (followedResidentId === selectedResidentId) {
                  onCancelFollow()
                } else {
                  onFollowResident?.(selectedResidentId)
                }
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-cyan-200 transition duration-150 hover:bg-cyan-400/10 active:scale-95"
            >
              <span className="text-sm" aria-hidden="true">📍</span>
              {followedResidentId === selectedResidentId ? t('quick_actions.unfollow') : t('quick_actions.follow')}
            </button>
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('populace:open-tool', { detail: { tool: 'director', residentId: selectedResidentId } }))
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-amber-200 transition duration-150 hover:bg-amber-400/10 active:scale-95"
            >
              <span className="text-sm" aria-hidden="true">💬</span>
              {t('quick_actions.chat')}
            </button>
            <button
              type="button"
              onClick={() => onGiftResident?.(selectedResidentId)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-rose-200 transition duration-150 hover:bg-rose-400/10 active:scale-95"
            >
              <span className="text-sm" aria-hidden="true">🎁</span>
              {t('quick_actions.gift')}
            </button>
          </div>
          <ResidentStoryPanel
            key={selectedResidentId}
            residentId={selectedResidentId}
            residents={residents}
            buildings={buildings}
            onClose={onClearResidentSelection}
          />
        </aside>
      )}

      {/* Follow-mode HUD indicator */}
      {followedResident && (
        <div className="absolute left-1/2 top-12 z-30 -translate-x-1/2 animate-[fadeIn_300ms_ease-out]">
          <div className="flex items-center gap-2.5 rounded-full border border-cyan-400/25 bg-slate-950/80 px-4 py-2 shadow-lg backdrop-blur-md">
            <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
            <span className="text-xs font-medium text-cyan-200">
              {t('chrome.following', { name: followedResident.name })}
            </span>
            <button
              type="button"
              onClick={onCancelFollow}
              className="ml-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400 transition duration-200 hover:bg-white/10 hover:text-white active:scale-95"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <section
        data-testid="town-minimap"
        className={`absolute bottom-14 right-3 z-10 overflow-hidden rounded-xl border border-white/8 bg-slate-950/70 p-2 text-slate-100 shadow-lg backdrop-blur-sm transition-opacity duration-200 ${selectedResidentId ? 'pointer-events-none opacity-0' : ''}`}
      >

        <div className="relative h-28 w-36 rounded-lg border border-white/8 bg-slate-950/60">
          {buildings.map((building) => {
            const footprint = getBuildingFootprint(building)

            return (
              <span
                key={building.id}
                data-testid="minimap-building-footprint"
                className="absolute block rounded border border-cyan-200/20 bg-cyan-200/15"
                style={{
                  left: `${(building.position[0] / MAP_WIDTH) * 100}%`,
                  top: `${(building.position[1] / MAP_HEIGHT) * 100}%`,
                  width: `${(footprint.cols / MAP_WIDTH) * 100}%`,
                  height: `${(footprint.rows / MAP_HEIGHT) * 100}%`,
                }}
              />
            )
          })}
          {placeholders.map((placeholder) => (
            <span
              key={placeholder.id}
              data-testid="minimap-placeholder-dot"
              className="absolute block rounded border border-amber-200/40 bg-amber-200/35"
              style={{
                left: `${(placeholder.tileX / MAP_WIDTH) * 100}%`,
                top: `${(placeholder.tileY / MAP_HEIGHT) * 100}%`,
                width: '8px',
                height: '8px',
                transform: 'translate(-50%, -50%)',
              }}
              title={placeholder.label}
            />
          ))}
          {residents.map((resident) => (
            <span
              key={resident.id}
              data-testid="minimap-resident-dot"
              className="absolute block rounded-full border border-slate-950/70"
              style={{
                left: `${(resident.targetX / MAP_WIDTH) * 100}%`,
                top: `${(resident.targetY / MAP_HEIGHT) * 100}%`,
                width: resident.id === selectedResidentId ? '10px' : '8px',
                height: resident.id === selectedResidentId ? '10px' : '8px',
                backgroundColor: `#${resident.color.toString(16).padStart(6, '0')}`,
                boxShadow: resident.id === selectedResidentId ? '0 0 0 2px rgba(250, 204, 21, 0.55)' : 'none',
                transform: 'translate(-50%, -50%)',
              }}
              title={resident.name}
            />
          ))}
        </div>
      </section>

      {/* Context menu — glassmorphism with icons and dividers */}
      {contextMenu && (
        <section
          data-testid="town-context-menu"
          data-town-context-menu="true"
          className="absolute z-30 w-52 overflow-hidden rounded-2xl border border-white/12 bg-slate-950/85 shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-xl animate-[contextMenuIn_150ms_ease-out]"
          style={{ left: contextMenu.screenX, top: contextMenu.screenY }}
        >
          {/* Header */}
          <div className="border-b border-white/8 px-4 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300/70">
              {t('chrome.tile_label', { x: contextMenu.tileX, y: contextMenu.tileY })}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">{formatTileKind(contextMenu.tileKind)}</p>
          </div>

          {/* Menu items */}
          <div className="py-1.5">
            <button
              type="button"
              onClick={onInjectEvent}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-slate-200 transition duration-150 hover:bg-cyan-400/10 hover:text-white active:bg-cyan-400/15"
            >
              <span className="w-4 text-center text-xs" aria-hidden="true">⚡</span>
              {t('chrome.ctx_inject_event')}
            </button>
            <button
              type="button"
              onClick={onInspectTile}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-slate-200 transition duration-150 hover:bg-cyan-400/10 hover:text-white active:bg-cyan-400/15"
            >
              <span className="w-4 text-center text-xs" aria-hidden="true">🔍</span>
              {t('chrome.ctx_inspect_tile')}
            </button>

            {(() => {
              const bld = buildings.find(b => b.position[0] === contextMenu.tileX && b.position[1] === contextMenu.tileY)
              return bld ? (
                <button
                  type="button"
                  onClick={() => { onViewBuilding?.(bld.id); onCloseContextMenu() }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-emerald-200 transition duration-150 hover:bg-emerald-400/10 hover:text-emerald-100 active:bg-emerald-400/15"
                >
                  <span className="w-4 text-center text-xs" aria-hidden="true">🏠</span>
                  {t('chrome.ctx_view_building', { name: bld.name })}
                </button>
              ) : null
            })()}

            <div className="mx-3 my-1 border-t border-white/6" />

            <button
              type="button"
              onClick={onPlacePlaceholder}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-slate-200 transition duration-150 hover:bg-amber-400/10 hover:text-amber-100 active:bg-amber-400/15"
            >
              <span className="w-4 text-center text-xs" aria-hidden="true">📌</span>
              {t('chrome.ctx_place_placeholder')}
            </button>

            {/* Teleport selected resident or context-menu nearby resident */}
            {(selectedResidentId || contextMenu.nearbyResidentId) && (
              <>
                <div className="mx-3 my-1 border-t border-white/6" />
                <button
                  type="button"
                  onClick={() => {
                    void handleTeleport(contextMenu.tileX, contextMenu.tileY, contextMenu.nearbyResidentId)
                    onCloseContextMenu()
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-violet-200 transition duration-150 hover:bg-violet-400/10 hover:text-violet-100 active:bg-violet-400/15"
                >
                  <span className="w-4 text-center text-xs" aria-hidden="true">⚡</span>
                  {t('chrome.ctx_teleport')}
                </button>
              </>
            )}
          </div>

          {/* Dismiss footer */}
          <div className="border-t border-white/6 px-1.5 py-1.5">
            <button
              type="button"
              onClick={onCloseContextMenu}
              className="w-full rounded-xl px-3 py-1.5 text-center text-xs text-slate-500 transition duration-150 hover:bg-white/5 hover:text-slate-300 active:scale-[0.97]"
            >
              {t('chrome.ctx_dismiss')}
            </button>
          </div>
        </section>
      )}
    </>
  )
}
