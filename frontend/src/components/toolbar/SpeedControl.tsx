import { useState } from 'react'

import { setSpeed, startSimulation, stopSimulation } from '../../services/api'
import { useSimulationStore, type SimulationSpeed } from '../../stores'

const speedValues: Array<Exclude<SimulationSpeed, 0>> = [1, 2, 5, 10, 50]

export function SpeedControl() {
  const speed = useSimulationStore((state) => state.speed)
  const setStoreSpeed = useSimulationStore((state) => state.setSpeed)
  const setRunning = useSimulationStore((state) => state.setRunning)
  const [busy, setBusy] = useState(false)

  const handlePause = async () => {
    setBusy(true)
    try {
      await stopSimulation()
      setRunning(false)
      setStoreSpeed(0)
    } finally {
      setBusy(false)
    }
  }

  const handleSpeedChange = async (nextSpeed: Exclude<SimulationSpeed, 0>) => {
    setBusy(true)
    try {
      await startSimulation()
      await setSpeed({ speed: nextSpeed })
      setRunning(true)
      setStoreSpeed(nextSpeed)
    } finally {
      setBusy(false)
    }
  }

  // On mobile, show only pause + 1x/5x. On desktop, show all.
  const mobileValues: Array<Exclude<SimulationSpeed, 0>> = [1, 5]

  return (
    <div className="flex items-center gap-0.5 sm:gap-1">
      <button
        type="button"
        onClick={() => void handlePause()}
        disabled={busy}
        className={`min-h-[36px] rounded-lg border px-1.5 py-1.5 text-xs font-medium transition active:scale-95 sm:px-2 ${
          speed === 0
            ? 'border-rose-300/40 bg-rose-400/15 text-rose-200'
            : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
        }`}
      >
        {speed === 0 ? '▶' : '⏸'}
      </button>

      {speedValues.map((val) => (
        <button
          key={val}
          type="button"
          onClick={() => void handleSpeedChange(val)}
          disabled={busy}
          className={`min-h-[36px] rounded-lg border px-1.5 py-1.5 text-[11px] font-medium tabular-nums transition active:scale-95 sm:px-2 ${
            speed === val
              ? 'border-cyan-300/40 bg-cyan-300/15 text-cyan-50'
              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
          } ${!mobileValues.includes(val) ? 'hidden sm:block' : ''}`}
        >
          {val}x
        </button>
      ))}
    </div>
  )
}
