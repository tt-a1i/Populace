import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type FamilyMember, type FamilyTree, getResidentFamilyTree } from '../../services/api'

interface FamilyTreePanelProps {
  residentId: string
}

function FamilyNode({ member }: { member: FamilyMember }) {
  const { t } = useTranslation()

  const relationLabel: Record<string, string> = {
    self: t('family.self'),
    parent: t('family.parent'),
    child: t('family.child'),
    spouse: t('family.spouse'),
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
        member.deceased
          ? 'border-white/6 bg-white/[0.02] opacity-50'
          : member.relation === 'self'
          ? 'border-cyan-400/25 bg-cyan-400/[0.06]'
          : 'border-white/8 bg-white/[0.03] hover:border-white/12'
      }`}
    >
      <span className="text-lg">
        {member.deceased ? '🪦' : member.relation === 'spouse' ? '💕' : member.relation === 'child' ? '👶' : '👤'}
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
    </div>
  )
}

export function FamilyTreePanel({ residentId }: FamilyTreePanelProps) {
  const { t } = useTranslation()
  const [tree, setTree] = useState<FamilyTree | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getResidentFamilyTree(residentId)
      .then((data) => { if (!cancelled) setTree(data) })
      .catch(() => { if (!cancelled) setTree(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [residentId])

  if (loading) {
    return <p className="py-4 text-center text-xs text-slate-500">{t('family.loading')}</p>
  }

  if (!tree) {
    return <p className="py-4 text-center text-xs text-slate-500">{t('family.empty')}</p>
  }

  const hasFamily = tree.parents.length > 0 || tree.spouse || tree.children.length > 0

  if (!hasFamily) {
    return <p className="py-4 text-center text-xs text-slate-500">{t('family.empty')}</p>
  }

  return (
    <div className="space-y-4">
      {/* Parents */}
      {tree.parents.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-[0.24em] text-slate-500">{t('family.parents')}</p>
          <div className="space-y-1.5">
            {tree.parents.map((p) => <FamilyNode key={p.id} member={p} />)}
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
            <FamilyNode member={tree.root} />
          </div>
          {tree.spouse && (
            <>
              <div className="flex items-center">
                <span className="text-xs text-pink-400/60">━━</span>
              </div>
              <div className="flex-1">
                <FamilyNode member={tree.spouse} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Children */}
      {tree.children.length > 0 && (
        <div>
          <div className="flex justify-center py-1">
            <div className="h-4 w-px bg-white/10" />
          </div>
          <p className="mb-1.5 text-[10px] uppercase tracking-[0.24em] text-slate-500">{t('family.children')}</p>
          <div className="space-y-1.5">
            {tree.children.map((c) => <FamilyNode key={c.id} member={c} />)}
          </div>
        </div>
      )}
    </div>
  )
}
