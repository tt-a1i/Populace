import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSound } from '../../audio'
import {
  type ApiResident,
  getInterventionLog,
  getResidents,
  intervene,
  type InterventionLogEntry,
  type InterventionLogResponse,
  type InterveneResponse,
} from '../../services/api'
import { useToast } from '../ui/ToastProvider'
import { PanelShell } from '../ui/PanelShell'

const ACTION_META: Record<string, { icon: string; label: string; color: string }> = {
  bless_resident: { icon: '✨', label: '祝福 (+20 幸福感)', color: 'emerald' },
  curse_resident: { icon: '💀', label: '诅咒 (-20 幸福感)', color: 'rose' },
  give_money: { icon: '💰', label: '赐予金币 (+50)', color: 'amber' },
  inspire_resident: { icon: '🌟', label: '激励梦想 (+0.2 进度)', color: 'violet' },
}

const GLOBAL_ACTION_META: Record<string, { icon: string; label: string; color: string; cooldown: number }> = {
  trigger_festival: { icon: '🎉', label: '引发节庆', color: 'cyan', cooldown: 30 },
  trigger_disaster: { icon: '⚠️', label: '召唤灾难', color: 'red', cooldown: 30 },
}

export function InterventionPanel() {
  const { t } = useTranslation()
  const { pushToast } = useToast()
  const { play } = useSound()

  const [residents, setResidents] = useState<ApiResident[]>([])
  const [selectedResidentId, setSelectedResidentId] = useState<string>('')
  const [selectedAction, setSelectedAction] = useState<string>('bless_resident')
  const [interventionLog, setInterventionLog] = useState<InterventionLogEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [globalCooldowns, setGlobalCooldowns] = useState<Record<string, number>>({
    trigger_festival: 0,
    trigger_disaster: 0,
  })

  // Load residents on mount
  useEffect(() => {
    getResidents()
      .then((data) => {
        setResidents(data as ApiResident[])
        if (data.length > 0 && !selectedResidentId) {
          setSelectedResidentId(data[0].id)
        }
      })
      .catch(() => {/* backend may not be running */})
  }, [selectedResidentId])

  // Load intervention log on mount
  useEffect(() => {
    getInterventionLog()
      .then((data) => setInterventionLog((data as InterventionLogResponse).interventions.slice(-5).reverse()))
      .catch(() => {/* backend may not be running */})
  }, [])

  // Countdown global cooldowns
  useEffect(() => {
    const interval = setInterval(() => {
      setGlobalCooldowns((prev) => {
        const updated: Record<string, number> = {}
        let changed = false
        for (const [action, remaining] of Object.entries(prev)) {
          if (remaining > 0) {
            updated[action] = remaining - 1
            changed = true
          }
        }
        return changed ? updated : prev
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const handleResidentAction = async () => {
    if (!selectedResidentId) return
    setBusy(true)
    try {
      const payload = { action: selectedAction, target_id: selectedResidentId }
      if (selectedAction === 'give_money') {
        Object.assign(payload, { value: 50 })
      }
      const result = (await intervene(payload)) as InterveneResponse
      if (result.success) {
        play('event')
        pushToast({
          type: 'success',
          title: t('intervention.toast_success'),
          description: result.effect_description,
        })
        // Refresh log
        const logData = (await getInterventionLog()) as InterventionLogResponse
        setInterventionLog(logData.interventions.slice(-5).reverse())
      }
    } catch (err) {
      pushToast({
        type: 'error',
        title: t('intervention.toast_error'),
        description: String(err),
      })
    } finally {
      setBusy(false)
    }
  }

  const handleGlobalAction = async (action: string) => {
    if (globalCooldowns[action] > 0) return
    setBusy(true)
    try {
      const result = (await intervene({ action })) as InterveneResponse
      if (result.success) {
        play('event')
        pushToast({
          type: 'success',
          title: t('intervention.toast_success'),
          description: result.effect_description,
        })
        // Set cooldown
        setGlobalCooldowns((prev) => ({ ...prev, [action]: GLOBAL_ACTION_META[action].cooldown }))
        // Refresh log
        const logData = (await getInterventionLog()) as InterventionLogResponse
        setInterventionLog(logData.interventions.slice(-5).reverse())
      }
    } catch (err) {
      pushToast({
        type: 'error',
        title: t('intervention.toast_error'),
        description: String(err),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <PanelShell
      icon="⚡"
      title={t('intervention_panel.title')}
      badge={t('intervention_panel.badge')}
    >
      {/* ── Global Event Triggers ── */}
      <div className="mb-4">
        <p className="panel-section-label mb-2">{t('intervention_panel.global_events')}</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(GLOBAL_ACTION_META).map(([action, meta]) => {
            const onCooldown = globalCooldowns[action] > 0
            return (
              <button
                key={action}
                type="button"
                disabled={busy || onCooldown}
                onClick={() => void handleGlobalAction(action)}
                className={[
                  'flex flex-col items-center justify-center gap-1 rounded-xl border p-3 text-center transition duration-200 active:scale-95 disabled:opacity-60',
                  meta.color === 'cyan'
                    ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20'
                    : 'border-red-400/30 bg-red-400/10 text-red-100 hover:bg-red-400/20',
                ].join(' ')}
              >
                <span className="text-2xl">{meta.icon}</span>
                <span className="text-xs font-semibold">{meta.label}</span>
                {onCooldown && (
                  <span className="rounded-full border border-white/15 bg-white/10 px-1.5 py-0.5 text-[9px] font-medium text-white/70">
                    {globalCooldowns[action]}s
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Resident Intervention ── */}
      <div className="mb-4">
        <p className="panel-section-label mb-2">{t('intervention_panel.resident_intervention')}</p>
        <div className="grid gap-2">
          {/* Resident selector */}
          <label className="grid gap-1 text-sm text-slate-300">
            {t('intervention_panel.select_resident')}
            <select
              value={selectedResidentId}
              onChange={(e) => setSelectedResidentId(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400/50 focus:outline-none"
            >
              {residents.map((r) => (
                <option key={r.id} value={r.id} className="bg-slate-800">
                  {r.name} ({r.mood})
                </option>
              ))}
            </select>
          </label>

          {/* Action selector */}
          <label className="grid gap-1 text-sm text-slate-300">
            {t('intervention_panel.select_action')}
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400/50 focus:outline-none"
            >
              {Object.entries(ACTION_META).map(([action, meta]) => (
                <option key={action} value={action} className="bg-slate-800">
                  {meta.icon} {meta.label}
                </option>
              ))}
            </select>
          </label>

          {/* Execute button */}
          <button
            type="button"
            disabled={!selectedResidentId || busy}
            onClick={handleResidentAction}
            className="btn-primary rounded-xl px-4 py-2 text-sm font-medium transition duration-200 active:scale-95"
          >
            {t('intervention_panel.execute')}
          </button>
        </div>
      </div>

      {/* ── Intervention History ── */}
      <div>
        <p className="panel-section-label mb-2">{t('intervention_panel.history')}</p>
        <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-2">
          {interventionLog.length === 0 ? (
            <p className="text-xs text-slate-400">{t('intervention_panel.no_history')}</p>
          ) : (
            <ul className="space-y-1">
              {interventionLog.map((entry) => (
                <li key={entry.id} className="flex items-start gap-2 text-xs">
                  <span className="text-slate-400">[{entry.tick}]</span>
                  <span className="text-slate-200">{entry.effect_description}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PanelShell>
  )
}
