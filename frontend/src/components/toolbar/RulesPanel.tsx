import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  type RuleAction,
  type RuleCondition,
  type SimulationRule,
  createRule,
  deleteRule,
  getRules,
  toggleRule,
} from '../../services/api'
import { useToast } from '../ui/ToastProvider'

const CONDITION_FIELDS = [
  { value: 'mood', label: '\u5FC3\u60C5' },
  { value: 'mood_score', label: '\u5FC3\u60C5\u5206\u6570' },
  { value: 'energy', label: '\u80FD\u91CF' },
  { value: 'coins', label: '\u91D1\u5E01' },
  { value: 'weather', label: '\u5929\u6C14' },
  { value: 'occupation', label: '\u804C\u4E1A' },
]

const OPERATORS = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '\u2260' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '\u2264' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '\u2265' },
  { value: 'contains', label: '\u5305\u542B' },
]

const ACTION_TYPES = [
  { value: 'set_mood', label: '\u8BBE\u7F6E\u5FC3\u60C5', placeholder: 'happy / sad / angry' },
  { value: 'adjust_energy', label: '\u8C03\u6574\u80FD\u91CF', placeholder: '0.1 / -0.2' },
  { value: 'adjust_coins', label: '\u8C03\u6574\u91D1\u5E01', placeholder: '10 / -5' },
  { value: 'move_home', label: '\u56DE\u5BB6', placeholder: '' },
]

function ConditionEditor({ condition, onChange, onRemove }: {
  condition: RuleCondition
  onChange: (c: RuleCondition) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={condition.field}
        onChange={(e) => onChange({ ...condition, field: e.target.value })}
        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white"
      >
        {CONDITION_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      <select
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value })}
        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white"
      >
        {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <input
        type="text"
        value={condition.value}
        onChange={(e) => onChange({ ...condition, value: e.target.value })}
        placeholder="\u503C"
        className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white placeholder:text-slate-500"
      />
      <button type="button" onClick={onRemove} className="text-[11px] text-rose-400 hover:text-rose-300">{'\u2715'}</button>
    </div>
  )
}

function ActionEditor({ action, onChange, onRemove }: {
  action: RuleAction
  onChange: (a: RuleAction) => void
  onRemove: () => void
}) {
  const actionDef = ACTION_TYPES.find((a) => a.value === action.action) ?? ACTION_TYPES[0]
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={action.action}
        onChange={(e) => onChange({ ...action, action: e.target.value })}
        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white"
      >
        {ACTION_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
      </select>
      {actionDef.placeholder && (
        <input
          type="text"
          value={action.value}
          onChange={(e) => onChange({ ...action, value: e.target.value })}
          placeholder={actionDef.placeholder}
          className="w-28 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white placeholder:text-slate-500"
        />
      )}
      <button type="button" onClick={onRemove} className="text-[11px] text-rose-400 hover:text-rose-300">{'\u2715'}</button>
    </div>
  )
}

function RuleCard({ rule, onToggle, onDelete }: {
  rule: SimulationRule
  onToggle: (id: string, enabled: boolean) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 transition duration-200 ${rule.enabled ? 'border-white/10 bg-white/[0.03]' : 'border-white/5 bg-white/[0.01] opacity-50'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggle(rule.id, !rule.enabled)}
            className={`h-4 w-8 rounded-full transition duration-200 ${rule.enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
          >
            <span className={`block h-3 w-3 rounded-full bg-white shadow transition-transform duration-200 ${rule.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
          <span className="text-xs font-medium text-white">{rule.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-slate-500">{'\u{1F525}'} {rule.times_fired}</span>
          <button type="button" onClick={() => onDelete(rule.id)} className="text-[10px] text-rose-400 hover:text-rose-300">{'\u{1F5D1}\uFE0F'}</button>
        </div>
      </div>
      {rule.description && <p className="mt-1 text-[10px] text-slate-400">{rule.description}</p>}
      <div className="mt-2 flex flex-wrap gap-1">
        {rule.conditions.map((c, i) => (
          <span key={i} className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[9px] text-cyan-200">
            {c.field} {OPERATORS.find((o) => o.value === c.operator)?.label ?? c.operator} {c.value}
          </span>
        ))}
        <span className="text-[9px] text-slate-500">{'\u2192'}</span>
        {rule.actions.map((a, i) => (
          <span key={i} className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[9px] text-amber-200">
            {ACTION_TYPES.find((t) => t.value === a.action)?.label ?? a.action}{a.value ? ` ${a.value}` : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

export function RulesPanel() {
  const { t } = useTranslation()
  const { pushToast } = useToast()
  const [rules, setRules] = useState<SimulationRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [conditions, setConditions] = useState<RuleCondition[]>([
    { field: 'mood', operator: 'eq', value: 'sad' },
  ])
  const [actions, setActions] = useState<RuleAction[]>([
    { action: 'set_mood', value: 'happy' },
  ])

  const fetchRules = useCallback(async () => {
    try {
      const data = await getRules()
      setRules(data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void fetchRules() }, [fetchRules])

  const handleCreate = async () => {
    if (!name.trim()) return
    try {
      const rule = await createRule({ name, description, conditions, actions })
      setRules((prev) => [...prev, rule])
      setShowForm(false)
      setName('')
      setDescription('')
      setConditions([{ field: 'mood', operator: 'eq', value: 'sad' }])
      setActions([{ action: 'set_mood', value: 'happy' }])
      pushToast({ type: 'success', title: t('rules.created', '\u89C4\u5219\u5DF2\u521B\u5EFA') })
    } catch {
      pushToast({ type: 'error', title: t('rules.create_failed', '\u521B\u5EFA\u5931\u8D25') })
    }
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      const updated = await toggleRule(id, enabled)
      setRules((prev) => prev.map((r) => r.id === id ? updated : r))
    } catch { /* ignore */ }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteRule(id)
      setRules((prev) => prev.filter((r) => r.id !== id))
    } catch { /* ignore */ }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="rules-panel">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-100/70">
          {t('rules.title', '\u6A21\u62DF\u89C4\u5219')}
        </p>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="btn-micro rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-medium text-cyan-200 transition hover:bg-cyan-400/20 active:scale-95"
        >
          {showForm ? t('rules.cancel', '\u53D6\u6D88') : t('rules.add', '+ \u65B0\u89C4\u5219')}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('rules.name_placeholder', '\u89C4\u5219\u540D\u79F0')}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-white/20 focus:outline-none"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('rules.desc_placeholder', '\u63CF\u8FF0\uFF08\u53EF\u9009\uFF09')}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-white/20 focus:outline-none"
          />

          <div>
            <p className="mb-1.5 text-[10px] text-slate-400">{t('rules.conditions_label', '\u6761\u4EF6 (AND)')}</p>
            <div className="space-y-1.5">
              {conditions.map((c, i) => (
                <ConditionEditor
                  key={i}
                  condition={c}
                  onChange={(updated) => setConditions((prev) => prev.map((p, j) => j === i ? updated : p))}
                  onRemove={() => setConditions((prev) => prev.filter((_, j) => j !== i))}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setConditions((prev) => [...prev, { field: 'energy', operator: 'lt', value: '0.3' }])}
              className="mt-1 text-[10px] text-cyan-400 hover:text-cyan-300"
            >
              + {t('rules.add_condition', '\u6DFB\u52A0\u6761\u4EF6')}
            </button>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] text-slate-400">{t('rules.actions_label', '\u52A8\u4F5C')}</p>
            <div className="space-y-1.5">
              {actions.map((a, i) => (
                <ActionEditor
                  key={i}
                  action={a}
                  onChange={(updated) => setActions((prev) => prev.map((p, j) => j === i ? updated : p))}
                  onRemove={() => setActions((prev) => prev.filter((_, j) => j !== i))}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setActions((prev) => [...prev, { action: 'adjust_energy', value: '0.1' }])}
              className="mt-1 text-[10px] text-amber-400 hover:text-amber-300"
            >
              + {t('rules.add_action', '\u6DFB\u52A0\u52A8\u4F5C')}
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!name.trim() || conditions.length === 0 || actions.length === 0}
            className="btn-micro w-full rounded-lg border border-emerald-400/30 bg-emerald-400/10 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-400/20 active:scale-95 disabled:opacity-40"
          >
            {t('rules.create_button', '\u521B\u5EFA\u89C4\u5219')}
          </button>
        </div>
      )}

      {/* Rule list */}
      {loading ? (
        <p className="text-xs text-slate-500">{t('rules.loading', '\u52A0\u8F7D\u4E2D\u2026')}</p>
      ) : rules.length === 0 ? (
        <p className="text-xs text-slate-500">{t('rules.empty', '\u6682\u65E0\u81EA\u5B9A\u4E49\u89C4\u5219')}</p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <RuleCard key={rule.id} rule={rule} onToggle={handleToggle} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
