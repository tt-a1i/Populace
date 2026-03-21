/**
 * Global keyboard shortcuts for the simulation view.
 *
 *   Space    — pause / resume simulation
 *   1-5      — set speed to 1×, 2×, 5×, 10×, 50×
 *   Escape   — deselect resident (close sidebar panel)
 */
import { useCallback, useEffect } from 'react'

import { setSpeed as apiSetSpeed, startSimulation, stopSimulation } from '../services/api'
import { useSimulationStore, type SimulationSpeed } from '../stores'

const SPEED_MAP: Record<string, Exclude<SimulationSpeed, 0>> = {
  '1': 1,
  '2': 2,
  '3': 5,
  '4': 10,
  '5': 50,
}

export function useKeyboardShortcuts(enabled: boolean): void {
  const speed = useSimulationStore((s) => s.speed)
  const setRunning = useSimulationStore((s) => s.setRunning)
  const setStoreSpeed = useSimulationStore((s) => s.setSpeed)
  const selectResident = useSimulationStore((s) => s.selectResident)

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      // Space → toggle pause/resume
      if (e.code === 'Space' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        if (speed === 0) {
          void startSimulation()
            .then(() => apiSetSpeed({ speed: 1 }))
            .then(() => {
              setRunning(true)
              setStoreSpeed(1)
            })
        } else {
          void stopSimulation().then(() => {
            setRunning(false)
            setStoreSpeed(0)
          })
        }
        return
      }

      // 1-5 → set speed
      if (e.key in SPEED_MAP && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const nextSpeed = SPEED_MAP[e.key]
        void startSimulation()
          .then(() => apiSetSpeed({ speed: nextSpeed }))
          .then(() => {
            setRunning(true)
            setStoreSpeed(nextSpeed)
          })
        return
      }

      // Escape → close resident panel
      if (e.code === 'Escape') {
        selectResident(null)
      }
    },
    [speed, setRunning, setStoreSpeed, selectResident],
  )

  useEffect(() => {
    if (!enabled) return undefined
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [enabled, handleKey])
}
