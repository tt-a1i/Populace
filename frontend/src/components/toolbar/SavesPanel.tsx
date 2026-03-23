import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSound } from '../../audio'
import { type SaveMeta, deleteSave, listSaves, loadSave, saveGame } from '../../services/api'
import { useToast } from '../ui/ToastProvider'
import { EmptyState } from '../ui/EmptyState'
import { PanelShell } from '../ui/PanelShell'

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
        description: saveName.trim() || t('saves.save_desc'),
      })
      playConfirmationSound()
      await fetchSaves()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saves.save_failed'))
      pushToast({
        type: 'error',
        title: t('saves.save_failed'),
        description: e instanceof Error ? e.message : t('saves.retry_hint'),
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
      setError(e instanceof Error ? e.message : t('saves.load_failed'))
      pushToast({
        type: 'error',
        title: t('saves.load_failed'),
        description: e instanceof Error ? e.message : t('saves.retry_hint'),
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
        title: t('saves.delete_success'),
      })
      playConfirmationSound()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saves.delete_failed'))
      pushToast({
        type: 'error',
        title: t('saves.delete_failed'),
        description: e instanceof Error ? e.message : t('saves.retry_hint'),
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
    <PanelShell
      icon="💾"
      title={t('saves.title')}
      badge={t('saves.badge')}
    >
      {/* ── Save current state ── */}
      <div className="flex gap-2">
        <input
          className="panel-input flex-1"
          placeholder={t('saves.name_placeholder')}
          aria-label={t('saves.name_placeholder')}
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          aria-label={t('saves.save')}
          className="btn-primary flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition duration-200 active:scale-95"
        >
          {saving ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : '💾'}
          {t('saves.save')}
        </button>
      </div>

      {/* ── Feedback ── */}
      {successMsg && <p className="text-xs text-emerald-400">{successMsg}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* ── Save list (timeline style) ── */}
      <div>
        <p className="panel-section-label mb-2">{t('saves.badge')}</p>
        <div className="space-y-0">
          {saves.length === 0 ? (
            <EmptyState
              icon="💾"
              message={t('saves.empty')}
              hint={t('saves.name_placeholder')}
            />
          ) : (
            saves.map((save, i) => (
              <div key={save.id} className="relative flex gap-3 pb-3">
                {/* Timeline connector */}
                <div className="flex flex-col items-center">
                  <div className="h-2.5 w-2.5 rounded-full border-2 border-violet-400/50 bg-violet-400/20" />
                  {i < saves.length - 1 && (
                    <div className="w-px flex-1 bg-white/[0.06]" />
                  )}
                </div>
                {/* Card */}
                <div className="flex flex-1 items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{save.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Tick {save.tick} · {formatDate(save.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => void handleLoad(save.id, save.name)}
                      disabled={loading === save.id}
                      aria-label={`${t('saves.load')} ${save.name}`}
                      className="btn-secondary rounded-lg px-3 py-1 text-xs font-semibold transition duration-200 active:scale-95"
                    >
                      {loading === save.id ? t('saves.loading') : t('saves.load')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(save.id)}
                      disabled={deleting === save.id}
                      aria-label={`${t('saves.delete')} ${save.name}`}
                      className="btn-danger rounded-lg px-3 py-1 text-xs font-semibold transition duration-200 active:scale-95"
                    >
                      {deleting === save.id ? t('saves.deleting') : t('saves.delete')}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </PanelShell>
  )
}
