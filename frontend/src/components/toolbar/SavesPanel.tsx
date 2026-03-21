import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSound } from '../../audio'
import { type SaveMeta, deleteSave, listSaves, loadSave, saveGame } from '../../services/api'
import { useToast } from '../ui/ToastProvider'

export function SavesPanel() {
  const { t } = useTranslation()
  const { pushToast } = useToast()
  const { play } = useSound()
  const [saves, setSaves] = useState<SaveMeta[]>([])
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const fetchSaves = async () => {
    try {
      setSaves(await listSaves())
    } catch {
      // silently ignore list failures
    }
  }

  useEffect(() => { void fetchSaves() }, [])

  useEffect(() => {
    return () => { clearTimeout(flashTimerRef.current) }
  }, [])

  const flash = (msg: string) => {
    setSuccessMsg(msg)
    clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setSuccessMsg(null), 2500)
  }

  const playConfirmationSound = () => {
    play('dialogue')
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveGame(saveName.trim())
      setSaveName('')
      flash(t('saves.success'))
      pushToast({
        type: 'success',
        title: t('saves.success'),
        description: saveName.trim() || '已保存当前模拟状态。',
      })
      playConfirmationSound()
      await fetchSaves()
    } catch (e) {
      setError(e instanceof Error ? e.message : '存档失败')
      pushToast({
        type: 'error',
        title: '存档失败',
        description: e instanceof Error ? e.message : '请稍后重试。',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleLoad = async (id: string, name: string) => {
    setLoading(id)
    setError(null)
    try {
      await loadSave(id)
      flash(t('saves.load_success', { name }))
      pushToast({
        type: 'info',
        title: t('saves.load_success', { name }),
      })
      playConfirmationSound()
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
      pushToast({
        type: 'error',
        title: '加载失败',
        description: e instanceof Error ? e.message : '请稍后重试。',
      })
    } finally {
      setLoading(null)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    setError(null)
    try {
      await deleteSave(id)
      setSaves((prev) => prev.filter((s) => s.id !== id))
      pushToast({
        type: 'warning',
        title: '存档已删除',
      })
      playConfirmationSound()
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
      pushToast({
        type: 'error',
        title: '删除失败',
        description: e instanceof Error ? e.message : '请稍后重试。',
      })
    } finally {
      setDeleting(null)
    }
  }

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('zh-CN', {
        month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-950/70 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.35)]">
      <p className="text-[11px] uppercase tracking-[0.3em] text-violet-200/70">{t('saves.badge')}</p>
      <h3 className="mt-2 font-display text-2xl text-white">{t('saves.title')}</h3>

      {/* Save current state */}
      <div className="mt-4 flex gap-2">
        <input
          className="flex-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-violet-400/50"
          placeholder={t('saves.name_placeholder')}
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
        />
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-xl bg-violet-500/20 border border-violet-400/30 px-4 py-2 text-sm font-semibold text-violet-300 transition hover:bg-violet-500/30 disabled:opacity-40"
        >
          {saving ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-300 border-t-transparent" />
          ) : '💾'}
          {t('saves.save')}
        </button>
      </div>

      {/* Feedback */}
      {successMsg && (
        <p className="mt-2 text-xs text-emerald-400">{successMsg}</p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}

      {/* Save list */}
      <div className="mt-4 space-y-2">
        {saves.length === 0 ? (
          <p className="text-sm text-slate-500">{t('saves.empty')}</p>
        ) : (
          saves.map((save) => (
            <div
              key={save.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{save.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Tick {save.tick} · {formatDate(save.created_at)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => void handleLoad(save.id, save.name)}
                  disabled={loading === save.id}
                  className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-400/20 disabled:opacity-40"
                >
                  {loading === save.id ? t('saves.loading') : t('saves.load')}
                </button>
                <button
                  onClick={() => void handleDelete(save.id)}
                  disabled={deleting === save.id}
                  className="rounded-lg border border-red-400/20 bg-red-400/8 px-3 py-1 text-xs font-semibold text-red-400 transition hover:bg-red-400/15 disabled:opacity-40"
                >
                  {deleting === save.id ? t('saves.deleting') : t('saves.delete')}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
