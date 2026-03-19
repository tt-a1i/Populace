/**
 * useGraphSync — subscribes to tick relationship deltas and drives the
 * relationships store update (spec §4.7 useGraphSync).
 */
import { useEffect } from 'react'

import { useRelationshipsStore, type RelationshipTickState } from '../stores/relationships'

export function useGraphSync(tickData: RelationshipTickState | null): void {
  const updateFromTick = useRelationshipsStore((s) => s.updateFromTick)

  useEffect(() => {
    if (!tickData?.relationships?.length) return
    updateFromTick(tickData)
  }, [tickData, updateFromTick])
}
