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

import { useSound } from '../audio'
import { useToast } from '../components/ui/ToastProvider'
import { useRelationshipsStore } from '../stores/relationships'
import type { SimulationSnapshot, SimulationTickState } from '../stores/simulation'
import { useSimulationStore } from '../stores/simulation'
import type { RelationshipDelta } from '../types'

/** Tick payload as received from the WebSocket (superset of SimulationTickState). */
interface WsTickPayload extends SimulationTickState {
  achievement_unlocks?: Array<{ resident_id: string; achievement_name: string; icon: string }>
  relationship_events?: Array<{
    from_id: string
    to_id: string
    from_name: string
    to_name: string
    event_type: string
    dialogue: string
  }>
}

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected'

const MIN_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000
const MAX_RETRIES = 10
const MAX_PENDING_TICKS = 200

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
  reconnectCountdown: number
  maxRetriesExceeded: boolean
  retry: () => void
}

export function useWebSocket(enabled = true): UseWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [hasInitialSnapshot, setHasInitialSnapshot] = useState(false)
  const [startupTimedOut, setStartupTimedOut] = useState(false)
  const [reconnectCountdown, setReconnectCountdown] = useState(0)
  const [maxRetriesExceeded, setMaxRetriesExceeded] = useState(false)
  const { pushToast } = useToast()
  const { play } = useSound()

  const wsRef = useRef<WebSocket | null>(null)
  const backoffRef = useRef<number>(MIN_BACKOFF_MS)
  const retryCountRef = useRef<number>(0)
  const connectRef = useRef<() => void>(() => {})
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef<boolean>(true)
  const frameRef = useRef<number | null>(null)
  const pendingTicksRef = useRef<WsTickPayload[]>([])
  const hasConnectedOnceRef = useRef(false)
  const shouldAnnounceReconnectRef = useRef(false)

  const simUpdateFromTick = useSimulationStore((s) => s.updateFromTick)
  const simInitFromSnapshot = useSimulationStore((s) => s.initFromSnapshot)
  const relUpdateFromTick = useRelationshipsStore((s) => s.updateFromTick)
  const relInitFromSnapshot = useRelationshipsStore((s) => s.initFromSnapshot)
  const relSetAbsolute = useRelationshipsStore((s) => s.setRelationshipsAbsolute)
  const relAddFlashingKeys = useRelationshipsStore((s) => s.addFlashingEventKeys)

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

      const relEventLabel = (eventType: string): string => {
        if (eventType === 'best_friends') return '💚 成为挚友'
        if (eventType === 'confession') return '💖 告白'
        if (eventType === 'public_argument') return '⚡ 公开争吵'
        return '🔗 关系事件'
      }

      const commitTick = (tickData: WsTickPayload, playSounds = true) => {
        // Overflow protection: drop oldest ticks when renderer can't keep up
        if (pendingTicksRef.current.length >= MAX_PENDING_TICKS) {
          pendingTicksRef.current.splice(0, pendingTicksRef.current.length - MAX_PENDING_TICKS + 1)
        }
        pendingTicksRef.current.push(tickData)

        if (frameRef.current !== null) {
          return
        }

        frameRef.current = window.requestAnimationFrame(() => {
          frameRef.current = null
          const queuedTicks = pendingTicksRef.current.splice(0)
          let sawDialogue = false
          let sawRelationshipDelta = false

          for (const queuedTick of queuedTicks) {
            const dialogues = queuedTick.dialogues ?? []
            const relationships = queuedTick.relationships ?? []
            const achievementUnlocks = queuedTick.achievement_unlocks ?? []
            const relationshipEvents = queuedTick.relationship_events ?? []
            sawDialogue = sawDialogue || dialogues.length > 0
            sawRelationshipDelta = sawRelationshipDelta || relationships.length > 0
            simUpdateFromTick(queuedTick)
            relUpdateFromTick({
              tick: queuedTick.tick,
              relationships: relationships as Array<RelationshipDelta & { reason?: string }>,
            })
            if (playSounds) {
              for (const unlock of achievementUnlocks) {
                pushToast({
                  type: 'success',
                  category: 'achievement',
                  title: `${unlock.icon} ${unlock.achievement_name}`,
                })
                play('achievement')
              }
              for (const ev of relationshipEvents) {
                pushToast({
                  type: 'info',
                  category: 'relationship',
                  title: relEventLabel(ev.event_type),
                  description: `${ev.from_name} & ${ev.to_name}`,
                })
                play('event')
              }
            }
            if (relationshipEvents.length > 0) {
              relAddFlashingKeys(relationshipEvents.map((ev) => `${ev.from_id}::${ev.to_id}`))
            }
          }

          if (playSounds) {
            if (sawDialogue) {
              play('dialogue')
            }
            if (sawRelationshipDelta) {
              play('relationship')
            }
          }
        })
      }

      if (type === 'snapshot') {
        // Full state: initialise simulation store from residents list, then
        // apply last_tick on top for up-to-date positions/dialogues.
        const snapshot = (data ?? {}) as SimulationSnapshot
        setHasInitialSnapshot(true)
        setStartupTimedOut(false)
        simInitFromSnapshot(snapshot)
        // Rebuild graph store from backend residents, clearing mock data
        relInitFromSnapshot(snapshot.residents ?? [])
        // Seed initial relationships absolutely (not as deltas) from snapshot
        // Always call even with empty array to clear seed data on fresh simulations
        relSetAbsolute(((snapshot as Record<string, unknown>).relationships ?? []) as Array<{
          from_id: string; to_id: string; type: string; intensity: number; reason?: string
        }>)
        if (snapshot.last_tick) {
          // Apply last_tick for positions/dialogues but SKIP relationship deltas to prevent
          // double-stacking with the absolute snapshot.relationships already applied above.
          const lastTickNoRels: WsTickPayload = { ...snapshot.last_tick, relationships: [] }
          commitTick(lastTickNoRels, false)
        }
      } else if (type === 'tick') {
        // Incremental diff
        commitTick(data as WsTickPayload)
      }
    },
    [play, pushToast, relAddFlashingKeys, relInitFromSnapshot, relSetAbsolute, relUpdateFromTick, simInitFromSnapshot, simUpdateFromTick],
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
      // Reset backoff and retry state on successful connection
      backoffRef.current = MIN_BACKOFF_MS
      retryCountRef.current = 0
      setMaxRetriesExceeded(false)
      setReconnectCountdown(0)
      if (countdownIntervalRef.current !== null) {
        clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
      }
      setStatus('connected')
      if (shouldAnnounceReconnectRef.current) {
        pushToast({
          type: 'success',
          title: '重新连接成功',
          description: '实时同步已恢复。',
        })
        shouldAnnounceReconnectRef.current = false
      }
      hasConnectedOnceRef.current = true
      // Ask backend for full snapshot (spec §13: full sync on connect)
      ws.send(JSON.stringify({ type: 'get_snapshot' }))
    }

    ws.onmessage = handleMessage

    ws.onclose = () => {
      if (!mountedRef.current) return
      setStatus('disconnected')

      // Clear any running countdown
      if (countdownIntervalRef.current !== null) {
        clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
      }

      if (hasConnectedOnceRef.current) {
        shouldAnnounceReconnectRef.current = true
        pushToast({
          type: 'warning',
          title: '连接中断',
          description: '正在尝试重新连接 WebSocket。',
        })
      }

      retryCountRef.current += 1

      // Give up after MAX_RETRIES attempts
      if (retryCountRef.current > MAX_RETRIES) {
        setMaxRetriesExceeded(true)
        return
      }

      // Exponential backoff: 1 s → 2 s → 4 s → 8 s → 16 s → 30 s max
      const delay = backoffRef.current
      backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS)

      // Countdown display
      const delaySeconds = Math.ceil(delay / 1_000)
      setReconnectCountdown(delaySeconds)
      let remaining = delaySeconds
      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1
        if (remaining <= 0) {
          clearInterval(countdownIntervalRef.current!)
          countdownIntervalRef.current = null
          setReconnectCountdown(0)
        } else {
          setReconnectCountdown(remaining)
        }
      }, 1_000)

      timerRef.current = setTimeout(() => {
        connectRef.current()
      }, delay)
    }

    ws.onerror = () => {
      // onclose fires immediately after onerror, so reconnect is handled there
      ws.close()
    }
  }, [enabled, handleMessage, pushToast])

  const retry = useCallback(() => {
    setStartupTimedOut(false)
    backoffRef.current = MIN_BACKOFF_MS
    retryCountRef.current = 0
    setMaxRetriesExceeded(false)
    setReconnectCountdown(0)

    if (countdownIntervalRef.current !== null) {
      clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
    }

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
      if (countdownIntervalRef.current !== null) clearInterval(countdownIntervalRef.current)
      if (frameRef.current !== null) {
        if (typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(frameRef.current)
        }
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
    reconnectCountdown,
    maxRetriesExceeded,
    retry,
  }
}
