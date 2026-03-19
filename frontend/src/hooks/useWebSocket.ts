/**
 * useWebSocket — persistent WebSocket connection with exponential-backoff
 * reconnect (spec §13).
 *
 * Message protocol:
 *   { type: 'snapshot', data: { ... } }  — full state on (re)connect
 *   { type: 'tick',     data: { ... } }  — incremental tick diff
 *
 * Connection is established to /ws (relative path; nginx reverse-proxies
 * to the FastAPI backend).
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { useRelationshipsStore } from '../stores/relationships'
import { useSimulationStore } from '../stores/simulation'

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected'

const MIN_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 10_000

function buildWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

export interface UseWebSocketReturn {
  status: ConnectionStatus
  connected: boolean
  connecting: boolean
  disconnected: boolean
  hasInitialSnapshot: boolean
  startupTimedOut: boolean
  retry: () => void
}

export function useWebSocket(enabled = true): UseWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [hasInitialSnapshot, setHasInitialSnapshot] = useState(false)
  const [startupTimedOut, setStartupTimedOut] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const backoffRef = useRef<number>(MIN_BACKOFF_MS)
  const connectRef = useRef<() => void>(() => {})
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef<boolean>(true)
  const frameRef = useRef<number | null>(null)
  const pendingTicksRef = useRef<Array<Record<string, unknown>>>([])

  const simUpdateFromTick = useSimulationStore((s) => s.updateFromTick)
  const simInitFromSnapshot = useSimulationStore((s) => s.initFromSnapshot)
  const relUpdateFromTick = useRelationshipsStore((s) => s.updateFromTick)
  const relInitFromSnapshot = useRelationshipsStore((s) => s.initFromSnapshot)

  // -------------------------------------------------------------------------
  // Message handler
  // -------------------------------------------------------------------------
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      let msg: { type?: string; data?: unknown }
      try {
        msg = JSON.parse(event.data as string)
      } catch {
        return
      }

      const { type, data } = msg

      const commitTick = (tickData: Record<string, unknown>) => {
        pendingTicksRef.current.push(tickData)

        if (frameRef.current !== null) {
          return
        }

        frameRef.current = window.requestAnimationFrame(() => {
          frameRef.current = null
          const queuedTicks = pendingTicksRef.current.splice(0)

          for (const queuedTick of queuedTicks) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            simUpdateFromTick(queuedTick as any)
            relUpdateFromTick({
              tick: typeof queuedTick.tick === 'number' ? queuedTick.tick : undefined,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              relationships: queuedTick.relationships as any,
            })
          }
        })
      }

      if (type === 'snapshot') {
        // Full state: initialise simulation store from residents list, then
        // apply last_tick on top for up-to-date positions/dialogues.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const snapshot = (data ?? {}) as any
        setHasInitialSnapshot(true)
        setStartupTimedOut(false)
        simInitFromSnapshot(snapshot)
        // Rebuild graph store from backend residents, clearing mock data
        relInitFromSnapshot(snapshot.residents ?? [])
        if (snapshot.last_tick) {
          commitTick(snapshot.last_tick as Record<string, unknown>)
        }
      } else if (type === 'tick') {
        // Incremental diff
        commitTick(data as Record<string, unknown>)
      }
    },
    [simUpdateFromTick, simInitFromSnapshot, relUpdateFromTick, relInitFromSnapshot],
  )

  // -------------------------------------------------------------------------
  // Connect (called initially and after each disconnect)
  // -------------------------------------------------------------------------
  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return

    setStatus('connecting')

    const ws = new WebSocket(buildWsUrl())
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close()
        return
      }
      // Reset backoff on successful connection
      backoffRef.current = MIN_BACKOFF_MS
      setStatus('connected')
      // Ask backend for full snapshot (spec §13: full sync on connect)
      ws.send(JSON.stringify({ type: 'get_snapshot' }))
    }

    ws.onmessage = handleMessage

    ws.onclose = () => {
      if (!mountedRef.current) return
      setStatus('disconnected')
      // Exponential backoff: 1 s → 2 s → 4 s → … → 10 s max
      const delay = backoffRef.current
      backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS)
      timerRef.current = setTimeout(() => {
        connectRef.current()
      }, delay)
    }

    ws.onerror = () => {
      // onclose fires immediately after onerror, so reconnect is handled there
      ws.close()
    }
  }, [enabled, handleMessage])

  const retry = useCallback(() => {
    setStartupTimedOut(false)
    backoffRef.current = MIN_BACKOFF_MS

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
    }

    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }

    connectRef.current()
  }, [])

  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------
  useEffect(() => {
    mountedRef.current = true

    if (!enabled) {
      return () => {
        mountedRef.current = false
      }
    }

    timerRef.current = setTimeout(() => {
      connectRef.current()
    }, 0)

    return () => {
      mountedRef.current = false
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
      pendingTicksRef.current = []
      wsRef.current?.close()
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || hasInitialSnapshot) {
      return undefined
    }

    const timeout = window.setTimeout(() => {
      setStartupTimedOut(true)
    }, 5000)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [enabled, hasInitialSnapshot])

  return {
    status,
    connected: status === 'connected',
    connecting: status === 'connecting',
    disconnected: status === 'disconnected',
    hasInitialSnapshot,
    startupTimedOut,
    retry,
  }
}
