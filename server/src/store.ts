import { randomUUID } from "node:crypto"
import type { AgentCard } from "./a2a/types.ts"
import { CATALOG_ID, type A2UIMessage } from "./a2ui/types.ts"
import { ROSTER, agentDef } from "./agents/roster.ts"
import type {
  AgentRuntime,
  AgentState,
  BusMessage,
  Detection,
  EstateHost,
  Incident,
  IncidentPhase,
  IncidentTimelineEntry,
  PhalanxEvent,
  Surface,
  TranscriptEntry,
  WorldSnapshot,
} from "./model.ts"
import { ESTATE } from "./tools/world.ts"
import type { RangeState } from "./range/events.ts"
import { loadSettings, type PhalanxSettings, type ProviderName } from "./config.ts"

type Listener = (event: PhalanxEvent) => void

const BUS_HISTORY = 400
const DETECTION_HISTORY = 200

export function now(): string {
  return new Date().toISOString()
}

export function id(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`
}

/** Raised when work started before a reset tries to continue afterwards. */
export class WorldResetError extends Error {
  constructor() {
    super("world was reset")
    this.name = "WorldResetError"
  }
}

class Store {
  settings: PhalanxSettings = loadSettings()
  mode: "live" | "replay" = "replay"

  get activeProvider(): ProviderName {
    return this.settings.activeProvider
  }
  set activeProvider(value: ProviderName) {
    this.settings.activeProvider = value
  }

  /**
   * Bumped by every reset. Anything long-running captures it and abandons its
   * work when it no longer matches, so a run that was in flight when the
   * operator hit reset cannot write into the fresh world.
   */
  generation = 0

  assertGeneration(expected: number): void {
    if (this.generation !== expected) {
      throw new WorldResetError()
    }
  }

  /** Set from the first request so a broadcast snapshot can build agent cards. */
  baseUrl = ""
  commanderModel = "gemini-3.1-pro"
  specialistModel = "gemini-3.8-flash"

  readonly runtime = new Map<string, AgentRuntime>()
  readonly incidents = new Map<string, Incident>()
  readonly surfaces = new Map<string, Surface>()
  readonly hosts = new Map<string, EstateHost>()
  bus: BusMessage[] = []
  transcript: TranscriptEntry[] = []
  detections: Detection[] = []
  containedToday = 0
  /** Live range status when a range run is active; null otherwise. */
  rangeStatus: RangeState | null = null
  private readonly containSeconds: number[] = []

  private readonly listeners = new Set<Listener>()

  constructor() {
    this.mode = this.settings.mode
    const provider = this.settings.activeProvider
    if (provider !== "replay" && this.settings.models[provider]) {
      this.commanderModel = this.settings.models[provider].commander
      this.specialistModel = this.settings.models[provider].specialist
    }
    for (const def of ROSTER) {
      this.runtime.set(def.id, {
        id: def.id,
        state: "standby",
        focusIncidentId: null,
        incidentIds: [],
        activity: "Standing by",
        lastMessageAt: null,
        tasksHandled: 0,
        findings: 0,
        tokens: { input: 0, output: 0 },
      })
    }
    for (const host of ESTATE) this.hosts.set(host.id, { ...host })
    this.ensureSurface("mission-control")
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(event: PhalanxEvent): void {
    if (event.generation === undefined) {
      event.generation = this.generation
    }
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // A wedged SSE client must not stall the run loop.
      }
    }
  }

  log(text: string, level: "info" | "warn" | "error" = "info"): void {
    this.emit({ kind: "log", at: now(), level, text })
  }

  /* ---- agents ---------------------------------------------------------- */

  agentCard(agentId: string, baseUrl: string): AgentCard {
    const def = agentDef(agentId)
    return {
      protocolVersion: "0.3.0",
      name: def.name,
      description: def.summary,
      url: `${baseUrl}/api/a2a/agents/${def.id}`,
      version: "1.0.0",
      provider: { organization: "Phalanx Blue Team", url: baseUrl },
      capabilities: { streaming: true, pushNotifications: false, extendedAgentCard: false },
      defaultInputModes: ["text/plain", "application/json"],
      defaultOutputModes: ["text/plain", "application/json"],
      skills: def.skills,
      metadata: {
        agentId: def.id,
        discipline: def.discipline,
        model: def.class === "command" ? this.commanderModel : this.specialistModel,
        clearance: def.clearance,
      },
    }
  }

  setAgentState(
    agentId: string,
    patch: Partial<Pick<AgentRuntime, "state" | "activity" | "focusIncidentId">>,
  ): void {
    const runtime = this.runtime.get(agentId)
    if (!runtime) return
    Object.assign(runtime, patch)
    runtime.lastMessageAt = now()
    this.emit({ kind: "agent.runtime", at: now(), runtime: { ...runtime } })
  }

  enrollAgent(agentId: string, incidentId: string): void {
    const runtime = this.runtime.get(agentId)
    if (!runtime) return
    if (!runtime.incidentIds.includes(incidentId)) runtime.incidentIds.push(incidentId)
    runtime.focusIncidentId = incidentId
    this.emit({ kind: "agent.runtime", at: now(), runtime: { ...runtime } })
  }

  releaseAgent(agentId: string, incidentId: string): void {
    const runtime = this.runtime.get(agentId)
    if (!runtime) return
    runtime.incidentIds = runtime.incidentIds.filter((each) => each !== incidentId)
    if (runtime.focusIncidentId === incidentId) {
      runtime.focusIncidentId = runtime.incidentIds[0] ?? null
    }
    if (runtime.incidentIds.length === 0) {
      runtime.state = "standby"
      runtime.activity = "Standing by"
    }
    this.emit({ kind: "agent.runtime", at: now(), runtime: { ...runtime } })
  }

  creditAgent(agentId: string, delta: { tasks?: number; findings?: number; input?: number; output?: number }): void {
    const runtime = this.runtime.get(agentId)
    if (!runtime) return
    runtime.tasksHandled += delta.tasks ?? 0
    runtime.findings += delta.findings ?? 0
    runtime.tokens.input += delta.input ?? 0
    runtime.tokens.output += delta.output ?? 0
    this.emit({ kind: "agent.runtime", at: now(), runtime: { ...runtime } })
  }

  /* ---- incidents ------------------------------------------------------- */

  openIncident(input: {
    code: string
    title: string
    summary: string
    severity: Incident["severity"]
    commanderId: string
    scenarioId: string
    assets?: string[]
    indicators?: string[]
  }): Incident {
    const incidentId = id("inc")
    const incident: Incident = {
      id: incidentId,
      code: input.code,
      title: input.title,
      summary: input.summary,
      severity: input.severity,
      phase: "triage",
      status: "open",
      commanderId: input.commanderId,
      scenarioId: input.scenarioId,
      openedAt: now(),
      updatedAt: now(),
      closedAt: null,
      assets: input.assets ?? [],
      indicators: input.indicators ?? [],
      progress: 4,
      confidence: 20,
      assignments: [],
      timeline: [],
      surfaceId: `incident:${incidentId}`,
      links: [],
    }
    this.incidents.set(incidentId, incident)
    this.ensureSurface(incident.surfaceId)
    this.enrollAgent(input.commanderId, incidentId)
    this.setAgentState(input.commanderId, {
      state: "briefing",
      activity: `Taking command of ${incident.code}`,
      focusIncidentId: incidentId,
    })
    this.emit({ kind: "incident.upsert", at: now(), incident: { ...incident } })
    this.appendTimeline(incidentId, {
      actor: input.commanderId,
      phase: "triage",
      text: `Incident opened and assumed by ${agentDef(input.commanderId).callsign}.`,
      tone: "info",
    })
    this.recomputePosture()
    return incident
  }

  patchIncident(incidentId: string, patch: Partial<Incident>): Incident | null {
    const incident = this.incidents.get(incidentId)
    if (!incident) return null
    Object.assign(incident, patch)
    incident.updatedAt = now()
    if (incident.status === "resolved" && !incident.closedAt) {
      incident.closedAt = incident.updatedAt
      this.containedToday += 1
      this.containSeconds.push(
        (Date.parse(incident.closedAt) - Date.parse(incident.openedAt)) / 1000,
      )
    }
    this.emit({ kind: "incident.upsert", at: now(), incident: { ...incident } })
    this.recomputePosture()
    return incident
  }

  setPhase(incidentId: string, phase: IncidentPhase): void {
    const incident = this.incidents.get(incidentId)
    if (!incident || incident.phase === phase) return
    this.patchIncident(incidentId, { phase })
  }

  assign(incidentId: string, agentId: string, objective: string): void {
    const incident = this.incidents.get(incidentId)
    if (!incident) return
    const existing = incident.assignments.find((each) => each.agentId === agentId)
    if (existing) {
      existing.objective = objective
      existing.at = now()
    } else {
      incident.assignments.push({ agentId, objective, state: "briefing", at: now() })
    }
    this.enrollAgent(agentId, incidentId)
    this.emit({ kind: "incident.upsert", at: now(), incident: { ...incident } })
  }

  setAssignmentState(incidentId: string, agentId: string, state: AgentState): void {
    const incident = this.incidents.get(incidentId)
    if (!incident) return
    const assignment = incident.assignments.find((each) => each.agentId === agentId)
    if (!assignment) return
    assignment.state = state
    assignment.at = now()
    this.emit({ kind: "incident.upsert", at: now(), incident: { ...incident } })
  }

  linkIncidents(a: string, b: string, reason: string): void {
    const left = this.incidents.get(a)
    const right = this.incidents.get(b)
    if (!left || !right) return
    if (!left.links.some((link) => link.incidentId === b)) left.links.push({ incidentId: b, reason })
    if (!right.links.some((link) => link.incidentId === a)) right.links.push({ incidentId: a, reason })
    this.emit({ kind: "incident.upsert", at: now(), incident: { ...left } })
    this.emit({ kind: "incident.upsert", at: now(), incident: { ...right } })
  }

  appendTimeline(
    incidentId: string,
    entry: { actor: string; phase?: IncidentPhase; text: string; tone?: IncidentTimelineEntry["tone"] },
  ): void {
    const incident = this.incidents.get(incidentId)
    if (!incident) return
    const def = ROSTER.find((each) => each.id === entry.actor)
    const record: IncidentTimelineEntry = {
      id: id("tl"),
      at: now(),
      actor: entry.actor,
      actorName: def?.callsign ?? entry.actor,
      phase: entry.phase ?? incident.phase,
      text: entry.text,
      tone: entry.tone ?? "neutral",
    }
    incident.timeline.push(record)
    incident.updatedAt = record.at
    this.emit({ kind: "incident.timeline", at: record.at, incidentId, entry: record })
  }

  /* ---- coordination bus ------------------------------------------------ */

  recordTranscript(entry: Omit<TranscriptEntry, "id" | "at">): void {
    const record: TranscriptEntry = { ...entry, id: id("tr"), at: now() }
    this.transcript.push(record)
    if (this.transcript.length > 400) this.transcript.splice(0, this.transcript.length - 400)
    this.emit({ kind: "transcript", at: record.at, entry: record })
  }

  recordBusMessage(message: Omit<BusMessage, "id" | "at">): BusMessage {
    const record: BusMessage = { ...message, id: id("msg"), at: now() }
    this.bus.push(record)
    if (this.bus.length > BUS_HISTORY) this.bus.splice(0, this.bus.length - BUS_HISTORY)
    this.emit({ kind: "bus.message", at: record.at, message: record })
    return record
  }

  /* ---- estate ---------------------------------------------------------- */

  setRangeStatus(status: RangeState | null): void {
    this.rangeStatus = status
    this.emit({ kind: "range", at: now(), status })
  }

  recordDetection(detection: Omit<Detection, "id" | "at">): Detection {
    const record: Detection = { ...detection, id: id("det"), at: now() }
    this.detections.unshift(record)
    if (this.detections.length > DETECTION_HISTORY) this.detections.length = DETECTION_HISTORY
    this.emit({ kind: "detection", at: record.at, detection: record })
    return record
  }

  setHostStatus(hostId: string, status: EstateHost["status"]): void {
    const host = this.hosts.get(hostId)
    if (!host || host.status === status) return
    host.status = status
    this.emit({ kind: "host", at: now(), host: { ...host } })
  }

  /* ---- A2UI surfaces --------------------------------------------------- */

  ensureSurface(surfaceId: string): Surface {
    const existing = this.surfaces.get(surfaceId)
    if (existing) return existing
    const surface: Surface = {
      id: surfaceId,
      createdAt: now(),
      updatedAt: now(),
      messages: [],
      data: {},
      components: {},
      root: null,
    }
    this.surfaces.set(surfaceId, surface)
    this.applyA2UI({
      version: "v0.9",
      createSurface: { surfaceId, catalogId: CATALOG_ID, sendDataModel: true },
    })
    return surface
  }

  /** Apply an A2UI message to server-held surface state and fan it out. */
  applyA2UI(message: A2UIMessage): void {
    const surfaceId =
      "createSurface" in message
        ? message.createSurface.surfaceId
        : "updateComponents" in message
          ? message.updateComponents.surfaceId
          : "updateDataModel" in message
            ? message.updateDataModel.surfaceId
            : message.deleteSurface.surfaceId

    if ("deleteSurface" in message) {
      this.surfaces.delete(surfaceId)
      this.emit({ kind: "a2ui", at: now(), surfaceId, message })
      return
    }

    let surface = this.surfaces.get(surfaceId)
    if (!surface) {
      surface = {
        id: surfaceId,
        createdAt: now(),
        updatedAt: now(),
        messages: [],
        data: {},
        components: {},
        root: null,
      }
      this.surfaces.set(surfaceId, surface)
    }

    if ("updateComponents" in message) {
      for (const component of message.updateComponents.components) {
        surface.components[component.id] = component
        if (component.id === "root") surface.root = "root"
      }
    } else if ("updateDataModel" in message) {
      const { path, value } = message.updateDataModel
      if (path === "/" || path === "") {
        surface.data = (value as Record<string, unknown>) ?? {}
      } else {
        writePointer(surface.data, path, value)
      }
    }

    surface.updatedAt = now()
    // Keep the tail so a late-joining client can replay the surface exactly.
    surface.messages.push(message)
    if (surface.messages.length > 200) surface.messages.splice(0, surface.messages.length - 200)
    this.emit({ kind: "a2ui", at: surface.updatedAt, surfaceId, message })
  }

  /* ---- snapshot -------------------------------------------------------- */

  posture(): WorldSnapshot["posture"] {
    const open = [...this.incidents.values()].filter((each) => each.status !== "resolved")
    const engaged = [...this.runtime.values()].filter((each) => each.incidentIds.length > 0).length
    const worst = open.reduce((acc, each) => Math.min(acc, severityRank(each.severity)), 4)
    const level: WorldSnapshot["posture"]["threatLevel"] =
      open.length === 0 ? "green" : worst === 0 ? (open.length > 1 ? "black" : "red") : worst === 1 ? "red" : "amber"
    const windowStart = Date.now() - 60_000
    const recent = this.bus.filter((each) => Date.parse(each.at) >= windowStart).length
    const mttc =
      this.containSeconds.length === 0
        ? null
        : Math.round(this.containSeconds.reduce((a, b) => a + b, 0) / this.containSeconds.length)
    return {
      threatLevel: level,
      openIncidents: open.length,
      agentsEngaged: engaged,
      meanTimeToContainSec: mttc,
      containedToday: this.containedToday,
      busMessagesPerMin: recent,
    }
  }

  /** Full teardown. Everything the demo accumulated goes, including the
      registries that are easy to forget because they live outside this class. */
  resetAll(): void {
    this.generation += 1
    this.incidents.clear()
    this.bus = []
    this.transcript = []
    this.detections = []
    this.containedToday = 0
    this.containSeconds.length = 0
    this.surfaces.clear()
    this.rangeStatus = null
    for (const host of ESTATE) this.hosts.set(host.id, { ...host })
    for (const def of ROSTER) {
      this.runtime.set(def.id, {
        id: def.id,
        state: "standby",
        focusIncidentId: null,
        incidentIds: [],
        activity: "Standing by",
        lastMessageAt: null,
        tasksHandled: 0,
        findings: 0,
        tokens: { input: 0, output: 0 },
      })
    }
  }

  /** Push the whole world to every connected client. Used after a reset, where
      incremental events cannot express "forget everything you were shown". */
  broadcastSnapshot(): void {
    this.emit({ kind: "snapshot", at: now(), snapshot: this.snapshot(this.baseUrl) })
  }

  recomputePosture(): void {
    this.emit({ kind: "posture", at: now(), posture: this.posture() })
  }

  snapshot(baseUrl: string): WorldSnapshot {
    return {
      at: now(),
      generation: this.generation,
      mode: this.mode,
      activeProvider: this.activeProvider,
      commanderModel: this.commanderModel,
      specialistModel: this.specialistModel,
      agents: ROSTER,
      runtime: [...this.runtime.values()].map((each) => ({ ...each })),
      cards: ROSTER.map((each) => this.agentCard(each.id, baseUrl)),
      incidents: [...this.incidents.values()].map((each) => ({ ...each })),
      bus: this.bus.slice(-120),
      transcript: this.transcript.slice(-140),
      detections: this.detections.slice(0, 60),
      hosts: [...this.hosts.values()].map((each) => ({ ...each })),
      surfaces: [...this.surfaces.values()].map((each) => ({ ...each })),
      rangeStatus: this.rangeStatus,
      posture: this.posture(),
    }
  }
}

function severityRank(severity: Incident["severity"]): number {
  return severity === "sev1" ? 0 : severity === "sev2" ? 1 : severity === "sev3" ? 2 : 3
}

/** Minimal RFC 6901 write. A2UI data models are shallow by construction. */
function writePointer(target: Record<string, unknown>, pointer: string, value: unknown): void {
  const segments = pointer.split("/").filter(Boolean).map((seg) => seg.replace(/~1/g, "/").replace(/~0/g, "~"))
  if (segments.length === 0) return
  for (const seg of segments) {
    if (seg === "__proto__" || seg === "constructor" || seg === "prototype") return
  }
  let node: Record<string, unknown> = target
  for (const segment of segments.slice(0, -1)) {
    const next = node[segment]
    if (typeof next !== "object" || next === null) node[segment] = {}
    node = node[segment] as Record<string, unknown>
  }
  node[segments[segments.length - 1]!] = value
}

export const store = new Store()
