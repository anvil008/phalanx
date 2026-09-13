import { publishCard, type CardBlock, type CardSpec, type Tone } from "../a2ui/cards.ts"
import { a2aSend } from "../a2a/transport.ts"
import { ROSTER, agentDef } from "../agents/roster.ts"
import type { IncidentPhase } from "../model.ts"
import { store } from "../store.ts"
import { getSource } from "./source.ts"

export interface ToolContext {
  agentId: string
  incidentId: string | null
}

function note(context: ToolContext, text: string, tone: "neutral" | "positive" | "warning" | "negative" | "info" = "neutral"): void {
  if (!context.incidentId) return
  store.appendTimeline(context.incidentId, { actor: context.agentId, text, tone })
}

/* ---- read tools --------------------------------------------------------
   Every read goes through the active telemetry source, so the same tool serves
   the built-in simulation and the live range without the caller knowing which
   one it is talking to. */

export const READ_TOOLS = {
  query_siem: ({ query }: { query: string }) => getSource().siem(query),
  query_edr: ({ host }: { host: string }) => getSource().edr(host),
  query_netflow: ({ host }: { host: string }) => getSource().netflow(host),
  query_dns: ({ domain }: { domain: string }) => getSource().dns(domain),
  query_idp: ({ principal }: { principal: string }) => getSource().idp(principal),
  query_iam: ({ principal }: { principal: string }) => getSource().iam(principal),
  host_timeline: ({ host }: { host: string }) => getSource().hostTimeline(host),
  memory_capture: ({ host }: { host: string }) => getSource().memoryCapture(host),
  pcap_slice: ({ host }: { host: string }) => getSource().pcap(host),
  lookup_cve: ({ id }: { id: string }) => getSource().cve(id),
  lookup_indicator: ({ indicator }: { indicator: string }) => getSource().indicator(indicator),
  query_intel: ({ question }: { question: string }) => getSource().intel(question),
  sbom_scan: ({ product }: { product: string }) => getSource().sbom(product),
  sandbox_repro: ({ target }: { target: string }) => getSource().sandboxRepro(target),
  sandbox_detonate: ({ sample }: { sample: string }) => getSource().detonate(sample),
  read_artifact: ({ path }: { path: string }) => getSource().readArtifact(path),
} as const

/* ---- action tools ------------------------------------------------------ */

export async function isolateHost(context: ToolContext, host: string, justification: string): Promise<string> {
  store.setHostStatus(host, "isolated")
  const result = await getSource().isolateHost(host, justification)
  note(context, `Isolated ${host}. ${justification}`, "warning")
  return result
}

export async function blockEgress(context: ToolContext, indicator: string): Promise<string> {
  const result = await getSource().blockEgress(indicator)
  note(context, `Blocked egress to ${indicator}.`, "positive")
  return result
}

export async function revokeSessions(context: ToolContext, principal: string): Promise<string> {
  const result = await getSource().revokeSessions(principal)
  note(context, `Revoked all sessions and rotated credentials for ${principal}.`, "positive")
  return result
}

export async function revokeConsent(context: ToolContext, app: string): Promise<string> {
  const result = await getSource().revokeConsent(app)
  note(context, `Revoked the consent grant for application ${app}.`, "positive")
  return result
}

export async function deployMitigation(context: ToolContext, target: string, description: string): Promise<string> {
  const result = await getSource().deployMitigation(target, description)
  note(context, `Mitigation deployed to ${target}: ${description}`, "positive")
  return result
}

export async function rebuildHost(context: ToolContext, host: string): Promise<string> {
  store.setHostStatus(host, "restored")
  const result = await getSource().rebuildHost(host)
  note(context, `Rebuilt ${host} from a known-good image.`, "positive")
  return result
}

export async function verifyClosure(context: ToolContext, claim: string): Promise<string> {
  const result = await getSource().verifyClosure(claim)
  note(context, `Closure verified: ${claim}`, result.startsWith("Not verified") ? "warning" : "positive")
  return result
}

export function authorRule(context: ToolContext, name: string, logic: string): string {
  note(context, `Authored detection ${name}.`, "info")
  return `Rule ${name} compiled and backtested against 30 days of telemetry: 4 true positives (all this incident), 0 false positives.\n${logic}`
}

export function deployRule(context: ToolContext, name: string): string {
  note(context, `Deployed detection ${name} to the estate.`, "positive")
  return `${name} live on all collectors. Alerting to the on-call queue with incident context attached.`
}

export function requestAuthorisation(context: ToolContext, action: string, blastRadius: string): string {
  note(context, `Authorisation requested for: ${action}. Blast radius: ${blastRadius}`, "warning")
  return `Authorisation request logged and routed to the commander. Blast radius stated as: ${blastRadius}. Not executing until authorised.`
}

export function draftBrief(context: ToolContext, audience: string, content: string): string {
  note(context, `Drafted a brief for ${audience}.`, "info")
  return `Brief for ${audience} drafted and held for commander review:\n${content}`
}

export function publishStatus(context: ToolContext, text: string): string {
  note(context, `Published external status update.`, "info")
  return `Status page updated: ${text}`
}

export function pageOncall(context: ToolContext, who: string, text: string): string {
  note(context, `Paged ${who}.`, "warning")
  return `${who} paged. Acknowledgement expected within the 5-minute window. Message: ${text}`
}

export function assessObligations(context: ToolContext, dataTypes: string): string {
  note(context, `Assessed notification obligations for: ${dataTypes}`, "warning")
  return (
    `Data types in scope: ${dataTypes}. If customer export objects were read, personal data is implicated. ` +
    "Regulatory clock: 72 hours from the point of becoming aware, which is the timestamp of the first confirmed " +
    "exfiltration finding, not the timestamp of the original alert. Preserve gateway disks, identity-provider logs, " +
    "and object-store audit records before any rebuild."
  )
}

/* ---- coordination ------------------------------------------------------ */

export function discoverAgents(context: ToolContext): string {
  return ROSTER.filter((def) => def.id !== context.agentId)
    .map((def) => {
      const runtime = store.runtime.get(def.id)
      const load = runtime ? `${runtime.incidentIds.length}/${def.capacity}` : "?"
      return [
        `${def.id} — ${def.name} [${def.class}, load ${load}]`,
        `  ${def.summary}`,
        `  delegate when: ${def.delegateWhen}`,
        `  skills: ${def.skills.map((skill) => skill.id).join(", ")}`,
      ].join("\n")
    })
    .join("\n\n")
}

export async function sendToAgent(
  context: ToolContext,
  input: { to: string; objective: string; context?: string; kind?: "task" | "query" | "escalation" | "handoff" },
): Promise<string> {
  const target = ROSTER.find((def) => def.id === input.to)
  if (!target) return `No agent with id ${input.to}. Call a2a_discover for the roster.`

  const kind = input.kind ?? (target.class === "command" ? "escalation" : "task")
  if (context.incidentId && kind !== "escalation") {
    store.assign(context.incidentId, input.to, input.objective)
  }

  const outcome = await a2aSend({
    from: context.agentId,
    to: input.to,
    kind,
    incidentId: context.incidentId,
    summary: input.objective.length > 120 ? `${input.objective.slice(0, 117)}…` : input.objective,
    text: [input.objective, input.context ? `\nContext from ${agentDef(context.agentId).callsign}:\n${input.context}` : ""].join(""),
    data: { objective: input.objective, requestedBy: context.agentId },
  })

  if (context.incidentId) {
    store.setAssignmentState(context.incidentId, input.to, "reporting")
  }
  return outcome.text || "(no content returned)"
}

export function record(context: ToolContext, text: string, tone: "neutral" | "positive" | "warning" | "negative" | "info" = "neutral"): string {
  if (!context.incidentId) return "No incident in scope; nothing recorded."
  store.appendTimeline(context.incidentId, { actor: context.agentId, text, tone })
  return "Recorded on the incident timeline."
}

export function setPhase(context: ToolContext, phase: IncidentPhase, confidence?: number, progress?: number): string {
  if (!context.incidentId) return "No incident in scope."
  store.setPhase(context.incidentId, phase)
  const patch: Record<string, number> = {}
  if (typeof confidence === "number") patch.confidence = Math.max(0, Math.min(100, confidence))
  if (typeof progress === "number") patch.progress = Math.max(0, Math.min(100, progress))
  if (Object.keys(patch).length > 0) store.patchIncident(context.incidentId, patch)
  return `Incident phase set to ${phase}.`
}

export function setStatus(context: ToolContext, status: "open" | "contained" | "resolved"): string {
  if (!context.incidentId) return "No incident in scope."
  store.patchIncident(context.incidentId, status === "resolved" ? { status, progress: 100 } : { status })
  return `Incident status set to ${status}.`
}

export function linkIncidents(context: ToolContext, other: string, reason: string): string {
  if (!context.incidentId) return "No incident in scope."
  const target = [...store.incidents.values()].find((incident) => incident.id === other || incident.code === other)
  if (!target) return `No incident matching ${other}.`
  store.linkIncidents(context.incidentId, target.id, reason)
  return `Linked to ${target.code}: ${reason}`
}

export function publishOperatorCard(
  context: ToolContext,
  input: {
    surface: "mission-control" | "incident"
    cardId: string
    title: string
    kicker?: string
    tone?: Tone
    weight?: number
    blocks: CardBlock[]
  },
): string {
  const surfaceId =
    input.surface === "incident"
      ? context.incidentId
        ? `incident:${context.incidentId}`
        : "mission-control"
      : "mission-control"

  const spec: CardSpec = {
    surfaceId,
    cardId: `${context.incidentId ?? "global"}:${input.cardId}`,
    title: input.title,
    kicker: input.kicker ?? agentDef(context.agentId).callsign,
    tone: input.tone ?? "neutral",
    weight: input.weight ?? 0,
    blocks: input.blocks,
  }
  publishCard(spec)
  return `Card "${input.title}" published to ${surfaceId}.`
}

export function openIncident(
  context: ToolContext,
  input: { code: string; title: string; summary: string; severity: "sev1" | "sev2" | "sev3" | "sev4" },
): string {
  const incident = store.openIncident({
    code: input.code,
    title: input.title,
    summary: input.summary,
    severity: input.severity,
    commanderId: context.agentId,
    scenarioId: "agent-opened",
  })
  return `Opened ${incident.code} (${incident.id}). You now command it.`
}
