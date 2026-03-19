import type { GraphRelationship, GraphResident } from '../../stores/relationships'

interface RelationCardProps {
  position: { x: number; y: number } | null
  relationship: GraphRelationship | null
  residents: GraphResident[]
}

function getResidentName(residents: GraphResident[], residentId: string): string {
  return residents.find((resident) => resident.id === residentId)?.name ?? residentId
}

function getRelationshipLabel(type: GraphRelationship['type']): string {
  switch (type) {
    case 'love':
      return '恋爱'
    case 'friendship':
      return '友谊'
    case 'rivalry':
      return '敌对'
    default:
      return '认识'
  }
}

export function RelationCard({ position, relationship, residents }: RelationCardProps) {
  if (!position || !relationship) {
    return null
  }

  return (
    <div
      className="pointer-events-none absolute z-10 w-64 rounded-[20px] border border-amber-100/20 bg-slate-950/92 p-4 shadow-[0_22px_60px_rgba(15,23,42,0.65)] backdrop-blur"
      style={{ left: position.x, top: position.y, transform: 'translate(-50%, calc(-100% - 16px))' }}
    >
      <p className="text-[10px] uppercase tracking-[0.32em] text-amber-100/70">Relation Detail</p>
      <h3 className="mt-2 font-display text-xl text-white">
        {getResidentName(residents, relationship.from_id)} x {getResidentName(residents, relationship.to_id)}
      </h3>
      <div className="mt-3 grid gap-2 text-sm text-slate-300">
        <p>
          类型 <span className="text-amber-50">{getRelationshipLabel(relationship.type)}</span>
        </p>
        <p>
          强度 <span className="text-amber-50">{Math.round(relationship.intensity * 100)}%</span>
        </p>
        <p className="leading-6 text-slate-400">{relationship.reason}</p>
      </div>
    </div>
  )
}
