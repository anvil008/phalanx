import type { AgentCard } from "./a2a/types.ts"
import type { A2UIMessage } from "./a2ui/types.ts"

export type AgentClass = "command" | "analysis" | "action" | "comms"

export type AgentState =
  | "offline"
  | "standby"
  | "briefing"
  | "working"
  | "consulting"
  | "reporting"
  | "blocked"
  | "stood-down"

export type Clearance = "read" | "act" | "command"

/** Static definition of one blue-team agent. */
export interface AgentDef {
  id: string
  name: string
  callsign: string
  class: AgentClass
  discipline: string
  clearance: Clearance
  summary: string
  /** Written for the commander to read when it picks who to task. */
  delegateWhen: string
  skills: { id: string; name: string; description: string; tags: string[] }[]
  tools: string[]
  /** How many incidents this agent can hold at once before it is saturated. */
  capacity: number
}

export interface AgentRuntime {
  id: string
  state: AgentState
  /** Incident the agent is currently spending its turn on, if any. */
  focusIncidentId: string | null
  /** Every incident the agent is enrolled in — the multi-incident view needs this. */
  incidentIds: string[]
  activity: string
  lastMessageAt: string | null
  tasksHandled: number
  findings: number
  /** Live token spend, when the agent is a real model session. */
  tokens: { input: number; output: number }
}

export type IncidentSeverity = "sev1" | "sev2" | "sev3" | "sev4"

export type IncidentPhase =
  | "detect"
  | "triage"
  | "investigate"
  | "contain"
  | "eradicate"
  | "recover"
  | "review"

export type IncidentStatus = "open" | "contained" | "resolved" | "standing-down"

export interface IncidentTimelineEntry {
  id: string
  at: string
  actor: string
  actorName: string
  phase: IncidentPhase
  text: string
  tone: "neutral" | "positive" | "warning" | "negative" | "info"
}

export interface Incident {
  id: string
  code: string
  title: string
  summary: string
  severity: IncidentSeverity
  phase: IncidentPhase
  status: IncidentStatus
  /** Agent id of the incident commander that owns this incident. */
  commanderId: string
  scenarioId: string
  openedAt: string
  updatedAt: string
  closedAt: string | null
  /** Hosts, identities and services in scope. */
  assets: string[]
  indicators: string[]
  /** 0..100 — how much of the commander's plan has landed. */
  progress: number
  confidence: number
  /** Agents the commander has enrolled, with what it asked them for. */
  assignments: { agentId: string; objective: string; state: AgentState; at: string }[]
  timeline: IncidentTimelineEntry[]
  surfaceId: string
  /** Incidents this one is linked to, and why. Drives commander-to-commander edges. */
  links: { incidentId: string; reason: string }[]
}

export type A2AMessageKind =
  | "task"
  | "report"
  | "query"
  | "answer"
  | "broadcast"
  | "escalation"
  | "handoff"
  | "operator_query"
  | "commander_reply"

/** One observed hop on the coordination bus. The graph animates these. */
export interface BusMessage {
  id: string
  at: string
  fromAgentId: string
  toAgentId: string | null
  kind: A2AMessageKind
  incidentId: string | null
  taskId: string | null
  summary: string
  /** The literal JSON-RPC envelope, for the protocol trace. */
  envelope: unknown
}

export interface TranscriptEntry {
  id: string
  at: string
  incidentId: string | null
  fromAgentId: string
  toAgentId: string | null
  kind: A2AMessageKind
  text: string
}

export interface Detection {
  id: string
  at: string
  source: string
  host: string
  rule: string
  severity: IncidentSeverity
  detail: string
  incidentId: string | null
}

export interface EstateHost {
  id: string
  name: string
  zone: string
  role: string
  criticality: "critical" | "high" | "normal"
  status: "healthy" | "suspect" | "compromised" | "isolated" | "restored"
}

export interface Surface {
  id: string
  createdAt: string
  updatedAt: string
  messages: A2UIMessage[]
  data: Record<string, unknown>
  components: Record<string, unknown>
  root: string | null
}

export interface WorldSnapshot {
  at: string
  /** Increments on every reset; clients use it to drop derived state. */
  generation: number
  mode: "live" | "replay"
  activeProvider?: string
  commanderModel: string
  specialistModel: string
  agents: AgentDef[]
  runtime: AgentRuntime[]
  cards: AgentCard[]
  incidents: Incident[]
  bus: BusMessage[]
  transcript: TranscriptEntry[]
  detections: Detection[]
  hosts: EstateHost[]
  surfaces: Surface[]
  rangeStatus: RangeStatus | null
  posture: {
    threatLevel: "green" | "amber" | "red" | "black"
    openIncidents: number
    agentsEngaged: number
    meanTimeToContainSec: number | null
    containedToday: number
    busMessagesPerMin: number
  }
}

export interface RangeStatus {
  startedAt: string
  stages?: Record<string, string>
  attackStage: string
  compromisedHosts: string[]
  beaconCount: number
  exfilBytes: number
  consentGrants?: string[]
  mailboxesEnumerated?: number
  enumerationStopped?: boolean
  filesEncrypted?: number
  encryptionStopped?: boolean
  failedLogins?: number
  accountTakeover?: boolean
  bruteforceStopped?: boolean
  isolatedHosts: string[]
  blockedIndicators: string[]
  revokedPrincipals: string[]
  attackComplete: boolean
}

export type PhalanxEvent =
  | { kind: "snapshot"; at: string; snapshot: WorldSnapshot }
  | { kind: "posture"; at: string; posture: WorldSnapshot["posture"] }
  | { kind: "incident.upsert"; at: string; incident: Incident }
  | { kind: "incident.timeline"; at: string; incidentId: string; entry: IncidentTimelineEntry }
  | { kind: "agent.runtime"; at: string; runtime: AgentRuntime }
  | { kind: "bus.message"; at: string; message: BusMessage }
  | { kind: "transcript"; at: string; entry: TranscriptEntry }
  | { kind: "detection"; at: string; detection: Detection }
  | { kind: "host"; at: string; host: EstateHost }
  | { kind: "range"; at: string; status: RangeStatus | null }
  | { kind: "a2ui"; at: string; surfaceId: string; message: A2UIMessage }
  | { kind: "log"; at: string; level: "info" | "warn" | "error"; text: string }

export type EsperEvent = PhalanxEvent

export const SEVERITY_ORDER: Record<IncidentSeverity, number> = {
  sev1: 0,
  sev2: 1,
  sev3: 2,
  sev4: 3,
}

export const PHASES: IncidentPhase[] = [
  "detect",
  "triage",
  "investigate",
  "contain",
  "eradicate",
  "recover",
  "review",
]
