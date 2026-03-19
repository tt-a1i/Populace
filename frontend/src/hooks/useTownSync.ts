/**
 * useTownSync — subscribes to tick movement/dialogue data and drives the
 * simulation store update (spec §4.7 useTownSync).
 */
import { useEffect } from 'react'

import { useSimulationStore, type SimulationTickState } from '../stores/simulation'

export function useTownSync(tickData: SimulationTickState | null): void {
  const updateFromTick = useSimulationStore((s) => s.updateFromTick)

  useEffect(() => {
    if (!tickData) return
    updateFromTick(tickData)
  }, [tickData, updateFromTick])
}
