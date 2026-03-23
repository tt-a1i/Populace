import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { setSpeed, startSimulation, stopSimulation } from '../../services/api'
import { useSimulationStore, type SimulationSpeed } from '../../stores'

const speedValues: Array<Exclude<SimulationSpeed, 0>> = [1, 2, 5, 10, 50]

interface SpeedControlProps {
  /** 'compact' renders inline in the HUD bar; default renders the full-size toolbar variant */
  variant?: 'default' | 'compact'
}

export function SpeedControl({ variant = 'default' }: SpeedControlProps) {
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

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-0.5" role="group" aria-label={t('speed.pause')}>
        <button
          type="button"
          onClick={() => void handlePause()}
          disabled={busy}
          aria-pressed={speed === 0}
          aria-label={t('speed.pause')}
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium transition duration-150 active:scale-95 ${
            speed === 0
              ? 'bg-rose-400/20 text-rose-200'
              : 'text-slate-400 hover:bg-white/10 hover:text-white'
          }`}
        >
          {'\u23F8'}
        </button>
        {speedValues.map((val) => (
          <button
            key={val}
            type="button"
            onClick={() => void handleSpeedChange(val)}
            disabled={busy}
            aria-pressed={speed === val}
            aria-label={t(`speed.${val}x`)}
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums transition duration-150 active:scale-95 ${
              speed === val
                ? 'bg-cyan-400/20 text-cyan-100'
                : 'text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            {val}x
          </button>
        ))}
      </div>
    )
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
