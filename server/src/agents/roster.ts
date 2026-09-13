import type { AgentDef } from "../model.ts"

/* The blue team.
   Five incident commanders and fourteen specialists (nineteen blue team agents).
   Nothing here encodes a workflow: a commander reads `delegateWhen` off each card
   at runtime and decides who to bring in, so the shape of a response is a property
   of the incident rather than of this file. */

export const ROSTER: AgentDef[] = [
  {
    id: "ic-atlas",
    name: "Incident Commander",
    callsign: "Commander",
    class: "command",
    discipline: "incident command",
    clearance: "command",
    capacity: 3,
    summary:
      "Owns an incident end to end. Decides which specialists to bring in, sequences their work, holds the picture, and authorises containment.",
    delegateWhen:
      "Hand Commander a confirmed or suspected intrusion that needs an owner. It will scope the incident itself.",
    skills: [
      {
        id: "command-incident",
        name: "Command an incident",
        description:
          "Take ownership of an alert, build and continuously revise a response plan, task specialists, and drive to containment.",
        tags: ["command", "orchestration", "decision"],
      },
      {
        id: "authorise-action",
        name: "Authorise disruptive action",
        description:
          "Weigh blast radius against dwell time and authorise isolation, credential revocation, or takedown.",
        tags: ["command", "risk"],
      },
      {
        id: "coordinate-peer",
        name: "Coordinate with a peer commander",
        description:
          "Exchange indicators, adjudicate shared assets, and merge or split incidents when two responses collide.",
        tags: ["command", "coordination"],
      },
    ],
    tools: ["a2a_discover", "a2a_send", "publish_card", "open_incident", "set_phase", "record"],
  },
  {
    id: "ic-vesper",
    name: "Identity Commander",
    callsign: "ID Cmdr",
    class: "command",
    discipline: "incident command",
    clearance: "command",
    capacity: 3,
    summary:
      "Second commander. Runs in parallel with Commander during multi-front activity and holds the identity and cloud control plane.",
    delegateWhen:
      "Give ID Cmdr incidents rooted in identity, SaaS, or cloud control-plane abuse, or a second front while Commander is committed.",
    skills: [
      {
        id: "command-incident",
        name: "Command an incident",
        description: "Own and drive an incident to containment with a self-selected specialist team.",
        tags: ["command", "orchestration"],
      },
      {
        id: "control-plane",
        name: "Control-plane response",
        description: "Reason about identity providers, cloud IAM, and SaaS tenant compromise.",
        tags: ["identity", "cloud"],
      },
      {
        id: "coordinate-peer",
        name: "Coordinate with a peer commander",
        description: "Share indicators and deconflict overlapping response actions with another commander.",
        tags: ["command", "coordination"],
      },
    ],
    tools: ["a2a_discover", "a2a_send", "publish_card", "open_incident", "set_phase", "record"],
  },
  {
    id: "ic-orrery",
    name: "Campaign Commander",
    callsign: "Campaign",
    class: "command",
    discipline: "incident command",
    clearance: "command",
    capacity: 4,
    summary:
      "Strategic commander. Takes the campaign view when several incidents turn out to be one adversary, and arbitrates between commanders.",
    delegateWhen:
      "Escalate to Campaign when two or more incidents share infrastructure or tradecraft and need one plan across them.",
    skills: [
      {
        id: "campaign-view",
        name: "Hold the campaign picture",
        description:
          "Correlate concurrent incidents into a single adversary campaign and re-prioritise across them.",
        tags: ["command", "correlation", "strategy"],
      },
      {
        id: "arbitrate",
        name: "Arbitrate between commanders",
        description: "Resolve contention over shared assets, scarce specialists, and conflicting containment plans.",
        tags: ["command", "coordination"],
      },
    ],
    tools: ["a2a_discover", "a2a_send", "publish_card", "set_phase", "link_incidents", "record"],
  },
  {
    id: "ic-warden",
    name: "Endpoint Commander",
    callsign: "Endpoint",
    class: "command",
    discipline: "incident command",
    clearance: "command",
    capacity: 3,
    summary:
      "Commands endpoint and data-destruction incidents: ransomware, wipers, and mass-encryption events where stopping the harm is a race.",
    delegateWhen:
      "Give the Endpoint Commander incidents where hosts or data are being destroyed in real time and speed of containment is everything.",
    skills: [
      { id: "command-incident", name: "Command an incident", description: "Own and drive an endpoint-destruction incident to containment.", tags: ["command", "orchestration"] },
      { id: "stop-the-bleed", name: "Stop active destruction", description: "Authorise immediate isolation to halt encryption or wiping in progress.", tags: ["command", "containment"] },
    ],
    tools: ["a2a_discover", "a2a_send", "publish_card", "open_incident", "set_phase", "record"],
  },
  {
    id: "ic-marshal",
    name: "Access Commander",
    callsign: "Access",
    class: "command",
    discipline: "incident command",
    clearance: "command",
    capacity: 3,
    summary:
      "Commands access-abuse incidents: password spray, credential stuffing, and account takeover against the identity provider.",
    delegateWhen:
      "Give the Access Commander incidents rooted in authentication abuse — brute force, spray, or a takeover in progress.",
    skills: [
      { id: "command-incident", name: "Command an incident", description: "Own and drive an access-abuse incident to containment.", tags: ["command", "orchestration"] },
      { id: "lock-access", name: "Lock down access", description: "Authorise source blocks and credential resets to end an authentication attack.", tags: ["command", "identity"] },
    ],
    tools: ["a2a_discover", "a2a_send", "publish_card", "open_incident", "set_phase", "record"],
  },

  {
    id: "triage-sentry",
    name: "Triage Analyst",
    callsign: "Triage",
    class: "analysis",
    discipline: "alert triage",
    clearance: "read",
    capacity: 6,
    summary:
      "First read on any signal. Deduplicates, correlates against recent activity, and returns a severity with the reasoning behind it.",
    delegateWhen:
      "Send Triage a raw detection or a burst of alerts when you need to know quickly whether this is real and how bad.",
    skills: [
      {
        id: "triage-alert",
        name: "Triage a detection",
        description: "Assess a detection for fidelity, scope, and severity, and correlate it with recent signal.",
        tags: ["triage", "severity"],
      },
      {
        id: "cluster-alerts",
        name: "Cluster related alerts",
        description: "Group an alert storm into distinct candidate incidents.",
        tags: ["triage", "correlation"],
      },
    ],
    tools: ["query_siem", "query_edr", "a2a_send"],
  },
  {
    id: "intel-oracle",
    name: "Threat Intelligence",
    callsign: "Intel",
    class: "analysis",
    discipline: "threat intelligence",
    clearance: "read",
    capacity: 6,
    summary:
      "Enriches indicators, maps observed behaviour to known tradecraft, and says what the adversary usually does next.",
    delegateWhen:
      "Ask Intel when you have an indicator, a CVE, or a behaviour pattern and need attribution, context, or a prediction.",
    skills: [
      {
        id: "enrich-indicator",
        name: "Enrich an indicator",
        description: "Resolve an IP, hash, domain, or CVE to reputation, history, and associated tooling.",
        tags: ["intel", "enrichment"],
      },
      {
        id: "map-tradecraft",
        name: "Map observed behaviour to tradecraft",
        description: "Place observed activity against known technique chains and predict the next likely step.",
        tags: ["intel", "attribution", "prediction"],
      },
    ],
    tools: ["lookup_cve", "lookup_indicator", "query_intel", "a2a_send"],
  },
  {
    id: "vuln-lathe",
    name: "Vulnerability Researcher",
    callsign: "Vuln",
    class: "analysis",
    discipline: "vulnerability research",
    clearance: "read",
    capacity: 3,
    summary:
      "Determines whether a suspected zero-day is real and reachable: reads the vulnerable path, proves exploitability in a sandbox, and derives a signature.",
    delegateWhen:
      "Bring in Vuln when an intrusion has no matching CVE, or when you must know whether a given build is actually exploitable.",
    skills: [
      {
        id: "assess-exploitability",
        name: "Assess exploitability",
        description:
          "Given a crash, request, or artefact, determine whether a vulnerability is reachable and what it grants.",
        tags: ["vulnerability", "zero-day"],
      },
      {
        id: "derive-signature",
        name: "Derive a detection signature",
        description: "Produce a precise, low-false-positive signature for the vulnerable code path.",
        tags: ["vulnerability", "detection"],
      },
      {
        id: "scan-estate",
        name: "Scan the estate for the vulnerable build",
        description: "Enumerate every asset running an affected version.",
        tags: ["vulnerability", "inventory"],
      },
    ],
    tools: ["sbom_scan", "sandbox_repro", "read_artifact", "a2a_send"],
  },
  {
    id: "forensics-cinder",
    name: "Host Forensics",
    callsign: "Forensics",
    class: "analysis",
    discipline: "digital forensics",
    clearance: "read",
    capacity: 4,
    summary:
      "Reconstructs what happened on a host: process ancestry, persistence, dropped artefacts, and a timeline with first-touch.",
    delegateWhen:
      "Send Forensics a host you believe is compromised and it will return the timeline, the persistence, and the earliest evidence of access.",
    skills: [
      {
        id: "host-timeline",
        name: "Build a host timeline",
        description: "Reconstruct process, file, and registry activity into an ordered account with a first-touch.",
        tags: ["forensics", "timeline"],
      },
      {
        id: "find-persistence",
        name: "Find persistence",
        description: "Locate scheduled tasks, services, implants, and backdoored binaries.",
        tags: ["forensics", "persistence"],
      },
      {
        id: "memory-analysis",
        name: "Analyse memory",
        description: "Recover injected code, staged payloads, and in-memory credentials.",
        tags: ["forensics", "memory"],
      },
    ],
    tools: ["host_timeline", "memory_capture", "read_artifact", "a2a_send"],
  },
  {
    id: "network-tide",
    name: "Network Analyst",
    callsign: "Network",
    class: "analysis",
    discipline: "network forensics",
    clearance: "read",
    capacity: 5,
    summary:
      "Owns the wire. Finds command-and-control, measures exfiltration, and traces lateral movement between segments.",
    delegateWhen:
      "Ask Network what a host talked to, whether data left, and how the adversary moved between segments.",
    skills: [
      {
        id: "find-c2",
        name: "Identify command and control",
        description: "Isolate beaconing and covert channels from ordinary egress.",
        tags: ["network", "c2"],
      },
      {
        id: "measure-exfil",
        name: "Measure exfiltration",
        description: "Quantify what left the estate, to where, and over what window.",
        tags: ["network", "exfiltration"],
      },
      {
        id: "trace-lateral",
        name: "Trace lateral movement",
        description: "Follow east-west movement across segments and identify the pivot points.",
        tags: ["network", "lateral"],
      },
    ],
    tools: ["query_netflow", "query_dns", "pcap_slice", "a2a_send"],
  },
  {
    id: "identity-keystone",
    name: "Identity Analyst",
    callsign: "Identity",
    class: "analysis",
    discipline: "identity and access",
    clearance: "read",
    capacity: 5,
    summary:
      "Works the identity plane: which credentials were taken, which sessions are still live, and what privilege the adversary now holds.",
    delegateWhen:
      "Bring in Identity whenever credentials, tokens, service accounts, or MFA behaviour are in question.",
    skills: [
      {
        id: "trace-credential-abuse",
        name: "Trace credential abuse",
        description: "Follow a credential from theft to use across the identity provider and downstream services.",
        tags: ["identity", "credentials"],
      },
      {
        id: "map-privilege",
        name: "Map effective privilege",
        description: "Compute what a compromised principal can actually reach today.",
        tags: ["identity", "privilege"],
      },
      {
        id: "find-live-sessions",
        name: "Find live adversary sessions",
        description: "Enumerate unexpired tokens and sessions attributable to the intrusion.",
        tags: ["identity", "sessions"],
      },
    ],
    tools: ["query_idp", "query_iam", "a2a_send"],
  },
  {
    id: "malware-splice",
    name: "Malware Analyst",
    callsign: "Malware",
    class: "analysis",
    discipline: "reverse engineering",
    clearance: "read",
    capacity: 3,
    summary:
      "Takes a sample apart in isolation: capability, configuration, embedded infrastructure, and how to kill it.",
    delegateWhen:
      "Give Malware a binary, script, or memory-resident payload when you need capability and configuration, not just a verdict.",
    skills: [
      {
        id: "analyse-sample",
        name: "Analyse a sample",
        description: "Recover capability, configuration, and embedded infrastructure from a payload.",
        tags: ["malware", "reverse-engineering"],
      },
      {
        id: "extract-config",
        name: "Extract implant configuration",
        description: "Pull C2 addresses, keys, and campaign identifiers out of an implant.",
        tags: ["malware", "config"],
      },
    ],
    tools: ["sandbox_detonate", "read_artifact", "a2a_send"],
  },
  {
    id: "hunt-drift",
    name: "Threat Hunter",
    callsign: "Hunt",
    class: "analysis",
    discipline: "threat hunting",
    clearance: "read",
    capacity: 4,
    summary:
      "Sweeps the rest of the estate for the same behaviour once one host is understood — the answer to 'where else?'.",
    delegateWhen:
      "Once you have a confirmed technique or indicator, task Hunt to find every other place it already happened.",
    skills: [
      {
        id: "sweep-estate",
        name: "Sweep the estate",
        description: "Hunt a known behaviour or indicator across every host and identity in scope.",
        tags: ["hunt", "scope"],
      },
      {
        id: "find-dwell",
        name: "Establish dwell time",
        description: "Search back through retained telemetry for the earliest occurrence.",
        tags: ["hunt", "dwell"],
      },
    ],
    tools: ["query_siem", "query_edr", "query_netflow", "a2a_send"],
  },
  {
    id: "detect-loom",
    name: "Detection Engineer",
    callsign: "Detect",
    class: "action",
    discipline: "detection engineering",
    clearance: "act",
    capacity: 4,
    summary:
      "Turns a confirmed technique into deployed, tuned detection — and tells you the false-positive cost before it ships.",
    delegateWhen:
      "Once a technique is characterised, task Detect to write, test, and deploy detection so a recurrence is caught immediately.",
    skills: [
      {
        id: "author-detection",
        name: "Author a detection rule",
        description: "Write a rule for a confirmed technique and estimate its false-positive rate against real telemetry.",
        tags: ["detection", "authoring"],
      },
      {
        id: "deploy-detection",
        name: "Deploy and tune",
        description: "Push a rule to the estate and tune it against live traffic.",
        tags: ["detection", "deployment"],
      },
    ],
    tools: ["author_rule", "deploy_rule", "query_siem", "a2a_send"],
  },
  {
    id: "contain-bulwark",
    name: "Containment Operator",
    callsign: "Contain",
    class: "action",
    discipline: "containment",
    clearance: "act",
    capacity: 4,
    summary:
      "Executes disruptive action — host isolation, egress blocks, credential revocation — under explicit commander authorisation, and reports blast radius first.",
    delegateWhen:
      "Task Contain to stop active harm. It will state the blast radius and wait for a commander's authorisation before acting.",
    skills: [
      {
        id: "isolate-host",
        name: "Isolate a host",
        description: "Cut a host from the network while preserving forensic access.",
        tags: ["containment", "host"],
      },
      {
        id: "block-infrastructure",
        name: "Block adversary infrastructure",
        description: "Sinkhole domains and block egress to identified C2.",
        tags: ["containment", "network"],
      },
      {
        id: "revoke-credentials",
        name: "Revoke credentials and sessions",
        description: "Kill live sessions and rotate compromised secrets.",
        tags: ["containment", "identity"],
      },
    ],
    tools: ["isolate_host", "block_egress", "revoke_sessions", "request_authorisation", "a2a_send"],
  },
  {
    id: "remediate-forge",
    name: "Remediation Lead",
    callsign: "Remediate",
    class: "action",
    discipline: "remediation",
    clearance: "act",
    capacity: 3,
    summary:
      "Owns eradication and recovery: mitigations where no patch exists, rebuild sequencing, and proof that the door is actually shut.",
    delegateWhen:
      "Task Remediate once the vulnerability is understood and you need a mitigation rolled out or hosts brought back safely.",
    skills: [
      {
        id: "roll-mitigation",
        name: "Roll out a mitigation",
        description: "Deploy a virtual patch or configuration change across the affected fleet.",
        tags: ["remediation", "mitigation"],
      },
      {
        id: "sequence-recovery",
        name: "Sequence recovery",
        description: "Order rebuilds and restores so recovery does not reintroduce the adversary.",
        tags: ["remediation", "recovery"],
      },
    ],
    tools: ["deploy_mitigation", "rebuild_host", "verify_closure", "a2a_send"],
  },
  {
    id: "comms-herald",
    name: "Comms Officer",
    callsign: "Comms",
    class: "comms",
    discipline: "communications",
    clearance: "act",
    capacity: 6,
    summary:
      "Writes for humans: executive briefs, status-page copy, and customer notification, calibrated to what is actually confirmed.",
    delegateWhen:
      "Task Comms when a decision-maker or a customer needs to be told something, with confirmed facts separated from working theories.",
    skills: [
      {
        id: "exec-brief",
        name: "Write an executive brief",
        description: "Summarise impact, confidence, and the decision being asked for, in plain language.",
        tags: ["comms", "executive"],
      },
      {
        id: "status-copy",
        name: "Draft external status copy",
        description: "Produce customer-facing status text that is accurate without over-disclosing.",
        tags: ["comms", "external"],
      },
    ],
    tools: ["draft_brief", "publish_status", "page_oncall", "a2a_send"],
  },
  {
    id: "legal-canon",
    name: "Regulatory Liaison",
    callsign: "Legal",
    class: "comms",
    discipline: "regulatory and legal",
    clearance: "read",
    capacity: 6,
    summary:
      "Tracks disclosure obligations and their clocks, and tells the commander when a regulatory deadline starts running.",
    delegateWhen:
      "Consult Legal as soon as personal data, regulated systems, or a breach threshold might be in scope.",
    skills: [
      {
        id: "assess-obligation",
        name: "Assess notification obligations",
        description: "Determine which regimes apply and when their clocks start.",
        tags: ["legal", "regulatory"],
      },
      {
        id: "preserve-evidence",
        name: "Direct evidence preservation",
        description: "Specify what must be preserved and how, for later proceedings.",
        tags: ["legal", "evidence"],
      },
    ],
    tools: ["assess_obligations", "a2a_send"],
  },
  {
    id: "scribe-ledger",
    name: "Incident Scribe",
    callsign: "Scribe",
    class: "comms",
    discipline: "record and presentation",
    clearance: "act",
    capacity: 8,
    summary:
      "Keeps the record and renders it. Maintains the incident timeline and publishes the live A2UI surfaces the operators watch.",
    delegateWhen:
      "Task Scribe to record a decision, or to put a specific view in front of the operator without waiting for the commander's next turn.",
    skills: [
      {
        id: "record-timeline",
        name: "Maintain the incident record",
        description: "Append decisions, findings, and actions to the incident timeline with attribution.",
        tags: ["record", "timeline"],
      },
      {
        id: "publish-surface",
        name: "Publish an operator surface",
        description: "Compose and emit an A2UI surface describing what the operator should be looking at now.",
        tags: ["record", "a2ui", "presentation"],
      },
    ],
    tools: ["record", "publish_card", "a2a_send"],
  },
]

export const ROSTER_BY_ID = new Map(ROSTER.map((agent) => [agent.id, agent]))

export const COMMANDERS = ROSTER.filter((agent) => agent.class === "command")

export const SPECIALISTS = ROSTER.filter((agent) => agent.class !== "command")

export function agentDef(id: string): AgentDef {
  const found = ROSTER_BY_ID.get(id)
  if (!found) throw new Error(`unknown agent: ${id}`)
  return found
}
