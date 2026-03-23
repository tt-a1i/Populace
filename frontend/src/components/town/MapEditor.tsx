import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  type TileKind,
  MAP_WIDTH,
  MAP_HEIGHT,
  setTileOverride,
  eraseTileOverride,
  saveTileOverrides,
  clearAllTileOverrides,
} from './townMap'

type BrushKind = TileKind | 'eraser'
type BrushSize = 1 | 2 | 3

const BRUSH_OPTIONS: { kind: BrushKind; icon: string; label: string; color: string }[] = [
  { kind: 'grass', icon: '\u{1F33F}', label: '\u8349\u5730', color: 'border-green-400/30 bg-green-400/10 text-green-200' },
  { kind: 'road', icon: '\u{1F6E4}\uFE0F', label: '\u9053\u8DEF', color: 'border-stone-400/30 bg-stone-400/10 text-stone-200' },
  { kind: 'water', icon: '\u{1F30A}', label: '\u6C34\u57DF', color: 'border-blue-400/30 bg-blue-400/10 text-blue-200' },
  { kind: 'mountain', icon: '\u26F0\uFE0F', label: '\u5C71\u5730', color: 'border-slate-400/30 bg-slate-400/10 text-slate-200' },
  { kind: 'eraser', icon: '\u{1F9F9}', label: '\u6A61\u76AE\u64E6', color: 'border-amber-400/30 bg-amber-400/10 text-amber-200' },
]

const SIZE_OPTIONS: BrushSize[] = [1, 2, 3]

interface MapEditorProps {
  /** Called when tiles are modified so the renderer can redraw */
  onTilesChanged: () => void
  /** Called when the editor should close */
  onClose: () => void
}

export function MapEditor({ onTilesChanged, onClose }: MapEditorProps) {
  const { t } = useTranslation()
  const [brush, setBrush] = useState<BrushKind>('grass')
  const [size, setSize] = useState<BrushSize>(1)
  const [painting, setPainting] = useState(false)

  const paintTile = useCallback(
    (tileX: number, tileY: number) => {
      const halfSize = Math.floor(size / 2)
      for (let dx = -halfSize; dx <= halfSize; dx++) {
        for (let dy = -halfSize; dy <= halfSize; dy++) {
          const x = tileX + dx
          const y = tileY + dy
          if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) continue
          if (brush === 'eraser') {
            eraseTileOverride(x, y)
          } else {
            setTileOverride(x, y, brush)
          }
        }
      }
      saveTileOverrides()
      onTilesChanged()
    },
    [brush, size, onTilesChanged],
  )

  // Expose paint function for the canvas to call
  useEffect(() => {
    const handler = (e: CustomEvent<{ tileX: number; tileY: number }>) => {
      paintTile(e.detail.tileX, e.detail.tileY)
    }
    window.addEventListener('populace:map-editor-paint' as string, handler as EventListener)
    return () => window.removeEventListener('populace:map-editor-paint' as string, handler as EventListener)
  }, [paintTile])

  // Track painting state for drag-paint
  useEffect(() => {
    const down = () => setPainting(true)
    const up = () => setPainting(false)
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  // Expose painting state so canvas knows when to trigger paint on move
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__mapEditorPainting = painting
    return () => { delete (window as unknown as Record<string, unknown>).__mapEditorPainting }
  }, [painting])

  const handleClear = () => {
    clearAllTileOverrides()
    onTilesChanged()
  }

  const handleSaveAndClose = () => {
    saveTileOverrides()
    onClose()
  }

  return (
    <div className="flex flex-col gap-3" data-testid="map-editor">
      <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-100/70">
        {t('map_editor.title', '\u5730\u56FE\u7F16\u8F91\u5668')}
      </p>

      {/* Brush selection */}
      <div className="flex flex-wrap gap-1.5">
        {BRUSH_OPTIONS.map((opt) => (
          <button
            key={opt.kind}
            type="button"
            onClick={() => setBrush(opt.kind)}
            className={`btn-micro flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition duration-200 ${
              brush === opt.kind ? opt.color : 'border-white/8 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <span>{opt.icon}</span>
            <span>{opt.label}</span>
          </button>
        ))}
      </div>

      {/* Brush size */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-400">
          {t('map_editor.brush_size', '\u7B14\u5237\u5927\u5C0F')}
        </span>
        <div className="flex gap-1">
          {SIZE_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              className={`btn-micro flex h-7 w-7 items-center justify-center rounded-lg border text-[11px] font-medium transition duration-200 ${
                size === s
                  ? 'theme-accent-button-active'
                  : 'border-white/8 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {s}x{s}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleClear}
          className="btn-micro rounded-full border border-rose-400/30 bg-rose-400/10 px-3 py-1 text-[11px] font-medium text-rose-200 transition hover:bg-rose-400/20 active:scale-95"
        >
          {t('map_editor.clear_all', '\u6E05\u9664\u5168\u90E8')}
        </button>
        <button
          type="button"
          onClick={handleSaveAndClose}
          className="btn-micro rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-400/20 active:scale-95"
        >
          {t('map_editor.save_close', '\u4FDD\u5B58\u5E76\u9000\u51FA')}
        </button>
      </div>

      <p className="text-[10px] text-slate-500">
        {t('map_editor.hint', '\u70B9\u51FB\u6216\u62D6\u62FD\u5728\u5730\u56FE\u4E0A\u7ED8\u5236\u5730\u5F62\u3002\u9000\u51FA\u540E\u6062\u590D\u6B63\u5E38\u6A21\u62DF\u3002')}
      </p>
    </div>
  )
}
