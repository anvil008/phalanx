/* Wire types. Mirrors server/src/model.ts — the two are kept in step by hand
   because the server is a single deployable and a shared package would buy
   nothing here but a build step. */

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

export interface AgentDef {
  id: string
  name: string
  callsign: string
  class: AgentClass
  discipline: string
  clearance: Clearance
  summary: string
  delegateWhen: string
  skills: { id: string; name: string; description: string; tags: string[] }[]
  tools: string[]
  capacity: number
}

export interface AgentRuntime {
  id: string
  state: AgentState
  focusIncidentId: string | null
  incidentIds: string[]
  activity: string
  lastMessageAt: string | null
  tasksHandled: number
  findings: number
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
  commanderId: string
  scenarioId: string
  openedAt: string
  updatedAt: string
  closedAt: string | null
  assets: string[]
  indicators: string[]
  progress: number
  confidence: number
  assignments: { agentId: string; objective: string; state: AgentState; at: string }[]
  timeline: IncidentTimelineEntry[]
  surfaceId: string
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

export interface BusMessage {
  id: string
  at: string
  fromAgentId: string
  toAgentId: string | null
  kind: A2AMessageKind
  incidentId: string | null
  taskId: string | null
  summary: string
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

export interface ComponentSpec {
  id: string
  component: string
  [prop: string]: unknown
}

export type A2UIMessage =
  | { version: string; createSurface: { surfaceId: string; catalogId: string } }
  | { version: string; updateComponents: { surfaceId: string; components: ComponentSpec[] } }
  | { version: string; updateDataModel: { surfaceId: string; path: string; value: unknown } }
  | { version: string; deleteSurface: { surfaceId: string } }

export interface Surface {
  id: string
  createdAt: string
  updatedAt: string
  messages: A2UIMessage[]
  data: Record<string, unknown>
  components: Record<string, ComponentSpec>
  root: string | null
}

export interface RangeStatus {
  startedAt: string
  stages: Record<string, string>
  attackStage: string
  compromisedHosts: string[]
  beaconCount: number
  exfilBytes: number
  consentGrants: string[]
  mailboxesEnumerated: number
  enumerationStopped: boolean
  filesEncrypted: number
  encryptionStopped: boolean
  failedLogins: number
  accountTakeover: boolean
  bruteforceStopped: boolean
  isolatedHosts: string[]
  blockedIndicators: string[]
  revokedPrincipals: string[]
  attackComplete: boolean
}

export interface Posture {
  threatLevel: "green" | "amber" | "red" | "black"
  openIncidents: number
  agentsEngaged: number
  meanTimeToContainSec: number | null
  containedToday: number
  busMessagesPerMin: number
}

export interface AgentCard {
  protocolVersion: string
  name: string
  description: string
  url: string
  version: string
  skills: { id: string; name: string; description: string; tags: string[] }[]
  metadata: { agentId: string; discipline: string; model: string; clearance: Clearance }
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
  posture: Posture
}

export type PhalanxEvent =
  | { kind: "snapshot"; at: string; generation?: number; snapshot: WorldSnapshot }
  | { kind: "posture"; at: string; generation?: number; posture: Posture }
  | { kind: "incident.upsert"; at: string; generation?: number; incident: Incident }
  | { kind: "incident.timeline"; at: string; generation?: number; incidentId: string; entry: IncidentTimelineEntry }
  | { kind: "agent.runtime"; at: string; generation?: number; runtime: AgentRuntime }
  | { kind: "bus.message"; at: string; generation?: number; message: BusMessage }
  | { kind: "transcript"; at: string; generation?: number; entry: TranscriptEntry }
  | { kind: "detection"; at: string; generation?: number; detection: Detection }
  | { kind: "host"; at: string; generation?: number; host: EstateHost }
  | { kind: "range"; at: string; generation?: number; status: RangeStatus | null }
  | { kind: "a2ui"; at: string; generation?: number; surfaceId: string; message: A2UIMessage }
  | { kind: "log"; at: string; generation?: number; level: "info" | "warn" | "error"; text: string }


export interface ProviderModels {
  commander: string
  specialist: string
}

export interface PublicSettings {
  mode: "live" | "replay"
  activeProvider: "gemini" | "anthropic" | "openai" | "replay"
  providers: {
    gemini: { configured: boolean; preview: string }
    anthropic: { configured: boolean; preview: string }
    openai: { configured: boolean; preview: string }
  }
  models: {
    gemini: ProviderModels
    anthropic: ProviderModels
    openai: ProviderModels
  }
}

export const SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  sev1: "SEV 1",
  sev2: "SEV 2",
  sev3: "SEV 3",
  sev4: "SEV 4",
}

export const PHASE_ORDER: IncidentPhase[] = [
  "detect",
  "triage",
  "investigate",
  "contain",
  "eradicate",
  "recover",
  "review",
]

export const CLASS_LABEL: Record<AgentClass, string> = {
  command: "Command",
  analysis: "Analysis",
  action: "Action",
  comms: "Communications",
}
