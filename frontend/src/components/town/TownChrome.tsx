import type { GraphRelationship } from '../../stores/relationships'
import type { ResidentPosition } from '../../stores/simulation'
import {
  teleportResident,
} from '../../services/api'
import type { Building } from '../../types'
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
  currentTime: string
  messageFeed: Array<{ text: string }>
  contextMenu: TownContextMenuState | null
  inspection: TownInspectionState | null
  placeholders: TownPlaceholder[]
  onCloseContextMenu: () => void
  onInjectEvent: () => void
  onInspectTile: () => void
  onPlacePlaceholder: () => void
  onClearResidentSelection: () => void
  onDismissInspection: () => void
}

export function TownChrome({
  residents,
  buildings,
  selectedResidentId,
  contextMenu,
  inspection,
  placeholders,
  onCloseContextMenu,
  onInjectEvent,
  onInspectTile,
  onPlacePlaceholder,
  onClearResidentSelection,
  onDismissInspection,
}: TownChromeProps) {
  const handleTeleport = async (x: number, y: number, rid?: string) => {
    const targetId = rid ?? selectedResidentId
    if (!targetId) return
    try { await teleportResident(targetId, x, y) }
    catch { /* silently ignore */ }
  }

  return (
    <>
      {inspection && (
        <section
          data-testid="town-inspection"
          className="absolute left-3 top-12 z-20 w-[15rem] rounded-xl border border-white/10 bg-slate-950/80 px-3 py-3 text-slate-100 shadow-lg backdrop-blur-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-100/70">查看位置</p>
              <h3 className="mt-2 font-mono text-lg font-bold text-white">Tile {inspection.tileX}, {inspection.tileY}</h3>
            </div>
            <button
              type="button"
              onClick={onDismissInspection}
              className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 transition hover:bg-white/10"
            >
              关闭
            </button>
          </div>
          <dl className="mt-4 grid gap-3 text-sm text-slate-300">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">地形</dt>
              <dd>{formatTileKind(inspection.tileKind)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">建筑</dt>
              <dd>{inspection.buildingName ?? '暂无'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">角色数</dt>
              <dd>{inspection.residentCount}</dd>
            </div>
          </dl>
        </section>
      )}

      {selectedResidentId && (
        <aside
          data-testid="resident-sidebar"
          className="absolute bottom-14 right-3 top-3 z-30 flex w-[min(20rem,calc(100%-2rem))] flex-col rounded-xl border border-white/10 bg-slate-950/85 p-4 text-slate-100 shadow-xl backdrop-blur-sm"
        >
          <ResidentStoryPanel
            key={selectedResidentId}
            residentId={selectedResidentId}
            residents={residents}
            buildings={buildings}
            onClose={onClearResidentSelection}
          />
        </aside>
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
                className="absolute block rounded-[4px] border border-cyan-200/20 bg-cyan-200/15"
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
              className="absolute block rounded-[4px] border border-amber-200/40 bg-amber-200/35"
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

      {contextMenu && (
        <section
          data-testid="town-context-menu"
          data-town-context-menu="true"
          className="absolute z-30 w-44 rounded-xl border border-white/10 bg-slate-950/90 p-1.5 text-slate-100 shadow-xl backdrop-blur-sm"
          style={{ left: contextMenu.screenX, top: contextMenu.screenY }}
        >
          <div className="border-b border-white/8 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-100/70">Tile {contextMenu.tileX}, {contextMenu.tileY}</p>
            <p className="mt-1 text-xs text-slate-400">{formatTileKind(contextMenu.tileKind)}</p>
          </div>
          <div className="grid gap-1 px-1 py-2">
            <button
              type="button"
              onClick={onInjectEvent}
              className="rounded-2xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-cyan-300/14"
            >
              投放事件
            </button>
            <button
              type="button"
              onClick={onInspectTile}
              className="rounded-2xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-cyan-300/14"
            >
              查看位置
            </button>
            <button
              type="button"
              onClick={onPlacePlaceholder}
              className="rounded-2xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-amber-300/14"
            >
              放置建筑占位
            </button>
            {/* Teleport selected resident or context-menu nearby resident */}
            {(selectedResidentId || contextMenu.nearbyResidentId) && (
              <button
                type="button"
                onClick={() => {
                  void handleTeleport(contextMenu.tileX, contextMenu.tileY, contextMenu.nearbyResidentId)
                  onCloseContextMenu()
                }}
                className="rounded-2xl px-3 py-2 text-left text-sm text-violet-200 transition hover:bg-violet-300/14"
              >
                ⚡ 传送到此
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onCloseContextMenu}
            className="w-full rounded-2xl border border-white/8 px-3 py-2 text-xs text-slate-400 transition hover:bg-white/5"
          >
            收起菜单
          </button>
        </section>
      )}
    </>
  )
}
