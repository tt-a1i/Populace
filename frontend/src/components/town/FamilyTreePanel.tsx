import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type FamilyMember, type ResidentFamily, getResidentFamily } from '../../services/api'
import { useSimulationStore } from '../../stores/simulation'

interface FamilyTreePanelProps {
  residentId: string
  onSelectMember?: (residentId: string) => void
}

function FamilyNode({ member, onSelectMember }: { member: FamilyMember; onSelectMember: (residentId: string) => void }) {
  const { t } = useTranslation()

  const relationLabel: Record<string, string> = {
    self: t('family.self'),
    parent: t('family.parent'),
    child: t('family.child'),
    spouse: t('family.spouse'),
    sibling: t('family.sibling', '兄弟姐妹'),
  }

  return (
    <button
      type="button"
      onClick={() => onSelectMember(member.id)}
      aria-label={member.name}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
        member.deceased
          ? 'border-white/6 bg-white/[0.02] opacity-50'
          : member.relation === 'self'
          ? 'border-cyan-400/25 bg-cyan-400/[0.06]'
          : 'border-white/8 bg-white/[0.03] hover:border-white/12'
      }`}
    >
      <span className="text-lg">
        {member.deceased ? '🪦' : member.relation === 'spouse' ? '💕' : member.relation === 'child' ? '👶' : member.relation === 'sibling' ? '🫶' : '👤'}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${member.deceased ? 'text-slate-500 line-through' : 'text-white'}`}>
          {member.name}
        </p>
        <p className="text-[10px] text-slate-500">
          {relationLabel[member.relation] ?? member.relation}
          {member.age_days > 0 && ` · ${member.age_days}d`}
        </p>
      </div>
    </button>
  )
}

export function FamilyTreePanel({ residentId, onSelectMember }: FamilyTreePanelProps) {
  const { t } = useTranslation()
  const selectResident = useSimulationStore((state) => state.selectResident)
  const [family, setFamily] = useState<ResidentFamily | null>(null)
  const [loading, setLoading] = useState(true)

  const handleSelectMember = (memberId: string) => {
    ;(onSelectMember ?? selectResident)(memberId)
  }

  useEffect(() => {
    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      setLoading(true)
      getResidentFamily(residentId)
        .then((data) => { if (!cancelled) setFamily(data) })
        .catch(() => { if (!cancelled) setFamily(null) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [residentId])

  if (loading) {
    return <p className="py-4 text-center text-xs text-slate-500">{t('family.loading')}</p>
  }

  if (!family) {
    return <p className="py-4 text-center text-xs text-slate-500">{t('family.empty')}</p>
  }

  const tree = family.tree
  const hasFamily = tree.parents.length > 0 || tree.siblings.length > 0 || tree.spouse || tree.children.length > 0

  if (!hasFamily) {
    return <p className="py-4 text-center text-xs text-slate-500">{t('family.empty')}</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/70">{family.family_name}</p>
      {/* Parents */}
      {tree.parents.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-[0.24em] text-slate-500">{t('family.parents')}</p>
          <div className="space-y-1.5">
            {tree.parents.map((p) => <FamilyNode key={p.id} member={p} onSelectMember={handleSelectMember} />)}
          </div>
          {/* Connector line */}
          <div className="flex justify-center py-1">
            <div className="h-4 w-px bg-white/10" />
          </div>
        </div>
      )}

      {/* Self + Spouse row */}
        <div>
          <div className={`flex items-stretch gap-2 ${tree.spouse ? '' : 'justify-center'}`}>
            <div className="flex-1">
            <FamilyNode member={tree.root} onSelectMember={handleSelectMember} />
            </div>
            {tree.spouse && (
            <>
              <div className="flex items-center">
                <span className="text-xs text-pink-400/60">━━</span>
              </div>
              <div className="flex-1">
                <FamilyNode member={tree.spouse} onSelectMember={handleSelectMember} />
              </div>
            </>
          )}
        </div>
      </div>

      {tree.siblings.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-[0.24em] text-slate-500">{t('family.siblings', '兄弟姐妹')}</p>
          <div className="space-y-1.5">
            {tree.siblings.map((sibling) => <FamilyNode key={sibling.id} member={sibling} onSelectMember={handleSelectMember} />)}
          </div>
        </div>
      )}

      {/* Children */}
      {tree.children.length > 0 && (
        <div>
          <div className="flex justify-center py-1">
            <div className="h-4 w-px bg-white/10" />
          </div>
          <p className="mb-1.5 text-[10px] uppercase tracking-[0.24em] text-slate-500">{t('family.children')}</p>
          <div className="space-y-1.5">
            {tree.children.map((c) => <FamilyNode key={c.id} member={c} onSelectMember={handleSelectMember} />)}
          </div>
        </div>
      )}
    </div>
  )
}
