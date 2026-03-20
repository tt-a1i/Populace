import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { playSoundCue, type SoundCue } from './synth'

interface SoundContextValue {
  enabled: boolean
  toggleEnabled: () => void
  play: (cue: SoundCue) => void
}

interface AudioEngine {
  context: AudioContext
  master: GainNode
}

const STORAGE_KEY = 'populace:sound-enabled'

const SoundContext = createContext<SoundContextValue>({
  enabled: false,
  toggleEnabled: () => {},
  play: () => {},
})

function createAudioEngine(): AudioEngine | null {
  const ContextCtor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

  if (!ContextCtor) {
    return null
  }

  const context = new ContextCtor()
  const master = context.createGain()
  master.gain.setValueAtTime(0.24, context.currentTime)
  master.connect(context.destination)

  return { context, master }
}

function readStoredEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const storage = window.localStorage as Partial<Storage> | undefined
  if (!storage || typeof storage.getItem !== 'function') {
    return false
  }

  return storage.getItem(STORAGE_KEY) === 'true'
}

function writeStoredEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return
  }

  const storage = window.localStorage as Partial<Storage> | undefined
  if (!storage || typeof storage.setItem !== 'function') {
    return
  }

  storage.setItem(STORAGE_KEY, String(enabled))
}

export function SoundProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(() => readStoredEnabled())
  const engineRef = useRef<AudioEngine | null>(null)

  useEffect(() => {
    writeStoredEnabled(enabled)
  }, [enabled])

  useEffect(() => {
    return () => {
      void engineRef.current?.context.close()
      engineRef.current = null
    }
  }, [])

  const ensureEngine = useCallback(async (): Promise<AudioEngine | null> => {
    if (!engineRef.current) {
      engineRef.current = createAudioEngine()
    }

    if (!engineRef.current) {
      return null
    }

    if (engineRef.current.context.state === 'suspended') {
      try {
        await engineRef.current.context.resume()
      } catch {
        return null
      }
    }

    return engineRef.current
  }, [])

  const toggleEnabled = useCallback(() => {
    setEnabled((current) => {
      const next = !current
      if (next) {
        void ensureEngine()
      }
      return next
    })
  }, [ensureEngine])

  const play = useCallback(
    (cue: SoundCue) => {
      if (!enabled) {
        return
      }

      void ensureEngine().then((engine) => {
        if (!engine) {
          return
        }

        playSoundCue(engine, cue)
      })
    },
    [enabled, ensureEngine],
  )

  const value = useMemo(
    () => ({
      enabled,
      toggleEnabled,
      play,
    }),
    [enabled, play, toggleEnabled],
  )

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSound(): SoundContextValue {
  return useContext(SoundContext)
}
