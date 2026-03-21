import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { setSpeed, startSimulation, stopSimulation } from '../../services/api'
import { useSimulationStore, type SimulationSpeed } from '../../stores'

const speedValues: Array<Exclude<SimulationSpeed, 0>> = [1, 2, 5, 10, 50]

export function SpeedControl() {
  const { t } = useTranslation()
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void handlePause()}
        disabled={busy}
        className={`rounded-full border px-4 py-2 text-sm transition ${
          speed === 0
            ? 'border-rose-300/50 bg-rose-400/15 text-rose-100'
            : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
        }`}
      >
        {t('speed.pause')}
      </button>

      {speedValues.map((val) => (
        <button
          key={val}
          type="button"
          onClick={() => void handleSpeedChange(val)}
          disabled={busy}
          className={`rounded-full border px-4 py-2 text-sm transition ${
            speed === val
              ? 'border-cyan-300/40 bg-cyan-300/15 text-cyan-50'
              : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
          }`}
        >
          {t(`speed.${val}x` as 'speed.1x' | 'speed.2x' | 'speed.5x' | 'speed.10x' | 'speed.50x')}
        </button>
      ))}
    </div>
  )
}
