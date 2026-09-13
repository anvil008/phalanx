import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { agentDef } from "../agents/roster.ts"
import type { IncidentPhase } from "../model.ts"
import * as impl from "./impl.ts"
import type { ToolContext } from "./impl.ts"

/* The tool surface handed to a live agent session.
   Tool names match the `tools` list on each roster entry, so an agent only
   ever sees the instruments its role justifies — the containment operator has
   isolate_host, the analysts do not. */

type ToolServerOptions = Parameters<typeof createSdkMcpServer>[0]
type ToolDef = NonNullable<ToolServerOptions["tools"]>[number]

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] })

const toneEnum = z.enum(["neutral", "info", "positive", "warning", "critical"])
const timelineToneEnum = z.enum(["neutral", "info", "positive", "warning", "negative"])

const blockSchema: z.ZodType<unknown> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string(), tone: toneEnum.optional(), variant: z.enum(["body", "lead", "mono"]).optional() }),
  z.object({
    type: z.literal("metrics"),
    metrics: z.array(z.object({ label: z.string(), value: z.string(), delta: z.string().optional(), tone: toneEnum.optional() })),
  }),
  z.object({
    type: z.literal("keyvalue"),
    rows: z.array(z.object({ label: z.string(), value: z.string(), tone: toneEnum.optional() })),
  }),
  z.object({ type: z.literal("list"), items: z.array(z.string()), ordered: z.boolean().optional(), tone: toneEnum.optional() }),
  z.object({
    type: z.literal("timeline"),
    entries: z.array(z.object({ at: z.string(), actor: z.string(), text: z.string(), tone: toneEnum.optional() })),
  }),
  z.object({ type: z.literal("agents"), agents: z.array(z.object({ id: z.string(), name: z.string(), state: z.string() })) }),
  z.object({ type: z.literal("progress"), label: z.string(), value: z.number(), max: z.number().optional(), tone: toneEnum.optional() }),
  z.object({ type: z.literal("code"), text: z.string(), language: z.string().optional() }),
  z.object({ type: z.literal("badges"), badges: z.array(z.object({ text: z.string(), tone: toneEnum.optional() })) }),
  z.object({
    type: z.literal("actions"),
    actions: z.array(z.object({ label: z.string(), actionId: z.string(), tone: toneEnum.optional() })),
  }),
  z.object({ type: z.literal("divider") }),
]) as z.ZodType<unknown>

function buildAll(context: ToolContext): Record<string, ToolDef> {
  return {
    query_siem: tool(
      "query_siem",
      "Search the SIEM. Free-text; try a host name, a zone, a behaviour, or 'all' for the full retained window.",
      { query: z.string().describe("what to search for") },
      async ({ query }) => text(await impl.READ_TOOLS.query_siem({ query })),
    ),
    query_edr: tool(
      "query_edr",
      "Endpoint telemetry for one host: process ancestry, file writes, and outbound connections.",
      { host: z.string() },
      async ({ host }) => text(await impl.READ_TOOLS.query_edr({ host })),
    ),
    query_netflow: tool(
      "query_netflow",
      "Flow records for one host, including east-west movement and egress volume.",
      { host: z.string() },
      async ({ host }) => text(await impl.READ_TOOLS.query_netflow({ host })),
    ),
    query_dns: tool(
      "query_dns",
      "Resolution history for a domain across the estate, with registration context.",
      { domain: z.string() },
      async ({ domain }) => text(await impl.READ_TOOLS.query_dns({ domain })),
    ),
    query_idp: tool(
      "query_idp",
      "Identity-provider events for one principal: authentications, token issuance, and live sessions.",
      { principal: z.string() },
      async ({ principal }) => text(await impl.READ_TOOLS.query_idp({ principal })),
    ),
    query_iam: tool(
      "query_iam",
      "Effective cloud IAM privilege and role-chain usage for one principal.",
      { principal: z.string() },
      async ({ principal }) => text(await impl.READ_TOOLS.query_iam({ principal })),
    ),
    host_timeline: tool(
      "host_timeline",
      "Reconstruct an ordered account of activity on one host, including first touch and any persistence.",
      { host: z.string() },
      async ({ host }) => text(await impl.READ_TOOLS.host_timeline({ host })),
    ),
    memory_capture: tool(
      "memory_capture",
      "Capture and triage volatile memory on one host.",
      { host: z.string() },
      async ({ host }) => text(await impl.READ_TOOLS.memory_capture({ host })),
    ),
    pcap_slice: tool(
      "pcap_slice",
      "Pull the retained packet slice for one host.",
      { host: z.string() },
      async ({ host }) => text(await impl.READ_TOOLS.pcap_slice({ host })),
    ),
    lookup_cve: tool(
      "lookup_cve",
      "Look up a CVE identifier. Returns 'no record' when the identifier is reserved but unpublished.",
      { id: z.string() },
      async ({ id }) => text(await impl.READ_TOOLS.lookup_cve({ id })),
    ),
    lookup_indicator: tool(
      "lookup_indicator",
      "Reputation and campaign context for an IP, domain, or hash.",
      { indicator: z.string() },
      async ({ indicator }) => text(await impl.READ_TOOLS.lookup_indicator({ indicator })),
    ),
    query_intel: tool(
      "query_intel",
      "Ask the intelligence corpus a question about tradecraft, an actor, or what usually happens next.",
      { question: z.string() },
      async ({ question }) => text(await impl.READ_TOOLS.query_intel({ question })),
    ),
    sbom_scan: tool(
      "sbom_scan",
      "Enumerate every asset running a product, with version and whether it is affected.",
      { product: z.string() },
      async ({ product }) => text(await impl.READ_TOOLS.sbom_scan({ product })),
    ),
    sandbox_repro: tool(
      "sandbox_repro",
      "Attempt to reproduce a suspected vulnerability in an isolated sandbox. Returns whether it is genuinely reachable.",
      { target: z.string().describe("the product, build, or code path to attempt") },
      async ({ target }) => text(await impl.READ_TOOLS.sandbox_repro({ target })),
    ),
    sandbox_detonate: tool(
      "sandbox_detonate",
      "Detonate a sample in isolation and recover its capability and configuration.",
      { sample: z.string() },
      async ({ sample }) => text(await impl.READ_TOOLS.sandbox_detonate({ sample })),
    ),
    read_artifact: tool(
      "read_artifact",
      "Read a collected forensic artefact by path.",
      { path: z.string() },
      async ({ path }) => text(await impl.READ_TOOLS.read_artifact({ path })),
    ),

    isolate_host: tool(
      "isolate_host",
      "Cut a host from the network while preserving forensic access. Disruptive — state the justification.",
      { host: z.string(), justification: z.string() },
      async ({ host, justification }) => text(await impl.isolateHost(context, host, justification)),
    ),
    block_egress: tool(
      "block_egress",
      "Block and sinkhole an adversary IP or domain at the perimeter.",
      { indicator: z.string() },
      async ({ indicator }) => text(await impl.blockEgress(context, indicator)),
    ),
    revoke_sessions: tool(
      "revoke_sessions",
      "Kill live sessions and rotate the secret for a principal.",
      { principal: z.string() },
      async ({ principal }) => text(await impl.revokeSessions(context, principal)),
    ),
    request_authorisation: tool(
      "request_authorisation",
      "Ask the commander to authorise a disruptive action. State the blast radius honestly.",
      { action: z.string(), blastRadius: z.string() },
      async ({ action, blastRadius }) => text(impl.requestAuthorisation(context, action, blastRadius)),
    ),
    deploy_mitigation: tool(
      "deploy_mitigation",
      "Roll a mitigation or virtual patch to a target, canary first.",
      { target: z.string(), description: z.string() },
      async ({ target, description }) => text(await impl.deployMitigation(context, target, description)),
    ),
    rebuild_host: tool(
      "rebuild_host",
      "Rebuild a host from a known-good image predating first touch.",
      { host: z.string() },
      async ({ host }) => text(await impl.rebuildHost(context, host)),
    ),
    verify_closure: tool(
      "verify_closure",
      "Prove a specific claim about the incident being closed, by re-testing it.",
      { claim: z.string() },
      async ({ claim }) => text(await impl.verifyClosure(context, claim)),
    ),
    author_rule: tool(
      "author_rule",
      "Write a detection rule and backtest it against retained telemetry.",
      { name: z.string(), logic: z.string() },
      async ({ name, logic }) => text(impl.authorRule(context, name, logic)),
    ),
    deploy_rule: tool(
      "deploy_rule",
      "Deploy an authored detection rule to every collector.",
      { name: z.string() },
      async ({ name }) => text(impl.deployRule(context, name)),
    ),
    draft_brief: tool(
      "draft_brief",
      "Draft a brief for a named audience. Separate confirmed facts from working theories.",
      { audience: z.string(), content: z.string() },
      async ({ audience, content }) => text(impl.draftBrief(context, audience, content)),
    ),
    publish_status: tool(
      "publish_status",
      "Publish external status-page copy.",
      { text: z.string() },
      async (args) => text(impl.publishStatus(context, args.text)),
    ),
    page_oncall: tool(
      "page_oncall",
      "Page a human on-call rota.",
      { who: z.string(), text: z.string() },
      async ({ who, text: body }) => text(impl.pageOncall(context, who, body)),
    ),
    assess_obligations: tool(
      "assess_obligations",
      "Assess regulatory notification obligations and when their clocks start.",
      { dataTypes: z.string() },
      async ({ dataTypes }) => text(impl.assessObligations(context, dataTypes)),
    ),

    a2a_discover: tool(
      "a2a_discover",
      "List every other agent on the bus with its skills, current load, and the note on when to delegate to it. Call this before deciding who to task.",
      {},
      async () => text(impl.discoverAgents(context)),
    ),
    a2a_send: tool(
      "a2a_send",
      "Send a task or question to another agent over A2A and wait for its answer. Give it everything it needs — the peer cannot see your conversation.",
      {
        to: z.string().describe("target agent id, e.g. forensics-cinder"),
        objective: z.string().describe("one sentence stating exactly what you want back"),
        context: z.string().optional().describe("facts the peer needs and cannot discover on its own"),
        kind: z.enum(["task", "query", "escalation", "handoff"]).optional(),
      },
      async (args) => text(await impl.sendToAgent(context, args)),
    ),
    record: tool(
      "record",
      "Append a decision, finding, or action to the incident timeline.",
      { text: z.string(), tone: timelineToneEnum.optional() },
      async ({ text: body, tone }) => text(impl.record(context, body, tone ?? "neutral")),
    ),
    set_phase: tool(
      "set_phase",
      "Move the incident to a new response phase, optionally updating confidence and progress.",
      {
        phase: z.enum(["detect", "triage", "investigate", "contain", "eradicate", "recover", "review"]),
        confidence: z.number().optional().describe("0-100, how sure you are of the current picture"),
        progress: z.number().optional().describe("0-100, how much of your plan has landed"),
      },
      async ({ phase, confidence, progress }) =>
        text(impl.setPhase(context, phase as IncidentPhase, confidence, progress)),
    ),
    set_status: tool(
      "set_status",
      "Set the incident status. Only mark resolved once closure has been verified.",
      { status: z.enum(["open", "contained", "resolved"]) },
      async ({ status }) => text(impl.setStatus(context, status)),
    ),
    link_incidents: tool(
      "link_incidents",
      "Link this incident to another when they share infrastructure, tradecraft, or an asset.",
      { other: z.string().describe("incident id or code"), reason: z.string() },
      async ({ other, reason }) => text(impl.linkIncidents(context, other, reason)),
    ),
    open_incident: tool(
      "open_incident",
      "Open a new incident under your command when a signal turns out to be a distinct intrusion.",
      { code: z.string(), title: z.string(), summary: z.string(), severity: z.enum(["sev1", "sev2", "sev3", "sev4"]) },
      async (args) => text(impl.openIncident(context, args)),
    ),
    publish_card: tool(
      "publish_card",
      "Put a card in front of the operator. This is the operator's live view — publish when the picture changes materially, and re-publish the same cardId to update a card in place rather than adding a duplicate.",
      {
        surface: z.enum(["mission-control", "incident"]).describe("mission-control is the global view; incident is this incident's page"),
        cardId: z.string().describe("stable id; re-use it to update the card in place"),
        title: z.string(),
        kicker: z.string().optional(),
        tone: toneEnum.optional(),
        weight: z.number().optional().describe("higher sorts nearer the top"),
        blocks: z.array(blockSchema).describe("card body, in order"),
      },
      async (args) => text(impl.publishOperatorCard(context, args as never)),
    ),
  }
}

export function toolServerFor(context: ToolContext) {
  const def = agentDef(context.agentId)
  const all = buildAll(context)
  const selected = def.tools.map((name) => all[name]).filter((each): each is ToolDef => Boolean(each))
  // Every agent can set status on its own work and record what it found.
  const always = [all.record, all.a2a_discover].filter((each): each is ToolDef => Boolean(each))
  const tools = [...new Set([...selected, ...always])]
  return createSdkMcpServer({
    name: "phalanx",
    version: "1.0.0",
    tools,
  })
}

export function toolNamesFor(agentId: string): string[] {
  const def = agentDef(agentId)
  const names = new Set([...def.tools, "record", "a2a_discover"])
  return [...names].map((name) => `mcp__phalanx__${name}`)
}
