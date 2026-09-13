import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react"
import { applyA2UI, emptySurface, hydrate, surfaceIdOf, type RenderedSurface } from "./a2ui.ts"
import type {
  AgentDef,
  AgentRuntime,
  BusMessage,
  Detection,
  TranscriptEntry,
  PhalanxEvent,
  EstateHost,
  Incident,
  Posture,
  RangeStatus,
  WorldSnapshot,
  PublicSettings,
} from "./model.ts"

/* Live world state.
   One SSE connection feeds an external store; components subscribe through
   useSyncExternalStore so a burst of bus messages during a response does not
   re-render pages that are not watching the bus. */

const BUS_LIMIT = 400
const LOG_LIMIT = 200

export interface LogLine {
  at: string
  level: "info" | "warn" | "error"
  text: string
}

export interface PhalanxState {
  connected: boolean
  /** Server world generation. Changes on reset; derived state keyed on it is
      thrown away rather than reconciled. */
  generation: number
  mode: "live" | "replay"
  activeProvider: string
  commanderModel: string
  specialistModel: string
  agents: AgentDef[]
  runtime: Map<string, AgentRuntime>
  incidents: Map<string, Incident>
  hosts: Map<string, EstateHost>
  surfaces: Map<string, RenderedSurface>
  bus: BusMessage[]
  transcript: TranscriptEntry[]
  detections: Detection[]
  posture: Posture
  rangeStatus: RangeStatus | null
  log: LogLine[]
  /** Bumped on every applied event; the graph uses it to schedule repaints. */
  revision: number
}

export type EsperState = PhalanxState

const INITIAL: PhalanxState = {
  connected: false,
  generation: 0,
  mode: "replay",
  activeProvider: "replay",
  commanderModel: "gemini-3.1-pro",
  specialistModel: "gemini-3.8-flash",
  agents: [],
  runtime: new Map(),
  incidents: new Map(),
  hosts: new Map(),
  surfaces: new Map(),
  bus: [],
  transcript: [],
  detections: [],
  posture: {
    threatLevel: "green",
    openIncidents: 0,
    agentsEngaged: 0,
    meanTimeToContainSec: null,
    containedToday: 0,
    busMessagesPerMin: 0,
  },
  log: [],
  rangeStatus: null,
  revision: 0,
}

class PhalanxStore {
  private state: PhalanxState = INITIAL
  private readonly listeners = new Set<() => void>()
  private source: EventSource | null = null

  getState = (): PhalanxState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private commit(next: Partial<PhalanxState>): void {
    this.state = { ...this.state, ...next, revision: this.state.revision + 1 }
    for (const listener of this.listeners) listener()
  }

  connect(): () => void {
    if (this.source) return () => undefined
    const source = new EventSource("/api/stream")
    this.source = source
    source.onopen = () => this.commit({ connected: true })
    source.onerror = () => this.commit({ connected: false })
    source.onmessage = (event) => {
      try {
        this.apply(JSON.parse(event.data) as PhalanxEvent)
      } catch {
        // A malformed frame is not worth tearing the stream down for.
      }
    }
    return () => {
      source.close()
      this.source = null
    }
  }

  /**
   * A snapshot replaces the world wholesale rather than merging into it, so a
   * reset genuinely clears the client. Anything not in the snapshot — stale
   * incidents, a dead surface, an old bus tail — is gone.
   */
  private applySnapshot(snapshot: WorldSnapshot): void {
    this.commit({
      connected: true,
      generation: snapshot.generation ?? 0,
      mode: snapshot.mode,
      activeProvider: snapshot.activeProvider ?? "replay",
      commanderModel: snapshot.commanderModel,
      specialistModel: snapshot.specialistModel,
      agents: snapshot.agents,
      runtime: new Map(snapshot.runtime.map((each) => [each.id, each])),
      incidents: new Map(snapshot.incidents.map((each) => [each.id, each])),
      hosts: new Map(snapshot.hosts.map((each) => [each.id, each])),
      surfaces: new Map(snapshot.surfaces.map((each) => [each.id, hydrate(each)])),
      bus: snapshot.bus,
      transcript: snapshot.transcript ?? [],
      detections: snapshot.detections,
      posture: snapshot.posture,
      rangeStatus: snapshot.rangeStatus ?? null,
      log: snapshot.generation !== this.state.generation ? [] : this.state.log,
    })
  }

  apply(event: PhalanxEvent): void {
    switch (event.kind) {
      case "snapshot":
        this.applySnapshot(event.snapshot)
        return
      case "posture":
        this.commit({ posture: event.posture })
        return
      case "incident.upsert": {
        const incidents = new Map(this.state.incidents)
        incidents.set(event.incident.id, event.incident)
        this.commit({ incidents })
        return
      }
      case "incident.timeline": {
        const existing = this.state.incidents.get(event.incidentId)
        if (!existing) return
        if (existing.timeline.some((entry) => entry.id === event.entry.id)) return
        const incidents = new Map(this.state.incidents)
        incidents.set(event.incidentId, { ...existing, timeline: [...existing.timeline, event.entry] })
        this.commit({ incidents })
        return
      }
      case "agent.runtime": {
        const runtime = new Map(this.state.runtime)
        runtime.set(event.runtime.id, event.runtime)
        this.commit({ runtime })
        return
      }
      case "bus.message": {
        const bus = [...this.state.bus, event.message]
        this.commit({ bus: bus.length > BUS_LIMIT ? bus.slice(bus.length - BUS_LIMIT) : bus })
        return
      }
      case "transcript": {
        if (this.state.transcript.some((each) => each.id === event.entry.id)) return
        const transcript = [...this.state.transcript, event.entry]
        this.commit({ transcript: transcript.length > 400 ? transcript.slice(transcript.length - 400) : transcript })
        return
      }
      case "detection": {
        this.commit({ detections: [event.detection, ...this.state.detections].slice(0, 80) })
        return
      }
      case "host": {
        const hosts = new Map(this.state.hosts)
        hosts.set(event.host.id, event.host)
        this.commit({ hosts })
        return
      }
      case "a2ui": {
        const surfaces = new Map(this.state.surfaces)
        const surfaceId = surfaceIdOf(event.message)
        const current = surfaces.get(surfaceId) ?? emptySurface(surfaceId)
        surfaces.set(surfaceId, applyA2UI(current, event.message))
        this.commit({ surfaces })
        return
      }
      case "range": {
        this.commit({ rangeStatus: event.status })
        return
      }
      case "log": {
        const log = [{ at: event.at, level: event.level, text: event.text }, ...this.state.log].slice(0, LOG_LIMIT)
        this.commit({ log })
        return
      }
    }
  }
}

const store = new PhalanxStore()

const StoreContext = createContext(store)

export function PhalanxProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    return store.connect()
  }, [])
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function usePhalanx(): PhalanxState {
  const instance = useContext(StoreContext)
  return useSyncExternalStore(instance.subscribe, instance.getState, instance.getState)
}

export function useAgentIndex(): Map<string, AgentDef> {
  const { agents } = usePhalanx()
  return useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents])
}

export function useIncidentList(): Incident[] {
  const { incidents } = usePhalanx()
  return useMemo(
    () =>
      [...incidents.values()].sort((left, right) => {
        const openness = Number(right.status !== "resolved") - Number(left.status !== "resolved")
        if (openness !== 0) return openness
        return right.openedAt.localeCompare(left.openedAt)
      }),
    [incidents],
  )
}

/* ---- commands ----------------------------------------------------------- */

export interface CommandResult {
  ok: boolean
  reason?: string
}

async function post(path: string, body?: unknown): Promise<CommandResult> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (response.ok) return { ok: true }
    const payload = (await response.json().catch(() => ({}))) as { reason?: string }
    return { ok: false, reason: payload.reason ?? `Request failed (${response.status}).` }
  } catch {
    return { ok: false, reason: "Could not reach the server." }
  }
}

export const phalanxApi = {
  runScenario: (id: string) => post(`/api/scenarios/${id}/run`),
  runCampaign: () => post("/api/campaign/run"),
  coordinate: () => post("/api/coordinate"),
  reset: () => post("/api/reset"),
  runRange: () => post("/api/range/run"),
  runRangeCampaign: () => post("/api/range/campaign/run"),
  runRangeMultiFront: () => post("/api/range/multi/run"),
  stopRange: () => post("/api/range/stop"),
  action: (surfaceId: string, actionId: string, payload?: Record<string, unknown>) =>
    post("/api/a2ui/action", { surfaceId, actionId, payload }),
  scenarios: async () => {
    const response = await fetch("/api/scenarios")
    return (await response.json()) as {
      scenarios: {
        id: string
        name: string
        code: string
        summary: string
        severity: string
        commanderId: string
        running: boolean
        refusal: string | null
      }[]
      mode: "live" | "replay"
    }
  },
  getSettings: async (): Promise<PublicSettings> => {
    const response = await fetch("/api/settings")
    return (await response.json()) as PublicSettings
  },
  updateSettings: async (settings: Record<string, unknown>): Promise<{ ok: boolean; settings?: PublicSettings; reason?: string }> => {
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      })
      const payload = (await response.json()) as { ok: boolean; settings?: PublicSettings; reason?: string }
      return payload
    } catch {
      return { ok: false, reason: "Could not reach the server." }
    }
  },
  testKey: async (provider: string, apiKey?: string, model?: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const response = await fetch("/api/settings/test-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, apiKey, model }),
      })
      return (await response.json()) as { ok: boolean; error?: string }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Connection failed." }
    }
  },
  askCommander: async (
    prompt: string,
    agentId?: string,
  ): Promise<{ ok: boolean; answer?: string; error?: string }> => {
    try {
      const response = await fetch("/api/chat/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, agentId }),
      })
      const payload = (await response.json()) as { ok: boolean; answer?: string; error?: string }
      return payload
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Could not reach the server." }
    }
  },
}

export const EsperProvider = PhalanxProvider
export const useEsper = usePhalanx
export const esperApi = phalanxApi
