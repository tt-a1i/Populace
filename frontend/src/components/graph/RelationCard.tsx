import { useTranslation } from 'react-i18next'

import type { GraphRelationship, GraphResident } from '../../stores/relationships'

interface RelationCardProps {
  position: { x: number; y: number } | null
  relationship: GraphRelationship | null
  residents: GraphResident[]
}

function getResidentName(residents: GraphResident[], residentId: string): string {
  return residents.find((resident) => resident.id === residentId)?.name ?? residentId
}

const RELATIONSHIP_LABEL_KEYS: Record<string, string> = {
  love: 'graph.rel_love',
  friendship: 'graph.rel_friendship',
  rivalry: 'graph.rel_rivalry',
  trust: 'graph.rel_trust',
  fear: 'graph.rel_fear',
  dislike: 'graph.rel_dislike',
}

export function RelationCard({ position, relationship, residents }: RelationCardProps) {
  const { t } = useTranslation()

  if (!position || !relationship) {
    return null
  }

  const labelKey = RELATIONSHIP_LABEL_KEYS[relationship.type] ?? 'graph.rel_default'

  return (
    <div
      className="pointer-events-none absolute z-10 w-64 rounded-xl border border-amber-100/20 bg-slate-950/92 p-4 shadow-lg backdrop-blur"
      style={{ left: position.x, top: position.y, transform: 'translate(-50%, calc(-100% - 16px))' }}
    >
      <p className="text-[10px] uppercase tracking-[0.32em] text-amber-100/70">{t('graph.relation_detail_badge')}</p>
      <h3 className="mt-2 font-display text-xl text-white">
        {getResidentName(residents, relationship.from_id)} x {getResidentName(residents, relationship.to_id)}
      </h3>
      <div className="mt-3 grid gap-2 text-sm text-slate-300">
        <p>
          {t('graph.type_label')} <span className="text-amber-50">{t(labelKey)}</span>
        </p>
        <p>
          {t('graph.intensity_label')} <span className="text-amber-50">{Math.round(relationship.intensity * 100)}%</span>
        </p>
        <p className="leading-6 text-slate-400">{relationship.reason}</p>
      </div>
    </div>
  )
}
