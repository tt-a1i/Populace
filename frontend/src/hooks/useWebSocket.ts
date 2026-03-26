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

import i18n from '../i18n/config'
import { useSound } from '../audio'
import { useToast } from '../components/ui/ToastProvider'
import { useRelationshipsStore } from '../stores/relationships'
import type { SimulationSnapshot, SimulationTickState } from '../stores/simulation'
import { useSimulationStore } from '../stores/simulation'
import type { PopulationEvent, RelationshipDelta } from '../types'

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
  population_events?: PopulationEvent[]
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
  connectionCount: number
  hasInitialSnapshot: boolean
  startupTimedOut: boolean
  reconnectCountdown: number
  maxRetriesExceeded: boolean
  retry: () => void
}

export function useWebSocket(enabled = true): UseWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [connectionCount, setConnectionCount] = useState(1)
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
  const simApplyPopulationEvents = useSimulationStore(
    ((s: SimulationSnapshot & { applyPopulationEvents?: (events: PopulationEvent[]) => void }) =>
      s.applyPopulationEvents) as never,
  ) as ((events: PopulationEvent[]) => void) | undefined
  const simApplyFestivalTick = useSimulationStore(
    ((s: SimulationSnapshot & { applyFestivalTick?: (updates: Array<{ status: string; festival: Record<string, unknown>; memorial?: string | null }>) => void }) =>
      s.applyFestivalTick) as never,
  ) as ((updates: Array<{ status: string; festival: Record<string, unknown>; memorial?: string | null }>) => void) | undefined
  const relUpdateFromTick = useRelationshipsStore((s) => s.updateFromTick)
  const relInitFromSnapshot = useRelationshipsStore((s) => s.initFromSnapshot)
  const relSetAbsolute = useRelationshipsStore((s) => s.setRelationshipsAbsolute)
  const relAddFlashingKeys = useRelationshipsStore((s) => s.addFlashingEventKeys)
  const relApplyPopulationEvents = useRelationshipsStore(
    ((s: { applyPopulationEvents?: (events: PopulationEvent[]) => void }) => s.applyPopulationEvents) as never,
  ) as ((events: PopulationEvent[]) => void) | undefined
  const simApplyResidentOperation = useSimulationStore(
    ((s: SimulationSnapshot & { applyResidentOperation?: (resident: unknown, operation: string) => void }) =>
      s.applyResidentOperation) as never,
  ) as ((resident: unknown, operation: string) => void) | undefined
  const simSetActiveVotes = useSimulationStore(
    ((s: SimulationSnapshot & { setActiveVotes?: (votes: unknown[]) => void }) => s.setActiveVotes) as never,
  ) as ((votes: unknown[]) => void) | undefined
  const simSetVoteHistory = useSimulationStore(
    ((s: SimulationSnapshot & { setVoteHistory?: (votes: unknown[]) => void }) => s.setVoteHistory) as never,
  ) as ((votes: unknown[]) => void) | undefined
  const simApplyVoteTick = useSimulationStore(
    ((s: SimulationSnapshot & { applyVoteTick?: (votes: unknown[], announcements: unknown[]) => void }) => s.applyVoteTick) as never,
  ) as ((votes: unknown[], announcements: unknown[]) => void) | undefined
  const clientIdRef = useRef<string | null>(null)

  // -------------------------------------------------------------------------
  // Message handler
  // -------------------------------------------------------------------------
  const handleMessage = useCallback((event: MessageEvent) => {
      let msg: { type?: string; data?: unknown }
      try {
        msg = JSON.parse(event.data as string)
      } catch {
        return
      }

      const { type, data } = msg

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
            const populationEvents = queuedTick.population_events ?? []
            const festivalUpdates = (((queuedTick as unknown) as Record<string, unknown>).festival_updates ?? []) as Array<{
              status: string
              festival: { name: string; type: string }
              memorial?: string | null
            }>
            sawDialogue = sawDialogue || dialogues.length > 0
            sawRelationshipDelta = sawRelationshipDelta || relationships.length > 0
            simUpdateFromTick(queuedTick)
            relUpdateFromTick({
              tick: queuedTick.tick,
              relationships: relationships as Array<RelationshipDelta & { reason?: string }>,
            })
            if (typeof simApplyPopulationEvents === 'function') {
              simApplyPopulationEvents(populationEvents)
            }
            if (typeof simApplyFestivalTick === 'function') {
              simApplyFestivalTick(festivalUpdates)
            }
            if (typeof relApplyPopulationEvents === 'function') {
              relApplyPopulationEvents(populationEvents)
            }
            if (typeof simApplyVoteTick === 'function') {
              simApplyVoteTick(queuedTick.vote_updates ?? [], queuedTick.vote_announcements ?? [])
            }
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
                const EVENT_TOAST: Record<string, { icon: string; labelKey: string }> = {
                  confession: { icon: '\u{1F495}', labelKey: 'ws.event_confession' },
                  best_friends: { icon: '\u{1F91D}', labelKey: 'ws.event_best_friends' },
                  public_argument: { icon: '\u26A1', labelKey: 'ws.event_public_argument' },
                }
                const meta = EVENT_TOAST[ev.event_type] ?? { icon: '\u2728', labelKey: '' }
                const label = meta.labelKey ? i18n.t(meta.labelKey) : ev.event_type
                pushToast({
                  type: ev.event_type === 'public_argument' ? 'warning' : 'success',
                  category: 'relationship',
                  title: `${meta.icon} ${i18n.t('ws.event_milestone', { a: ev.from_name, b: ev.to_name, event: label })}`,
                  description: ev.dialogue,
                })
                play('event')
                window.dispatchEvent(new CustomEvent('populace:milestone', {
                  detail: { fromId: ev.from_id, toId: ev.to_id, eventType: ev.event_type },
                }))
              }
              for (const populationEvent of populationEvents) {
                if (populationEvent.event_type === 'birth') {
                  pushToast({
                    type: 'success',
                    category: 'default',
                    title: i18n.t('ws.population_birth_title', { resident: populationEvent.resident_name }),
                    description:
                      populationEvent.summary ||
                      i18n.t('ws.population_birth_desc', {
                        resident: populationEvent.resident_name,
                        parents: (populationEvent.parent_names ?? []).join('、') || i18n.t('ws.population_unknown_parents'),
                      }),
                  })
                  play('achievement')
                } else if (populationEvent.event_type === 'death') {
                  pushToast({
                    type: 'warning',
                    category: 'default',
                    title: i18n.t('ws.population_death_title', { resident: populationEvent.resident_name }),
                    description:
                      populationEvent.summary ||
                      i18n.t('ws.population_death_desc', { resident: populationEvent.resident_name }),
                  })
                  play('event')
                }
              }
              for (const announcement of queuedTick.vote_announcements ?? []) {
                pushToast({
                  type: 'success',
                  category: 'default',
                  title: i18n.t('vote.result_title', { defaultValue: '社区决议已公布' }),
                  description: i18n.t('vote.result_desc', {
                    defaultValue: `${announcement.issue}：${announcement.winning_option ?? ''}`,
                    issue: announcement.issue,
                    result: announcement.winning_option ?? '',
                  }),
                })
                play('event')
              }
              for (const update of festivalUpdates) {
                if (update.status === 'started') {
                  pushToast({
                    type: 'success',
                    category: 'default',
                    title: `庆典开始：${update.festival.name}`,
                    description: `${update.festival.name} 正在进行，居民正朝庆典现场汇聚。`,
                  })
                  play('event')
                } else if (update.status === 'ended') {
                  pushToast({
                    type: 'success',
                    category: 'default',
                    title: `庆典落幕：${update.festival.name}`,
                    description: update.memorial ?? `${update.festival.name} 留下了一段新的共同回忆。`,
                  })
                }
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
        if (typeof simSetActiveVotes === 'function') {
          simSetActiveVotes(((snapshot as Record<string, unknown>).active_votes ?? []) as unknown[])
        }
        if (typeof simSetVoteHistory === 'function') {
          simSetVoteHistory(((snapshot as Record<string, unknown>).vote_history ?? []) as unknown[])
        }
        if (snapshot.last_tick) {
          // Apply last_tick for positions/dialogues but SKIP relationship deltas to prevent
          // double-stacking with the absolute snapshot.relationships already applied above.
          const lastTickNoRels: WsTickPayload = { ...snapshot.last_tick, relationships: [] }
          commitTick(lastTickNoRels, false)
        }
      } else if (type === 'tick') {
        // Incremental diff
        commitTick(data as WsTickPayload)
      } else if (type === 'session') {
        const session = (data ?? {}) as { client_id?: string; connection_count?: number }
        if (session.client_id) {
          clientIdRef.current = session.client_id
          window.sessionStorage.setItem('populace:client-id', session.client_id)
        }
        if (typeof session.connection_count === 'number') {
          setConnectionCount(session.connection_count)
        }
      } else if (type === 'connections') {
        const payload = (data ?? {}) as { count?: number }
        if (typeof payload.count === 'number') {
          setConnectionCount(payload.count)
        }
      } else if (type === 'operation') {
        const payload = (data ?? {}) as {
          operation?: string
          source_client_id?: string
          resident?: unknown
        }
        if (
          payload.operation &&
          payload.resident &&
          payload.source_client_id !== clientIdRef.current &&
          typeof simApplyResidentOperation === 'function'
        ) {
          simApplyResidentOperation(payload.resident, payload.operation)
        }
      }
    }, [play, pushToast, relAddFlashingKeys, relApplyPopulationEvents, relInitFromSnapshot, relSetAbsolute, relUpdateFromTick, simApplyFestivalTick, simApplyPopulationEvents, simApplyResidentOperation, simApplyVoteTick, simInitFromSnapshot, simSetActiveVotes, simSetVoteHistory, simUpdateFromTick])

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
          title: i18n.t('ws.reconnected'),
          description: i18n.t('ws.reconnected_desc'),
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
          title: i18n.t('ws.connection_lost'),
          description: i18n.t('ws.reconnecting_desc'),
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

    connectRef.current()

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

  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    const handleViewportChanged = (event: Event) => {
      if (!wsRef.current || typeof wsRef.current.send !== 'function') {
        return
      }
      const detail = (event as CustomEvent).detail
      wsRef.current.send(
        JSON.stringify({
          type: 'viewport',
          data: detail,
        }),
      )
    }

    window.addEventListener('populace:viewport-changed', handleViewportChanged)
    return () => {
      window.removeEventListener('populace:viewport-changed', handleViewportChanged)
    }
  }, [enabled])

  return {
    status,
    connected: status === 'connected',
    connecting: status === 'connecting',
    disconnected: status === 'disconnected',
    connectionCount,
    hasInitialSnapshot,
    startupTimedOut,
    reconnectCountdown,
    maxRetriesExceeded,
    retry,
  }
}
