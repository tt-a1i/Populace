import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  type ActiveQuest,
  type QuestInfo,
  abandonQuest,
  getActiveQuests,
  listQuests,
  startQuest,
} from '../../services/api'
import { useSimulationStore } from '../../stores/simulation'

/**
 * QuestPanel — provides explicit goals with progress tracking and celebrations.
 *
 * Polls /api/quests/active every 3 s for progress updates.
 * Quest cards show icon, name, description, progress bar, remaining time.
 */
export function QuestPanel() {
  const { t } = useTranslation()
  const residents = useSimulationStore((s) => s.residents)

  const [quests, setQuests] = useState<QuestInfo[]>([])
  const [activeQuests, setActiveQuests] = useState<ActiveQuest[]>([])
  const [loading, setLoading] = useState(true)
  const [startingQuest, setStartingQuest] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'fail'; text: string } | null>(null)

  // Resident selection state for quests that require params
  const [selectingQuest, setSelectingQuest] = useState<string | null>(null)
  const [selectedResidentA, setSelectedResidentA] = useState('')
  const [selectedResidentB, setSelectedResidentB] = useState('')
  const [keyword, setKeyword] = useState('')

  // Track previously completed/failed for celebration detection
  const prevActiveIdsRef = useRef<Set<string>>(new Set())

  const requestSequenceRef = useRef(0)

  const loadQuests = useCallback(async () => {
    const seq = ++requestSequenceRef.current
    try {
      const [questList, active] = await Promise.all([
        listQuests(),
        getActiveQuests().catch(() => [] as ActiveQuest[]),
      ])
      if (requestSequenceRef.current !== seq) return
      setQuests(questList)
      setActiveQuests(active)
      setLoading(false)

      // Detect completed/failed transitions for toasts
      const currentActiveIds = new Set(active.map((q) => q.quest_id))
      const prevIds = prevActiveIdsRef.current

      for (const q of questList) {
        if (q.status === 'completed' && prevIds.has(q.id) && !currentActiveIds.has(q.id)) {
          setToast({ type: 'success', text: t('quest.completed') })
          setTimeout(() => setToast(null), 3000)
        }
      }
      // Check if any quest that was active is no longer active and not completed -> failed
      for (const prevId of prevIds) {
        if (!currentActiveIds.has(prevId)) {
          const qInfo = questList.find((q) => q.id === prevId)
          if (qInfo && qInfo.status !== 'completed' && qInfo.status !== 'active') {
            setToast({ type: 'fail', text: t('quest.failed') })
            setTimeout(() => setToast(null), 3000)
          }
        }
      }

      prevActiveIdsRef.current = currentActiveIds
    } catch {
      if (requestSequenceRef.current === seq) {
        setLoading(false)
      }
    }
  }, [t])

  useEffect(() => {
    void loadQuests()
    const intervalId = window.setInterval(() => {
      void loadQuests()
    }, 3000)
    return () => {
      requestSequenceRef.current += 1
      window.clearInterval(intervalId)
    }
  }, [loadQuests])

  const handleStartQuest = useCallback(
    async (questId: string, params?: Record<string, string>) => {
      setStartingQuest(questId)
      try {
        await startQuest(questId, params)
        setSelectingQuest(null)
        setSelectedResidentA('')
        setSelectedResidentB('')
        setKeyword('')
        await loadQuests()
      } catch {
        // ignore
      } finally {
        setStartingQuest(null)
      }
    },
    [loadQuests],
  )

  const handleAbandon = useCallback(
    async (questId: string) => {
      try {
        await abandonQuest(questId)
        await loadQuests()
      } catch {
        // ignore
      }
    },
    [loadQuests],
  )

  const handleQuestClick = useCallback(
    (quest: QuestInfo) => {
      if (quest.status !== 'available') return

      if (!quest.requires_params) {
        void handleStartQuest(quest.id)
        return
      }

      // Toggle selection UI
      if (selectingQuest === quest.id) {
        setSelectingQuest(null)
      } else {
        setSelectingQuest(quest.id)
        setSelectedResidentA('')
        setSelectedResidentB('')
        setKeyword('')
      }
    },
    [selectingQuest, handleStartQuest],
  )

  const handleParamSubmit = useCallback(
    (questId: string) => {
      if (questId === 'matchmaker') {
        if (!selectedResidentA || !selectedResidentB) return
        void handleStartQuest(questId, {
          resident_a: selectedResidentA,
          resident_b: selectedResidentB,
        })
      } else if (questId === 'gossip_master') {
        if (!keyword.trim()) return
        void handleStartQuest(questId, { keyword: keyword.trim() })
      } else if (questId === 'social_butterfly') {
        if (!selectedResidentA) return
        void handleStartQuest(questId, { resident_id: selectedResidentA })
      }
    },
    [selectedResidentA, selectedResidentB, keyword, handleStartQuest],
  )

  const availableQuests = quests.filter((q) => q.status === 'available')

  return (
    <div className="grid gap-4 rounded-[24px] border border-white/10 bg-slate-950/70 p-5 text-slate-100 shadow-[0_18px_44px_rgba(15,23,42,0.35)]">
      {/* Header */}
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-200/70">
          {t('quest.badge')}
        </p>
        <h3 className="mt-2 font-display text-2xl text-white">{t('quest.title')}</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
          {t('quest.subtitle')}
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            toast.type === 'success'
              ? 'border-emerald-300/30 bg-emerald-300/12 text-emerald-50'
              : 'border-red-400/30 bg-red-400/12 text-red-200'
          }`}
        >
          {toast.text}
        </div>
      )}

      {loading ? (
        <div className="rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-slate-300">
          {t('stats.loading')}
        </div>
      ) : (
        <>
          {/* Active quests */}
          {activeQuests.length > 0 && (
            <div className="grid gap-3">
              <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-100/70">
                {t('quest.active')}
              </p>
              {activeQuests.map((q) => (
                <ActiveQuestCard
                  key={q.quest_id}
                  quest={q}
                  onAbandon={handleAbandon}
                />
              ))}
            </div>
          )}

          {activeQuests.length === 0 && (
            <p className="text-sm text-slate-500">{t('quest.no_active')}</p>
          )}

          {/* Available quests */}
          {availableQuests.length > 0 && (
            <div className="grid gap-3">
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                {t('quest.available')}
              </p>
              <div className="flex flex-wrap gap-2">
                {availableQuests.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => handleQuestClick(q)}
                    disabled={startingQuest === q.id}
                    className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                      selectingQuest === q.id
                        ? 'border-emerald-300/40 bg-emerald-300/15 text-emerald-50'
                        : 'border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]'
                    } disabled:opacity-50`}
                  >
                    <span className="mr-2">{q.icon}</span>
                    {q.name}
                  </button>
                ))}
              </div>

              {/* Param selection UI */}
              {selectingQuest && (
                <ParamSelector
                  questId={selectingQuest}
                  residents={residents}
                  selectedA={selectedResidentA}
                  selectedB={selectedResidentB}
                  keyword={keyword}
                  onSelectA={setSelectedResidentA}
                  onSelectB={setSelectedResidentB}
                  onKeywordChange={setKeyword}
                  onSubmit={handleParamSubmit}
                  submitting={startingQuest === selectingQuest}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// -- Active quest card with progress bar --

interface ActiveQuestCardProps {
  quest: ActiveQuest
  onAbandon: (questId: string) => void
}

function ActiveQuestCard({ quest, onAbandon }: ActiveQuestCardProps) {
  const { t } = useTranslation()
  const pct = Math.round(quest.progress * 100)

  return (
    <article className="rounded-[20px] border border-emerald-300/16 bg-emerald-300/8 px-4 py-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-white">
            <span className="mr-2">{quest.icon}</span>
            {quest.name}
          </p>
          <p className="mt-1 text-xs text-emerald-100/75">{quest.description}</p>
        </div>
        <button
          type="button"
          onClick={() => onAbandon(quest.quest_id)}
          className="rounded-lg border border-red-400/20 bg-red-400/8 px-2 py-1 text-xs text-red-200 transition hover:bg-red-400/15"
        >
          {t('quest.abandon')}
        </button>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-slate-400">
          <span>{quest.progress_text}</span>
          <span>
            {quest.remaining_ticks >= 0
              ? t('quest.remaining', { ticks: quest.remaining_ticks })
              : t('quest.no_limit')}
          </span>
        </div>
      </div>
    </article>
  )
}

// -- Param selection UI for quests that require params --

interface ResidentOption {
  id: string
  name: string
}

interface ParamSelectorProps {
  questId: string
  residents: ResidentOption[]
  selectedA: string
  selectedB: string
  keyword: string
  onSelectA: (id: string) => void
  onSelectB: (id: string) => void
  onKeywordChange: (kw: string) => void
  onSubmit: (questId: string) => void
  submitting: boolean
}

function ParamSelector({
  questId,
  residents,
  selectedA,
  selectedB,
  keyword,
  onSelectA,
  onSelectB,
  onKeywordChange,
  onSubmit,
  submitting,
}: ParamSelectorProps) {
  const { t } = useTranslation()

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="mb-3 text-xs text-slate-400">{t('quest.select_residents')}</p>

      {(questId === 'matchmaker' || questId === 'social_butterfly') && (
        <div className="grid gap-2">
          <select
            value={selectedA}
            onChange={(e) => onSelectA(e.target.value)}
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200"
          >
            <option value="">{questId === 'matchmaker' ? 'Resident A' : 'Resident'}</option>
            {residents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          {questId === 'matchmaker' && (
            <select
              value={selectedB}
              onChange={(e) => onSelectB(e.target.value)}
              className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200"
            >
              <option value="">Resident B</option>
              {residents
                .filter((r) => r.id !== selectedA)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          )}
        </div>
      )}

      {questId === 'gossip_master' && (
        <input
          type="text"
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          placeholder="Keyword / 关键词"
          className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200"
        />
      )}

      <button
        type="button"
        onClick={() => onSubmit(questId)}
        disabled={submitting}
        className="mt-3 rounded-xl border border-emerald-300/30 bg-emerald-300/12 px-4 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-300/20 disabled:opacity-50"
      >
        {submitting ? '...' : t('quest.start')}
      </button>
    </div>
  )
}
