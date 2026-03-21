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
    <div className="flex items-center gap-1" role="group" aria-label={t('speed.pause')}>
      <button
        type="button"
        onClick={() => void handlePause()}
        disabled={busy}
        aria-pressed={speed === 0}
        aria-label={t('speed.pause')}
        className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition duration-200 active:scale-95 ${
          speed === 0
            ? 'border-rose-300/40 bg-rose-400/15 text-rose-200'
            : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
        }`}
      >
        <span aria-hidden="true">{'\u23F8'}</span>
      </button>

      {speedValues.map((val) => (
        <button
          key={val}
          type="button"
          onClick={() => void handleSpeedChange(val)}
          disabled={busy}
          aria-pressed={speed === val}
          aria-label={t(`speed.${val}x`)}
          className={`rounded-lg border px-2 py-1.5 text-xs font-medium tabular-nums transition duration-200 active:scale-95 ${
            speed === val
              ? 'border-cyan-300/40 bg-cyan-300/15 text-cyan-50'
              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          {val}x
        </button>
      ))}
    </div>
  )
}
