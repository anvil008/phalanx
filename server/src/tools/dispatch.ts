import { agentDef } from "../agents/roster.ts"
import type { IncidentPhase } from "../model.ts"
import { WorldResetError } from "../store.ts"
import * as impl from "./impl.ts"
import type { ToolContext } from "./impl.ts"

export interface ToolSchema {
  name: string
  description: string
  parameters: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
  }
}

export const ALL_TOOL_SCHEMAS: Record<string, ToolSchema> = {
  query_siem: {
    name: "query_siem",
    description: "Search the SIEM. Free-text; try a host name, a zone, a behaviour, or 'all' for the full retained window.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "what to search for" } },
      required: ["query"],
    },
  },
  query_edr: {
    name: "query_edr",
    description: "Endpoint telemetry for one host: process ancestry, file writes, and outbound connections.",
    parameters: {
      type: "object",
      properties: { host: { type: "string", description: "hostname to query" } },
      required: ["host"],
    },
  },
  query_netflow: {
    name: "query_netflow",
    description: "Flow records for one host, including east-west movement and egress volume.",
    parameters: {
      type: "object",
      properties: { host: { type: "string", description: "hostname to query" } },
      required: ["host"],
    },
  },
  query_dns: {
    name: "query_dns",
    description: "Resolution history for a domain across the estate, with registration context.",
    parameters: {
      type: "object",
      properties: { domain: { type: "string", description: "domain name to query" } },
      required: ["domain"],
    },
  },
  query_idp: {
    name: "query_idp",
    description: "Identity-provider events for one principal: authentications, token issuance, and live sessions.",
    parameters: {
      type: "object",
      properties: { principal: { type: "string", description: "account or service principal" } },
      required: ["principal"],
    },
  },
  query_iam: {
    name: "query_iam",
    description: "Effective cloud IAM privilege and role-chain usage for one principal.",
    parameters: {
      type: "object",
      properties: { principal: { type: "string", description: "principal name" } },
      required: ["principal"],
    },
  },
  host_timeline: {
    name: "host_timeline",
    description: "Reconstruct an ordered account of activity on one host, including first touch and any persistence.",
    parameters: {
      type: "object",
      properties: { host: { type: "string", description: "hostname to examine" } },
      required: ["host"],
    },
  },
  memory_capture: {
    name: "memory_capture",
    description: "Capture and triage volatile memory on one host.",
    parameters: {
      type: "object",
      properties: { host: { type: "string", description: "hostname" } },
      required: ["host"],
    },
  },
  pcap_slice: {
    name: "pcap_slice",
    description: "Pull the retained packet slice for one host.",
    parameters: {
      type: "object",
      properties: { host: { type: "string", description: "hostname" } },
      required: ["host"],
    },
  },
  lookup_cve: {
    name: "lookup_cve",
    description: "Look up a CVE identifier. Returns 'no record' when the identifier is reserved but unpublished.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "CVE identifier, e.g. CVE-2026-31847" } },
      required: ["id"],
    },
  },
  lookup_indicator: {
    name: "lookup_indicator",
    description: "Reputation and campaign context for an IP, domain, or hash.",
    parameters: {
      type: "object",
      properties: { indicator: { type: "string", description: "IP, domain, or hash" } },
      required: ["indicator"],
    },
  },
  query_intel: {
    name: "query_intel",
    description: "Ask the intelligence corpus a question about tradecraft, an actor, or what usually happens next.",
    parameters: {
      type: "object",
      properties: { question: { type: "string", description: "inquiry for threat intelligence" } },
      required: ["question"],
    },
  },
  sbom_scan: {
    name: "sbom_scan",
    description: "Enumerate every asset running a product, with version and whether it is affected.",
    parameters: {
      type: "object",
      properties: { product: { type: "string", description: "product or package name" } },
      required: ["product"],
    },
  },
  sandbox_repro: {
    name: "sandbox_repro",
    description: "Attempt to reproduce a suspected vulnerability in an isolated sandbox. Returns whether it is genuinely reachable.",
    parameters: {
      type: "object",
      properties: { target: { type: "string", description: "the product, build, or code path to attempt" } },
      required: ["target"],
    },
  },
  sandbox_detonate: {
    name: "sandbox_detonate",
    description: "Detonate a sample in isolation and recover its capability and configuration.",
    parameters: {
      type: "object",
      properties: { sample: { type: "string", description: "artefact or sample reference" } },
      required: ["sample"],
    },
  },
  read_artifact: {
    name: "read_artifact",
    description: "Read a collected forensic artefact by path.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "path to the artefact" } },
      required: ["path"],
    },
  },
  isolate_host: {
    name: "isolate_host",
    description: "Cut a host from the network while preserving forensic access. Disruptive — state the justification.",
    parameters: {
      type: "object",
      properties: {
        host: { type: "string", description: "hostname to isolate" },
        justification: { type: "string", description: "reason for isolation" },
      },
      required: ["host", "justification"],
    },
  },
  block_egress: {
    name: "block_egress",
    description: "Block and sinkhole an adversary IP or domain at the perimeter.",
    parameters: {
      type: "object",
      properties: { indicator: { type: "string", description: "IP or domain" } },
      required: ["indicator"],
    },
  },
  revoke_sessions: {
    name: "revoke_sessions",
    description: "Kill live sessions and rotate the secret for a principal.",
    parameters: {
      type: "object",
      properties: { principal: { type: "string", description: "account or service principal" } },
      required: ["principal"],
    },
  },
  revoke_consent: {
    name: "revoke_consent",
    description: "Revoke OAuth/OIDC consent for a compromised or rogue third-party application.",
    parameters: {
      type: "object",
      properties: { app: { type: "string", description: "application identifier" } },
      required: ["app"],
    },
  },
  deploy_mitigation: {
    name: "deploy_mitigation",
    description: "Roll a mitigation or virtual patch to a target, canary first.",
    parameters: {
      type: "object",
      properties: {
        target: { type: "string", description: "target service or fleet" },
        description: { type: "string", description: "mitigation details" },
      },
      required: ["target", "description"],
    },
  },
  rebuild_host: {
    name: "rebuild_host",
    description: "Rebuild a host from a known-good image predating first touch.",
    parameters: {
      type: "object",
      properties: { host: { type: "string", description: "hostname" } },
      required: ["host"],
    },
  },
  verify_closure: {
    name: "verify_closure",
    description: "Prove a specific claim about the incident being closed, by re-testing it.",
    parameters: {
      type: "object",
      properties: { claim: { type: "string", description: "closure claim to verify" } },
      required: ["claim"],
    },
  },
  author_rule: {
    name: "author_rule",
    description: "Write a detection rule and backtest it against retained telemetry.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "detection rule name" },
        logic: { type: "string", description: "rule logic and parameters" },
      },
      required: ["name", "logic"],
    },
  },
  deploy_rule: {
    name: "deploy_rule",
    description: "Deploy an authored detection rule to every collector.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "rule name" } },
      required: ["name"],
    },
  },
  request_authorisation: {
    name: "request_authorisation",
    description: "Ask the commander to authorise a disruptive action. State the blast radius honestly.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "action requested" },
        blastRadius: { type: "string", description: "anticipated blast radius" },
      },
      required: ["action", "blastRadius"],
    },
  },
  draft_brief: {
    name: "draft_brief",
    description: "Draft a brief for a named audience. Separate confirmed facts from working theories.",
    parameters: {
      type: "object",
      properties: {
        audience: { type: "string", description: "intended audience (e.g. executive, legal)" },
        content: { type: "string", description: "draft text" },
      },
      required: ["audience", "content"],
    },
  },
  publish_status: {
    name: "publish_status",
    description: "Publish external status-page copy.",
    parameters: {
      type: "object",
      properties: { text: { type: "string", description: "status update text" } },
      required: ["text"],
    },
  },
  page_oncall: {
    name: "page_oncall",
    description: "Page a human on-call rota.",
    parameters: {
      type: "object",
      properties: {
        who: { type: "string", description: "team or individual to page" },
        text: { type: "string", description: "paging message" },
      },
      required: ["who", "text"],
    },
  },
  assess_obligations: {
    name: "assess_obligations",
    description: "Assess regulatory notification obligations and when their clocks start.",
    parameters: {
      type: "object",
      properties: { dataTypes: { type: "string", description: "categories of data involved" } },
      required: ["dataTypes"],
    },
  },
  a2a_discover: {
    name: "a2a_discover",
    description: "List every other agent on the bus with its skills, current load, and note on when to delegate to it.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  a2a_send: {
    name: "a2a_send",
    description: "Send a task or question to another agent over A2A and wait for its answer. Give it everything it needs.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "target agent id, e.g. net-trace, forensics-cinder" },
        objective: { type: "string", description: "one sentence stating exactly what you want back" },
        context: { type: "string", description: "facts the peer needs and cannot discover on its own" },
        kind: { type: "string", enum: ["task", "query", "escalation", "handoff"] },
      },
      required: ["to", "objective"],
    },
  },
  record: {
    name: "record",
    description: "Append a decision, finding, or action to the incident timeline.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "timeline entry text" },
        tone: { type: "string", enum: ["neutral", "info", "positive", "warning", "negative"] },
      },
      required: ["text"],
    },
  },
  set_phase: {
    name: "set_phase",
    description: "Move the incident to a new response phase, optionally updating confidence and progress.",
    parameters: {
      type: "object",
      properties: {
        phase: { type: "string", enum: ["detect", "triage", "investigate", "contain", "eradicate", "recover", "review"] },
        confidence: { type: "number", description: "0-100, confidence level" },
        progress: { type: "number", description: "0-100, percentage of plan completed" },
      },
      required: ["phase"],
    },
  },
  set_status: {
    name: "set_status",
    description: "Set the incident status. Only mark resolved once closure has been verified.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "contained", "resolved"] },
      },
      required: ["status"],
    },
  },
  link_incidents: {
    name: "link_incidents",
    description: "Link this incident to another when they share infrastructure, tradecraft, or an asset.",
    parameters: {
      type: "object",
      properties: {
        other: { type: "string", description: "incident id or code" },
        reason: { type: "string", description: "justification for linking" },
      },
      required: ["other", "reason"],
    },
  },
  open_incident: {
    name: "open_incident",
    description: "Open a new incident under your command when a signal turns out to be a distinct intrusion.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "short incident code" },
        title: { type: "string", description: "incident title" },
        summary: { type: "string", description: "preliminary summary" },
        severity: { type: "string", enum: ["sev1", "sev2", "sev3", "sev4"] },
      },
      required: ["code", "title", "summary", "severity"],
    },
  },
  publish_card: {
    name: "publish_card",
    description: "Put a card in front of the human operator on Mission Control or the Incident page.",
    parameters: {
      type: "object",
      properties: {
        surface: { type: "string", enum: ["mission-control", "incident"] },
        cardId: { type: "string", description: "stable id to update in place" },
        title: { type: "string", description: "card title" },
        kicker: { type: "string", description: "card category/kicker" },
        tone: { type: "string", enum: ["neutral", "info", "positive", "warning", "critical"] },
        weight: { type: "number", description: "display sorting weight" },
        blocks: {
          type: "array",
          description: "list of block elements",
          items: { type: "object" },
        },
      },
      required: ["surface", "cardId", "title", "blocks"],
    },
  },
}

export function getToolsForAgent(agentId: string): ToolSchema[] {
  const def = agentDef(agentId)
  const names = new Set([...def.tools, "record", "a2a_discover"])
  const result: ToolSchema[] = []
  for (const name of names) {
    const schema = ALL_TOOL_SCHEMAS[name]
    if (schema) result.push(schema)
  }
  return result
}

export async function executeTool(context: ToolContext, name: string, args: Record<string, unknown>): Promise<string> {
  const cleanName = name.replace(/^mcp__esper__/, "").replace(/^mcp__phalanx__/, "")

  try {
    switch (cleanName) {
      case "query_siem":
        return await impl.READ_TOOLS.query_siem({ query: String(args.query ?? "all") })
      case "query_edr":
        return await impl.READ_TOOLS.query_edr({ host: String(args.host ?? "") })
      case "query_netflow":
        return await impl.READ_TOOLS.query_netflow({ host: String(args.host ?? "") })
      case "query_dns":
        return await impl.READ_TOOLS.query_dns({ domain: String(args.domain ?? "") })
      case "query_idp":
        return await impl.READ_TOOLS.query_idp({ principal: String(args.principal ?? "") })
      case "query_iam":
        return await impl.READ_TOOLS.query_iam({ principal: String(args.principal ?? "") })
      case "host_timeline":
        return await impl.READ_TOOLS.host_timeline({ host: String(args.host ?? "") })
      case "memory_capture":
        return await impl.READ_TOOLS.memory_capture({ host: String(args.host ?? "") })
      case "pcap_slice":
        return await impl.READ_TOOLS.pcap_slice({ host: String(args.host ?? "") })
      case "lookup_cve":
        return await impl.READ_TOOLS.lookup_cve({ id: String(args.id ?? "") })
      case "lookup_indicator":
        return await impl.READ_TOOLS.lookup_indicator({ indicator: String(args.indicator ?? "") })
      case "query_intel":
        return await impl.READ_TOOLS.query_intel({ question: String(args.question ?? "") })
      case "sbom_scan":
        return await impl.READ_TOOLS.sbom_scan({ product: String(args.product ?? "") })
      case "sandbox_repro":
        return await impl.READ_TOOLS.sandbox_repro({ target: String(args.target ?? "") })
      case "sandbox_detonate":
        return await impl.READ_TOOLS.sandbox_detonate({ sample: String(args.sample ?? "") })
      case "read_artifact":
        return await impl.READ_TOOLS.read_artifact({ path: String(args.path ?? "") })

      case "isolate_host":
        return await impl.isolateHost(context, String(args.host ?? ""), String(args.justification ?? "Host isolation"))
      case "block_egress":
        return await impl.blockEgress(context, String(args.indicator ?? ""))
      case "revoke_sessions":
        return await impl.revokeSessions(context, String(args.principal ?? ""))
      case "revoke_consent":
        return await impl.revokeConsent(context, String(args.app ?? ""))
      case "deploy_mitigation":
        return await impl.deployMitigation(context, String(args.target ?? ""), String(args.description ?? ""))
      case "rebuild_host":
        return await impl.rebuildHost(context, String(args.host ?? ""))
      case "verify_closure":
        return await impl.verifyClosure(context, String(args.claim ?? ""))
      case "author_rule":
        return impl.authorRule(context, String(args.name ?? ""), String(args.logic ?? ""))
      case "deploy_rule":
        return impl.deployRule(context, String(args.name ?? ""))
      case "request_authorisation":
        return impl.requestAuthorisation(context, String(args.action ?? ""), String(args.blastRadius ?? "Unknown"))
      case "draft_brief":
        return impl.draftBrief(context, String(args.audience ?? "Leadership"), String(args.content ?? ""))
      case "publish_status":
        return impl.publishStatus(context, String(args.text ?? ""))
      case "page_oncall":
        return impl.pageOncall(context, String(args.who ?? "Incident Response"), String(args.text ?? ""))
      case "assess_obligations":
        return impl.assessObligations(context, String(args.dataTypes ?? "Telemetry"))

      case "a2a_discover":
        return impl.discoverAgents(context)
      case "a2a_send":
        return await impl.sendToAgent(context, {
          to: String(args.to ?? ""),
          objective: String(args.objective ?? ""),
          context: args.context ? String(args.context) : undefined,
          kind: (args.kind as "task" | "query" | "escalation" | "handoff") ?? undefined,
        })
      case "record":
        return impl.record(context, String(args.text ?? ""), (args.tone as "neutral" | "info" | "positive" | "warning" | "negative") ?? "neutral")
      case "set_phase":
        return impl.setPhase(
          context,
          args.phase as IncidentPhase,
          typeof args.confidence === "number" ? args.confidence : undefined,
          typeof args.progress === "number" ? args.progress : undefined,
        )
      case "set_status":
        return impl.setStatus(context, (args.status as "open" | "contained" | "resolved") ?? "open")
      case "link_incidents":
        return impl.linkIncidents(context, String(args.other ?? ""), String(args.reason ?? ""))
      case "open_incident":
        return impl.openIncident(context, {
          code: String(args.code ?? "INC-X"),
          title: String(args.title ?? "New Incident"),
          summary: String(args.summary ?? ""),
          severity: (args.severity as "sev1" | "sev2" | "sev3" | "sev4") ?? "sev3",
        })
      case "publish_card":
        return impl.publishOperatorCard(context, args as never)

      default:
        return `Unknown tool: ${cleanName}`
    }
  } catch (error) {
    if (error instanceof WorldResetError) throw error
    return `Tool execution error (${cleanName}): ${error instanceof Error ? error.message : String(error)}`
  }
}
