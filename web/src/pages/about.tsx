import { useState, useMemo, type CSSProperties, type ReactNode } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Check, Copy } from "lucide-react"
import { Button } from "@foundry/ui/components/button"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { SegmentedControl } from "@foundry/ui/components/segmented-control"
import { usePhalanx } from "@/lib/store"
import { ClaudeLogo, GeminiLogo, OpenAILogo } from "@/components/provider-logos"

/* How this works.
   An essay, laid out like the writing on the site it borrows its language
   from: a numbered eyebrow, a serif heading, a column of prose at 62ch, and
   hairline rows wherever the argument turns into a list. */

const HEADING: CSSProperties = { fontWeight: 300, fontSize: "clamp(1.75rem, 3vw, 2.5rem)" }
const BODY: CSSProperties = { fontSize: "1rem" }

/* --------------------------------------------------------------------------
   CODE VIEWER
   -------------------------------------------------------------------------- */

interface CodeSnippetViewerProps {
  title: string
  subtitle?: string
  badgeText: string
  code: string
}

function CodeSnippetViewer({ title, subtitle, badgeText, code }: CodeSnippetViewerProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard fallback
    }
  }

  // Three token colours: the key, the value, everything else.
  const renderFormattedLine = (line: string) => {
    const keyMatch = line.match(/^(\s*)("([^"]+)")(\s*:\s*)(.*)$/)
    if (keyMatch) {
      const [, indent, , key, colon, value] = keyMatch
      return (
        <span>
          {indent}
          <span className="text-accent-indigo">"{key}"</span>
          <span className="text-muted-soft">{colon}</span>
          {renderValueTokens(value)}
        </span>
      )
    }
    return <span>{renderValueTokens(line)}</span>
  }

  const renderValueTokens = (val: string) => {
    if (val.startsWith('"') && (val.endsWith('",') || val.endsWith('"'))) {
      const isComma = val.endsWith(",")
      const strContent = isComma ? val.slice(0, -1) : val
      return (
        <>
          <span className="text-ink-soft">{strContent}</span>
          {isComma && <span className="text-muted-soft">,</span>}
        </>
      )
    }
    if (/^\s*(true|false|null)\s*,?\s*$/.test(val) || /^\s*-?\d+(\.\d+)?\s*,?\s*$/.test(val)) {
      return <span className="text-ink-soft">{val}</span>
    }
    return <span className="text-muted-foreground">{val}</span>
  }

  const lines = code.trim().split("\n")

  return (
    <div className="border border-rule">
      <div className="flex items-center justify-between gap-3 border-b border-rule-soft px-3 py-2">
        <div className="meta-mono flex min-w-0 items-center gap-2">
          <span className="truncate text-ink!">{title}</span>
          {subtitle ? <span className="hidden truncate sm:inline">· {subtitle}</span> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="sev-tag" data-tone="info">
            {badgeText}
          </span>
          <Button size="xs" variant="ghost" onClick={handleCopy} className="gap-1" title="Copy to clipboard">
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </Button>
        </div>
      </div>

      <div className="max-h-[32rem] select-text overflow-auto p-3 font-mono text-[0.75rem] leading-relaxed">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx}>
                <td className="w-8 select-none pr-3 text-right text-muted-soft">{idx + 1}</td>
                <td className="whitespace-pre">{renderFormattedLine(line)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------------
   DATA CATALOG & DICTIONARIES
   -------------------------------------------------------------------------- */

const NAV_SECTIONS = [
  { id: "overview", label: "Executive overview" },
  { id: "architecture", label: "Architecture" },
  { id: "unscripted-orchestration", label: "Unscripted command" },
  { id: "a2a-protocol", label: "A2A protocol" },
  { id: "a2ui-catalog", label: "A2UI surfaces" },
  { id: "tool-estate", label: "Tool estate" },
  { id: "model-support", label: "Models & replay" },
  { id: "comparison", label: "Swarm vs SOAR" },
]

interface ToolSpec {
  name: string
  category: "telemetry" | "forensics" | "intel" | "sandbox" | "containment" | "detection" | "command" | "governance"
  clearance: "read" | "act" | "command"
  description: string
  agents: string[]
}

const TOOL_SPECS: ToolSpec[] = [
  // Telemetry & Sensors
  { name: "query_siem", category: "telemetry", clearance: "read", description: "Free-text historical log searches across all retained enterprise telemetry.", agents: ["triage-sentry", "hunt-drift"] },
  { name: "query_edr", category: "telemetry", clearance: "read", description: "Endpoint telemetry: process tree ancestry, thread injection, and local file modifications.", agents: ["forensics-cinder", "hunt-drift"] },
  { name: "query_netflow", category: "telemetry", clearance: "read", description: "Session flow records: east-west lateral movement and outbound perimeter egress volumes.", agents: ["network-tide"] },
  { name: "query_dns", category: "telemetry", clearance: "read", description: "Domain resolution queries across internal resolvers, DNS tunnel detection, and WHOIS age.", agents: ["network-tide", "intel-oracle"] },
  { name: "query_idp", category: "telemetry", clearance: "read", description: "Identity provider authentication events, MFA prompts, and live OAuth session tokens.", agents: ["identity-keystone", "ic-vesper"] },
  { name: "query_iam", category: "telemetry", clearance: "read", description: "Cloud IAM role assignments, cross-account policy evaluations, and assume-role chains.", agents: ["identity-keystone", "cloud-stratus"] },

  // Deep Forensics
  { name: "host_timeline", category: "forensics", clearance: "read", description: "Chronological reconstruction of host activity from first adversary touch through persistence.", agents: ["forensics-cinder"] },
  { name: "memory_capture", category: "forensics", clearance: "read", description: "Triage volatile memory dumps for unbacked memory pages, injected DLLs, and in-memory tokens.", agents: ["forensics-cinder"] },
  { name: "pcap_slice", category: "forensics", clearance: "read", description: "Extraction of raw network packet streams for payload carving and protocol inspection.", agents: ["network-tide"] },
  { name: "read_artifact", category: "forensics", clearance: "read", description: "Read forensic disk artifacts, staged payloads, and carved binaries from quarantined storage.", agents: ["forensics-cinder", "malware-splice"] },
  { name: "hunt_drift", category: "forensics", clearance: "read", description: "Fleet-wide sweep for anomalous registry entries, scheduled tasks, and persistence mechanisms.", agents: ["hunt-drift"] },

  // Threat Intel & Vulnerabilities
  { name: "lookup_cve", category: "intel", clearance: "read", description: "Vulnerability catalog lookups for CVSS severity, exploitability status, and public PoCs.", agents: ["vuln-lathe"] },
  { name: "lookup_indicator", category: "intel", clearance: "read", description: "Threat reputation lookups for malicious IPs, domains, and SHA-256 hashes.", agents: ["intel-oracle"] },
  { name: "query_intel", category: "intel", clearance: "read", description: "Semantic queries into threat intelligence corpus covering actor tradecraft and campaign TTPs.", agents: ["intel-oracle"] },
  { name: "sbom_scan", category: "intel", clearance: "read", description: "Software Bill of Materials (SBOM) queries for affected library versions across all host images.", agents: ["vuln-lathe"] },

  // Dynamic Sandboxing
  { name: "sandbox_repro", category: "sandbox", clearance: "read", description: "Reproduce suspected zero-day vulnerabilities in a hardware-isolated sandbox environment.", agents: ["vuln-lathe"] },
  { name: "sandbox_detonate", category: "sandbox", clearance: "act", description: "Detonate unvetted malware binaries in an instrumentation sandbox to extract C2 and configs.", agents: ["malware-splice"] },

  // Containment & Actuation
  { name: "isolate_host", category: "containment", clearance: "act", description: "Sever host from network interfaces while preserving out-of-band forensic telemetry access.", agents: ["contain-bulwark", "ic-warden"] },
  { name: "block_egress", category: "containment", clearance: "act", description: "Dynamically push firewall drop rules and sinkhole DNS records for external C2 indicators.", agents: ["contain-bulwark"] },
  { name: "revoke_sessions", category: "containment", clearance: "act", description: "Invalidate active OAuth/SAML tokens and trigger mandatory password/credential rotation.", agents: ["identity-keystone", "ic-marshal"] },
  { name: "revoke_consent", category: "containment", clearance: "act", description: "Revoke third-party OAuth application consent grants across Okta and Google Workspace.", agents: ["identity-keystone"] },
  { name: "deploy_mitigation", category: "containment", clearance: "act", description: "Roll virtual patches, WAF rules, or rate limits with canary deployment validation.", agents: ["contain-bulwark", "cloud-stratus"] },
  { name: "rebuild_host", category: "containment", clearance: "act", description: "Tear down compromised compute instances and re-provision from immutable golden baseline.", agents: ["remedy-anvil"] },

  // Detection & Assurance
  { name: "author_rule", category: "detection", clearance: "read", description: "Synthesize Sigma or YARA detection rules from incident telemetry and threat tradecraft.", agents: ["detect-loom"] },
  { name: "deploy_rule", category: "detection", clearance: "act", description: "Promote backtested detection rules into live collector pipelines across all SIEM agents.", agents: ["detect-loom"] },
  { name: "verify_closure", category: "detection", clearance: "read", description: "Run automated re-attack simulations to prove remediation of the root exploit vector.", agents: ["verify-anchor"] },

  // Incident Command & Orchestration
  { name: "a2a_discover", category: "command", clearance: "command", description: "Inspect active agent capability cards, skills, current queue load, and delegation guidance.", agents: ["ic-atlas", "ic-vesper", "ic-orrery", "ic-warden", "ic-marshal"] },
  { name: "a2a_send", category: "command", clearance: "command", description: "Dispatch task delegations, queries, and escalations over JSON-RPC 2.0 to peer agents.", agents: ["ic-atlas", "ic-vesper", "ic-orrery", "ic-warden", "ic-marshal"] },
  { name: "open_incident", category: "command", clearance: "command", description: "Formally declare a new incident response command structure with severity and scope.", agents: ["ic-atlas", "ic-vesper"] },
  { name: "set_phase", category: "command", clearance: "command", description: "Transition incident lifecycle state (triage -> investigate -> contain -> eradicate -> recover).", agents: ["ic-atlas", "ic-vesper"] },
  { name: "set_status", category: "command", clearance: "command", description: "Update incident status between open, contained, and formally verified resolved.", agents: ["ic-atlas", "ic-vesper"] },
  { name: "link_incidents", category: "command", clearance: "command", description: "Establish associative links between related incidents sharing adversary infrastructure.", agents: ["ic-orrery"] },
  { name: "record", category: "command", clearance: "read", description: "Append formal findings, hypotheses, and forensic evidence to immutable incident timeline.", agents: ["ic-atlas", "ic-vesper", "ic-warden", "ic-marshal"] },

  // Governance & Stakeholder Comms
  { name: "request_authorisation", category: "governance", clearance: "read", description: "Submit high-blast-radius containment actions to human commander for explicit approval.", agents: ["contain-bulwark", "remedy-anvil"] },
  { name: "draft_brief", category: "governance", clearance: "read", description: "Draft technical summaries and legal briefs separating facts from hypotheses.", agents: ["comms-herald"] },
  { name: "publish_status", category: "governance", clearance: "act", description: "Publish vetted public status updates with sanitized operational impact summaries.", agents: ["comms-herald"] },
  { name: "assess_obligations", category: "governance", clearance: "read", description: "Evaluate GDPR, SEC 4-day, and HIPAA regulatory disclosure clocks against compromised data.", agents: ["legal-scout"] },
]

const TOOL_CATEGORIES = [
  { id: "all", label: "All instruments (37)" },
  { id: "telemetry", label: "Telemetry & sensors (6)" },
  { id: "forensics", label: "Deep forensics (5)" },
  { id: "intel", label: "Threat intel (4)" },
  { id: "sandbox", label: "Sandboxing (2)" },
  { id: "containment", label: "Containment (6)" },
  { id: "detection", label: "Detection (3)" },
  { id: "command", label: "Command (7)" },
  { id: "governance", label: "Governance (4)" },
]

const CLEARANCE_TONE: Record<ToolSpec["clearance"], string> = {
  command: "info",
  act: "warning",
  read: "muted",
}

/* --------------------------------------------------------------------------
   JSON CODE SAMPLES FOR A2A PROTOCOL & A2UI
   -------------------------------------------------------------------------- */

const CODE_AGENT_CARD = `{
  "protocolVersion": "0.3",
  "name": "Host Forensics Specialist",
  "url": "http://localhost:3000/api/a2a/agents/forensics-cinder",
  "version": "1.0.0",
  "provider": {
    "organization": "Phalanx Autonomous Defense",
    "url": "https://github.com/phalanx-swarm"
  },
  "capabilities": {
    "streaming": true,
    "pushNotifications": true,
    "extendedAgentCard": true
  },
  "defaultInputModes": ["application/json", "text/plain"],
  "defaultOutputModes": ["application/json", "text/plain"],
  "skills": [
    {
      "id": "host-timeline",
      "name": "Reconstruct Host Timeline",
      "description": "Chronological reconstruction of host execution, process ancestry, and file mutations.",
      "tags": ["forensics", "timeline", "edr"]
    },
    {
      "id": "memory-analysis",
      "name": "Volatile RAM Triage",
      "description": "Extract in-memory DLL hooks, decrypted stagers, and credentials from volatile memory dumps.",
      "tags": ["memory", "malware", "stager"]
    }
  ],
  "metadata": {
    "agentId": "forensics-cinder",
    "discipline": "endpoint forensics",
    "model": "gemini-3.8-flash",
    "clearance": "read"
  }
}`

const CODE_A2A_REQUEST = `{
  "jsonrpc": "2.0",
  "id": "rpc-9142",
  "method": "message/send",
  "params": {
    "message": {
      "messageId": "msg_04a8f1b2",
      "contextId": "ctx_inc8841",
      "taskId": "task_mem_dump",
      "role": "ROLE_AGENT",
      "parts": [
        {
          "text": "Capture volatile memory on app-api-21. Triage for injected stagers, extract active C2 beacon sockets, and recover any cleartext service credentials."
        }
      ],
      "metadata": {
        "fromAgentId": "ic-atlas",
        "incidentId": "inc-8841",
        "kind": "task"
      }
    }
  }
}`

const CODE_A2A_RESPONSE = `{
  "jsonrpc": "2.0",
  "id": "rpc-9142",
  "result": {
    "id": "task_mem_dump",
    "contextId": "ctx_inc8841",
    "status": {
      "state": "TASK_STATE_COMPLETED",
      "timestamp": "2026-09-12T20:54:18Z",
      "message": {
        "messageId": "msg_f7c19d30",
        "role": "ROLE_AGENT",
        "parts": [
          {
            "text": "Captured 4.2 GB memory on app-api-21. Identified in-memory ELF stager hooked into libedgetls.so. Found cleartext deploy token for svc-deploy and established C2 beacon socket to 185.121.44.19:443."
          },
          {
            "data": {
              "host": "app-api-21",
              "implant": "libedgetls-stager",
              "c2_endpoint": "185.121.44.19:443",
              "compromised_account": "svc-deploy",
              "verdict": "malicious"
            }
          }
        ]
      }
    },
    "artifacts": [
      {
        "artifactId": "art_stager_bin",
        "name": "app-api-21-stager.bin",
        "parts": [
          { "text": "ELF 64-bit LSB shared object, x86-64, stripped. Hooked SSL_read/SSL_write." }
        ]
      }
    ]
  }
}`

const CODE_A2UI_PAYLOAD = `{
  "version": "v0.9",
  "updateComponents": {
    "surfaceId": "incident-inc-8841",
    "components": [
      {
        "id": "containment-card",
        "component": "Card",
        "title": "Immediate Containment Required",
        "kicker": "CRITICAL ACTION",
        "tone": "critical",
        "child": {
          "component": "Column",
          "gap": "3",
          "children": [
            {
              "component": "MetricRow",
              "metrics": [
                { "label": "Threat Vector", "value": "C2 Beacon Active", "tone": "critical" },
                { "label": "Target Host", "value": "app-api-21", "tone": "warning" },
                { "label": "Blast Radius", "value": "Single Service Pod", "tone": "info" }
              ]
            },
            {
              "component": "Text",
              "variant": "body",
              "text": "Adversary implant actively communicating with external C2 185.121.44.19. Containment operator recommends network isolation."
            },
            {
              "component": "ActionRow",
              "children": [
                {
                  "component": "Action",
                  "label": "Authorize Host Isolation",
                  "actionId": "auth-isolate-app-api-21",
                  "tone": "critical"
                }
              ]
            }
          ]
        }
      }
    ]
  }
}`

/* --------------------------------------------------------------------------
   MAIN COMPONENT
   -------------------------------------------------------------------------- */

export function AboutPage() {
  const navigate = useNavigate()
  const state = usePhalanx()

  const [a2aTab, setA2aTab] = useState<"card" | "request" | "response">("card")
  const [toolCategory, setToolCategory] = useState<string>("all")
  const [activeModelTab, setActiveModelTab] = useState<"gemini" | "claude" | "openai" | "replay">("gemini")

  const filteredTools = useMemo(() => {
    if (toolCategory === "all") return TOOL_SPECS
    return TOOL_SPECS.filter((tool) => tool.category === toolCategory)
  }, [toolCategory])

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <PageContent className="phalanx-page-scroll-fade">
      <PageHeader
        title="Architecture & Mechanics"
        subtitle={state.mode === "live" ? `active swarm · ${state.commanderModel}` : "replay · simulated estate"}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate("/protocol")}>
              <span className="hidden sm:inline">Inspect bus trace</span>
              <span className="sm:hidden">Bus trace</span>
            </Button>
            <Button size="sm" className="button-ink" onClick={() => navigate("/")}>
              Launch Mission Control
            </Button>
          </div>
        }
      />

      {/* In-page contents: a quiet mono list, not a chip rail. */}
      {/* -top-5 cancels the page gutter so the bar sits flush with the chrome when stuck. */}
      <nav className="sticky -top-5 z-20 -mx-5 -mt-2 mb-4 border-b border-rule-soft bg-page px-5 py-2.5">
        <div className="no-scrollbar meta-mono flex items-center gap-x-2 overflow-x-auto">
          {NAV_SECTIONS.map((sec, idx) => (
            <span key={sec.id} className="flex shrink-0 items-center gap-2">
              {idx > 0 ? <span className="text-muted-soft">·</span> : null}
              <button
                type="button"
                onClick={() => scrollToSection(sec.id)}
                className="whitespace-nowrap transition-colors hover:text-ink!"
              >
                {sec.label}
              </button>
            </span>
          ))}
        </div>
      </nav>

      <div className="flex w-full max-w-5xl flex-col gap-16 pb-20">
        <p className="meta-mono">19 agents · 37 tools · A2A JSON-RPC 2.0 · A2UI</p>

        {/* ---------------------------------------------------------------- 01 */}
        <Section
          id="overview"
          number="01"
          eyebrow="Executive overview"
          meta="Core thesis"
          title="Autonomous blue-team swarms against real-time intrusions"
        >
          <p className="prose-serif max-w-[62ch]" style={BODY}>
            Modern cyber attacks execute at machine speed. Threat actors use automated recon, in-memory
            process injection, zero-day chains, and stolen OAuth tokens to compromise infrastructure in
            minutes. Meanwhile, human security operations centres remain throttled by alert fatigue,
            context switching, and rigid SOAR scripts that break the moment an adversary deviates from
            a pre-scripted playbook.
          </p>

          <dl className="flex flex-col">
            <DefRow term="The paradigm shift">
              Phalanx abandons fixed DAG workflows. Incident commanders are LLM agents equipped with
              open-ended diagnostic tools, reasoning loops, and dynamic discovery, so they can form and
              test hypotheses in real time.
            </DefRow>
            <DefRow term="Decentralized mesh">
              No central orchestration bottleneck. Agents collaborate peer-to-peer over Google’s
              Agent2Agent (A2A) protocol. Forensics specialists consult network analysts directly
              without routing round-trips through the commander.
            </DefRow>
            <DefRow term="Epistemic isolation">
              Zero ground-truth contamination. The blue team has no backdoor into the attack
              generator’s internal state. Every finding, indicator, and containment action is derived
              from simulated enterprise telemetry.
            </DefRow>
          </dl>
        </Section>

        {/* ---------------------------------------------------------------- 02 */}
        <Section
          id="architecture"
          number="02"
          eyebrow="System design"
          meta="Four decoupled tiers"
          title="A four-tier pipeline from telemetry to interface"
        >
          <p className="prose-serif max-w-[62ch]" style={BODY}>
            Phalanx separates raw security telemetry, cognitive reasoning, decentralized agent
            communication, and safe UI generation into four self-contained tiers.
          </p>

          <div className="flex flex-col">
            <TierRow
              number="01"
              title="Telemetry & simulated estate"
              lede="High-fidelity synthetic sensors and sandboxed actuators"
              tags={["EDR process trees", "NetFlow & PCAP", "CloudTrail & IDP", "Memory triage"]}
            >
              Provides continuous synthetic sensor event streams without touching live infrastructure.
              Includes 37 instruments ranging from SIEM free-text search to volatile RAM extraction, as
              well as safe actuators that sever network adapters, sinkhole IP blocks, rotate
              credentials, and rebuild hosts from golden images.
            </TierRow>

            <TierRow
              number="02"
              title="Cognitive blue specialist swarm"
              lede="19 autonomous defence operators with scoped clearance"
              tags={["5 commanders", "8 analysts", "3 response ops", "3 governance"]}
            >
              Domain-specific operators: incident commanders (Atlas, Vesper, Orrery, Warden, Marshal),
              forensics (Cinder), network (Tide), malware reversing (Splice), threat intel (Oracle),
              exploitability (Lathe), threat hunting (Drift), containment (Bulwark), and detection
              engineering (Loom). Each agent is provisioned only with tools fitting its clearance.
            </TierRow>

            <TierRow
              number="03"
              title="Agent2Agent (A2A) coordination bus"
              lede="Decentralized JSON-RPC 2.0 communication mesh"
              tags={["JSON-RPC 2.0", "Google A2A v0.3", "Agent cards", "Peer-to-peer"]}
            >
              Every agent exposes an HTTP discovery card at{" "}
              <code className="font-mono text-[0.8125rem] text-ink!">/.well-known/agent-card.json</code>.
              Delegation, status tracking, artifact delivery, and peer-to-peer questioning are
              dispatched as standard JSON-RPC messages, preserving the audit trail and avoiding a
              central hub.
            </TierRow>

            <TierRow
              number="04"
              title="A2UI declarative interface runtime"
              lede="Agent-authored operator surfaces with no client-side code execution"
              tags={["A2UI v0.9", "Declarative JSON", "In-place updates", "Sanitized UI"]}
            >
              Commanders stream declarative UI specifications to the operator’s dashboard as JSON
              operations. The frontend translates those abstract component tokens into native{" "}
              <code className="font-mono text-[0.8125rem] text-ink!">@foundry/ui</code> React widgets. No
              arbitrary JavaScript is ever executed, which removes prompt injection and XSS as a class.
            </TierRow>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- 03 */}
        <Section
          id="unscripted-orchestration"
          number="03"
          eyebrow="Cognitive engine"
          meta="The end of rigid DAGs"
          title="Unscripted orchestration: why state machines fail in cyber defense"
        >
          <p className="prose-serif max-w-[62ch]" style={BODY}>
            Traditional security orchestration, automation, and response (SOAR) platforms rely on
            pre-programmed decision trees and directed acyclic graphs. During real intrusions, that
            architecture breaks.
          </p>

          <div className="grid gap-8 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h3 className="eyebrow" style={{ color: "var(--negative)" }}>
                Where rigid SOAR fails
              </h3>
              <dl className="flex flex-col">
                <ClaimRow tone="negative" term="Branch explosion">
                  Adversaries constantly mutate tactics. Writing playbooks for every permutation of
                  initial access, evasion, and persistence requires impossible manual upkeep.
                </ClaimRow>
                <ClaimRow tone="negative" term="Context blindness">
                  SOAR playbooks execute sequentially. If an API times out or a host is already
                  offline, the workflow stalls awaiting manual human triage.
                </ClaimRow>
                <ClaimRow tone="negative" term="No semantic synthesis">
                  A hardcoded script cannot infer that an unusual DNS lookup on an internal proxy is
                  linked to a memory-injected stager found on an API pod.
                </ClaimRow>
              </dl>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="eyebrow" style={{ color: "var(--positive)" }}>
                How Phalanx commanders adapt
              </h3>
              <dl className="flex flex-col">
                <ClaimRow tone="positive" term="Dynamic discovery">
                  The commander starts with no workflow. It calls{" "}
                  <code className="font-mono text-[0.8125rem] text-ink!">a2a_discover</code> to read the
                  live roster and selects specialists from their declared skills.
                </ClaimRow>
                <ClaimRow tone="positive" term="Hypothesis-driven investigation">
                  The commander evaluates intermediate findings, holds competing theories, and adapts
                  tasks as new telemetry arrives.
                </ClaimRow>
                <ClaimRow tone="positive" term="Blast-radius awareness">
                  Destructive containment actions (
                  <code className="font-mono text-[0.8125rem] text-ink!">isolate_host</code>,{" "}
                  <code className="font-mono text-[0.8125rem] text-ink!">revoke_sessions</code>) require
                  explicit risk justification, weighing downtime against dwell time.
                </ClaimRow>
              </dl>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <h3 className="eyebrow">The commander’s OODA loop</h3>
            <dl className="flex flex-col">
              <DefRow term="01 · Observe — ingest & discover">
                Parses detection alerts, calls{" "}
                <code className="font-mono text-[0.8125rem] text-ink!">a2a_discover</code>, and inspects
                the available specialists.
              </DefRow>
              <DefRow term="02 · Orient — synthesize evidence">
                Correlates memory artifacts, outbound NetFlow, and CVE records to identify the
                intrusion vector.
              </DefRow>
              <DefRow term="03 · Decide — delegate tasks">
                Dispatches targeted tasks to specialists and calculates containment blast radius.
              </DefRow>
              <DefRow term="04 · Act — contain & backtest">
                Authorizes isolation, deploys egress sinkholes, and authors new detection rules.
              </DefRow>
            </dl>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- 04 */}
        <Section
          id="a2a-protocol"
          number="04"
          eyebrow="Wire protocol"
          meta="Google Agent2Agent v0.3"
          title="Peer-to-peer A2A, on the wire"
        >
          <p className="prose-serif max-w-[62ch]" style={BODY}>
            Phalanx implements the Google Agent2Agent (A2A) specification over JSON-RPC 2.0. Rather
            than calling internal function pointers, all inter-agent delegation moves as fully-formed
            wire envelopes.
          </p>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SegmentedControl<"card" | "request" | "response">
                value={a2aTab}
                onChange={setA2aTab}
                options={[
                  { value: "card", label: "Agent card" },
                  { value: "request", label: "message/send" },
                  { value: "response", label: "Task result" },
                ]}
                className="w-fit"
              />
              <span className="meta-mono hidden sm:inline">
                Endpoint /api/a2a/agents/&#123;id&#125;
              </span>
            </div>

            {a2aTab === "card" && (
              <CodeSnippetViewer
                title="forensics-cinder / agent-card.json"
                subtitle="GET /.well-known/agent-card.json"
                badgeText="A2A card v0.3"
                code={CODE_AGENT_CARD}
              />
            )}

            {a2aTab === "request" && (
              <CodeSnippetViewer
                title="ic-atlas → forensics-cinder / message/send"
                subtitle="JSON-RPC 2.0 request"
                badgeText="JSON-RPC 2.0"
                code={CODE_A2A_REQUEST}
              />
            )}

            {a2aTab === "response" && (
              <CodeSnippetViewer
                title="forensics-cinder → ic-atlas / task result"
                subtitle="JSON-RPC 2.0 success response"
                badgeText="Task completed"
                code={CODE_A2A_RESPONSE}
              />
            )}
          </div>

          <dl className="flex flex-col">
            <DefRow term="Decentralized discovery">
              Specialists publish declared capabilities, parameters, and{" "}
              <code className="font-mono text-[0.8125rem] text-ink!">delegateWhen</code> criteria. Agents
              discover peers dynamically without hardcoded addresses.
            </DefRow>
            <DefRow term="Lateral communication">
              Specialists query peers directly — forensics requests PCAP from the network analyst — to
              accelerate analysis without congesting the commander.
            </DefRow>
            <DefRow term="Full auditability">
              Every hop is logged with a unique{" "}
              <code className="font-mono text-[0.8125rem] text-ink!">taskId</code> and{" "}
              <code className="font-mono text-[0.8125rem] text-ink!">contextId</code>, so the whole run
              replays on the Protocol Trace page.
            </DefRow>
          </dl>
        </Section>

        {/* ---------------------------------------------------------------- 05 */}
        <Section
          id="a2ui-catalog"
          number="05"
          eyebrow="Dynamic UI runtime"
          meta="A2UI v0.9 specification"
          title="A2UI v0.9 runtime surface generation"
        >
          <p className="prose-serif max-w-[62ch]" style={BODY}>
            How can autonomous agents author operator dashboards without introducing cross-site
            scripting or arbitrary code execution? Phalanx uses the A2UI v0.9 declarative
            specification.
          </p>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 border-b border-rule-soft pb-1.5">
                <span className="eyebrow">Agent-emitted payload</span>
                <span className="meta-mono">updateComponents</span>
              </div>
              <CodeSnippetViewer
                title="surface / incident-inc-8841"
                subtitle="Declarative component tree"
                badgeText="A2UI v0.9"
                code={CODE_A2UI_PAYLOAD}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 border-b border-rule-soft pb-1.5">
                <span className="eyebrow">Native render result</span>
                <span className="meta-mono">No code executed</span>
              </div>

              {/* The same payload, rendered by the client. */}
              <div className="flex flex-1 flex-col justify-center border border-rule p-5">
                <div className="flex items-start justify-between gap-3 border-b border-rule-soft pb-3">
                  <div className="flex flex-col gap-1">
                    <span className="eyebrow" style={{ color: "var(--negative)" }}>
                      Critical action
                    </span>
                    <h4 className="title-serif text-[1.25rem]">Immediate containment required</h4>
                  </div>
                  <span className="sev-tag" data-tone="negative">
                    sev-1
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3">
                  <MockMetric label="Threat vector" value="C2 beacon active" tone="var(--negative)" />
                  <MockMetric label="Target host" value="app-api-21" tone="var(--warning)" />
                  <MockMetric label="Blast radius" value="Single service pod" tone="var(--accent)" />
                </dl>

                <p className="prose-serif mt-3">
                  Adversary implant actively communicating with external C2 185.121.44.19. Containment
                  operator recommends network isolation.
                </p>

                <div className="mt-4 flex items-center justify-end border-t border-rule-soft pt-3">
                  <Button size="sm" variant="destructive">
                    Authorize host isolation
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="eyebrow">Guarantees of an A2UI surface</h3>
            <dl className="flex flex-col">
              <DefRow term="Catalog enforcement">
                Agents can only invoke elements pre-registered in{" "}
                <code className="font-mono text-[0.8125rem] text-ink!">/api/a2ui/catalog.json</code> —
                Card, MetricRow, Timeline.
              </DefRow>
              <DefRow term="In-place mutation">
                Emitting an update with the same{" "}
                <code className="font-mono text-[0.8125rem] text-ink!">cardId</code> mutates the existing
                card in place, without jitter or scrolling away.
              </DefRow>
              <DefRow term="No DOM injection">
                The client maps tokens into pre-compiled React components; no{" "}
                <code className="font-mono text-[0.8125rem] text-ink!">eval()</code> or HTML string
                rendering is permitted.
              </DefRow>
            </dl>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- 06 */}
        <Section
          id="tool-estate"
          number="06"
          eyebrow="Instrumentation"
          meta="37 simulated SOC instruments"
          title="The simulated tool estate and zero-ground-truth isolation"
        >
          <p className="prose-serif max-w-[62ch]" style={BODY}>
            Phalanx agents carry 37 simulated security instruments covering the full spectrum of SOC
            operations. Agents are quarantined from the hidden scenario ground truth, which forces
            genuine forensic deduction.
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule-soft pb-2">
            {TOOL_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setToolCategory(cat.id)}
                className={`meta-mono -mb-2 whitespace-nowrap border-b pb-2 transition-colors ${
                  toolCategory === cat.id
                    ? "border-[var(--accent)] text-ink!"
                    : "border-transparent hover:text-ink!"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col">
            {filteredTools.map((tool) => (
              <div
                key={tool.name}
                className="rule-row md:grid-cols-[11rem_minmax(0,1fr)_minmax(0,0.5fr)]"
              >
                <code className="meta-mono text-accent-indigo!">{tool.name}</code>
                <p className="prose-serif max-w-[62ch]">{tool.description}</p>
                <div className="flex flex-col items-start gap-1.5">
                  <span className="sev-tag" data-tone={CLEARANCE_TONE[tool.clearance]}>
                    {tool.clearance}
                  </span>
                  <span className="concepts">
                    {tool.agents.map((ag) => (
                      <span key={ag}>{ag}</span>
                    ))}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ---------------------------------------------------------------- 07 */}
        <Section
          id="model-support"
          number="07"
          eyebrow="Models & runtime"
          meta="Frontier models and the replay engine"
          title="Multi-model flexibility and deterministic replay"
        >
          <p className="prose-serif max-w-[62ch]" style={BODY}>
            Security work demands vendor independence. Phalanx has a plug-and-play provider
            architecture alongside an offline deterministic replay engine.
          </p>

          <div className="flex flex-col gap-4">
            <SegmentedControl<"gemini" | "claude" | "openai" | "replay">
              value={activeModelTab}
              onChange={setActiveModelTab}
              options={[
                { value: "gemini", label: "Google Gemini", icon: <GeminiLogo className="size-3.5" /> },
                { value: "claude", label: "Anthropic Claude", icon: <ClaudeLogo className="size-3.5" /> },
                { value: "openai", label: "OpenAI GPT-5", icon: <OpenAILogo className="size-3.5" /> },
                { value: "replay", label: "Deterministic replay" },
              ]}
              className="w-fit"
            />

            {activeModelTab === "gemini" && (
              <div className="flex flex-col gap-3">
                <h3 className="title-serif text-[1.375rem]">Google Gemini 3</h3>
                <p className="prose-serif max-w-[62ch]">
                  A 2M token context window and native multi-turn tool calling.
                </p>
                <dl className="flex flex-col">
                  <DefRow term="Commander — Gemini 3.1 Pro">
                    Holds entire incident histories, multi-hour memory dumps, and inter-agent
                    transcripts in context. Suits long-horizon campaign deconfliction.
                  </DefRow>
                  <DefRow term="Specialists — Gemini 3.8 Flash">
                    Sub-second latency for high-frequency telemetry queries. Filters gigabytes of SIEM
                    and NetFlow rows without stalling swarm momentum.
                  </DefRow>
                </dl>
              </div>
            )}

            {activeModelTab === "claude" && (
              <div className="flex flex-col gap-3">
                <h3 className="title-serif text-[1.375rem]">Anthropic Claude 5</h3>
                <p className="prose-serif max-w-[62ch]">
                  Hybrid thinking and long chain-of-thought forensic reasoning.
                </p>
                <dl className="flex flex-col">
                  <DefRow term="Commander — Claude Sonnet 5">
                    Uses extended thinking for forensic hypothesis testing, binary disassembly, and
                    root-cause reconstruction. Good at weighing containment blast radius against
                    operational impact.
                  </DefRow>
                  <DefRow term="Specialists — Claude Haiku 4.5">
                    Fast and cheap execution for targeted indicator enrichment, CVE lookups, and log
                    triage.
                  </DefRow>
                </dl>
              </div>
            )}

            {activeModelTab === "openai" && (
              <div className="flex flex-col gap-3">
                <h3 className="title-serif text-[1.375rem]">OpenAI GPT-5</h3>
                <p className="prose-serif max-w-[62ch]">
                  Strict JSON schema adherence and tool orchestration.
                </p>
                <dl className="flex flex-col">
                  <DefRow term="Commander — GPT-5">
                    Reliable structured output, which keeps the A2A JSON-RPC 2.0 and A2UI schema
                    contracts satisfied.
                  </DefRow>
                  <DefRow term="Specialists — GPT-5 mini">
                    Lightweight execution for parallel telemetry parsing and regulatory notification
                    clock evaluation.
                  </DefRow>
                </dl>
              </div>
            )}

            {activeModelTab === "replay" && (
              <div className="flex flex-col gap-3">
                <h3 className="title-serif text-[1.375rem]">Deterministic replay engine</h3>
                <p className="prose-serif max-w-[62ch]">
                  Phalanx ships a pre-recorded, millisecond-accurate replay director. It streams the
                  authentic tool responses, A2A coordination messages, and A2UI dashboards with zero
                  model API calls.
                </p>
                <dl className="flex flex-col">
                  <DefRow term="No cloud dependency">
                    Runs completely offline; suits conferences, air-gapped labs, and CI.
                  </DefRow>
                  <DefRow term="Reproducible benchmarking">
                    Evaluates future model updates against identical scenarios.
                  </DefRow>
                  <DefRow term="No token cost">
                    Lets you explore mission control and the protocol traces for free.
                  </DefRow>
                </dl>
              </div>
            )}
          </div>
        </Section>

        {/* ---------------------------------------------------------------- 08 */}
        <Section
          id="comparison"
          number="08"
          eyebrow="Comparative analysis"
          meta="Architectural benchmarks"
          title="Rigid SOAR playbooks versus autonomous multi-agent swarms"
        >
          <p className="prose-serif max-w-[62ch]" style={BODY}>
            An architectural comparison of the move from rigid automation to autonomous agentic
            defense.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-rule">
                  <th className="eyebrow py-2 pr-4 align-bottom">Dimension</th>
                  <th className="eyebrow py-2 pr-4 align-bottom">Rigid SOAR playbooks</th>
                  <th className="eyebrow py-2 align-bottom">Phalanx autonomous swarm</th>
                </tr>
              </thead>
              <tbody>
                <CompareRow
                  dimension="Orchestration model"
                  soar="Static DAG or BPMN state machines with hardcoded conditionals."
                  swarm="Dynamic LLM incident commander with runtime skill discovery."
                />
                <CompareRow
                  dimension="Novel or evasive attacks"
                  soar="Fails on unmapped branches; requires human intervention."
                  soarTone="var(--negative)"
                  swarm="Synthesizes new investigation paths from live telemetry."
                  swarmTone="var(--positive)"
                />
                <CompareRow
                  dimension="Coordination topology"
                  soar="Central hub-and-spoke bottleneck; sequential step execution."
                  swarm="Decentralized peer-to-peer mesh over the A2A protocol."
                />
                <CompareRow
                  dimension="Operator cockpit"
                  soar="Static pre-built forms and manual ticketing queues."
                  swarm="Runtime-authored A2UI v0.9 surfaces updating in place."
                />
                <CompareRow
                  dimension="Cross-domain telemetry"
                  soar="Fragmented scripts — an IP lookup with no host context."
                  swarm="Correlation across EDR, NetFlow, memory, and cloud IAM."
                />
                <CompareRow
                  dimension="Containment decisioning"
                  soar="Blind automated triggers or manual escalation queues."
                  swarm="Blast-radius aware reasoning, dwell time against service impact."
                />
                <CompareRow
                  dimension="Post-incident hardening"
                  soar="Manual post-mortem ticket written days or weeks later."
                  swarm="Autonomous Sigma/YARA rule authoring and 30-day backtesting."
                />
                <CompareRow
                  dimension="Extensibility"
                  soar="Workflow refactoring and fragile custom integration code."
                  swarm="Drop-in modularity: a new agent publishes an agent-card.json."
                />
                <CompareRow
                  dimension="Offline benchmarking"
                  soar="Rarely supported; requires active infrastructure connections."
                  swarm="Fully offline deterministic replay for reproducible evaluation."
                />
              </tbody>
            </table>
          </div>
        </Section>

        {/* ------------------------------------------------------------- next */}
        <section className="flex flex-col gap-4 border-t border-rule pt-8">
          <h3 className="title-serif text-[1.5rem]">See the swarm run</h3>
          <p className="prose-serif max-w-[62ch]">
            Run a scenario, inspect the agent skills, or point the swarm at a live model.
          </p>

          <div className="flex flex-col">
            <NextRow
              term="Mission Control"
              description="Launch a simulated ransomware or lateral-movement attack and watch the swarm contain it."
              action={
                <Button size="sm" className="button-ink" onClick={() => navigate("/")}>
                  Open Mission Control
                </Button>
              }
            />
            <NextRow
              term="Agent roster"
              description="Review all 19 agents, their declared skills, clearance, tools, and delegation criteria."
              action={
                <Button size="sm" variant="outline" onClick={() => navigate("/roster")}>
                  View roster
                </Button>
              }
            />
            <NextRow
              term="Model settings"
              description="Configure Gemini, Claude, or GPT-5 API keys, and switch between live and replay."
              action={
                <Button size="sm" variant="outline" onClick={() => navigate("/settings")}>
                  Open settings
                </Button>
              }
            />
          </div>

          <div className="meta-mono flex flex-wrap items-center justify-between gap-3 border-t border-rule-soft pt-3">
            <span>
              The live JSON-RPC 2.0 stream is on the{" "}
              <Link to="/protocol" className="underline decoration-rule hover:text-ink!">
                Protocol Trace
              </Link>{" "}
              page.
            </span>
            <span>
              The agents’ own discussion is on the{" "}
              <Link to="/chat" className="underline decoration-rule hover:text-ink!">
                Agent Chat
              </Link>{" "}
              page.
            </span>
          </div>
        </section>
      </div>
    </PageContent>
  )
}

/* --------------------------------------------------------------------------
   ROW PRIMITIVES
   -------------------------------------------------------------------------- */

function Section({
  id,
  number,
  eyebrow,
  meta,
  title,
  children,
}: {
  id: string
  number: string
  eyebrow: string
  meta: string
  title: string
  children: ReactNode
}) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-3 border-b border-rule pb-1.5">
          <span className="eyebrow flex-1">
            {number} — {eyebrow}
          </span>
          <span className="meta-mono">{meta}</span>
        </div>
        <h2 className="title-serif max-w-[24ch]" style={HEADING}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  )
}

function DefRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="rule-row md:grid-cols-[14rem_minmax(0,1fr)]">
      <dt className="title-serif text-[1.125rem]">{term}</dt>
      <dd className="prose-serif max-w-[62ch]">{children}</dd>
    </div>
  )
}

function ClaimRow({ tone, term, children }: { tone: "negative" | "positive"; term: string; children: ReactNode }) {
  return (
    <div className="rule-row gap-1!">
      <dt className="meta-mono" style={{ color: `var(--${tone})` }}>
        {term}
      </dt>
      <dd className="prose-serif max-w-[62ch]">{children}</dd>
    </div>
  )
}

function TierRow({
  number,
  title,
  lede,
  tags,
  children,
}: {
  number: string
  title: string
  lede: string
  tags: string[]
  children: ReactNode
}) {
  return (
    <div className="rule-row md:grid-cols-[3rem_minmax(0,1.25fr)_minmax(0,0.55fr)]">
      <span className="meta-mono">{number}</span>
      <div className="flex flex-col gap-1.5">
        <h3 className="title-serif text-[1.125rem]">{title}</h3>
        <span className="meta-mono">{lede}</span>
        <p className="prose-serif max-w-[62ch]">{children}</p>
      </div>
      <span className="concepts">
        {tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </span>
    </div>
  )
}

function MockMetric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="eyebrow">{label}</dt>
      <dd className="font-mono text-xs" style={{ color: tone }}>
        {value}
      </dd>
    </div>
  )
}

function CompareRow({
  dimension,
  soar,
  soarTone,
  swarm,
  swarmTone,
}: {
  dimension: string
  soar: string
  soarTone?: string
  swarm: string
  swarmTone?: string
}) {
  return (
    <tr className="border-b border-rule-soft transition-colors hover:bg-[var(--wash)]">
      <td className="py-3 pr-4 align-top">
        <span className="title-serif text-[1rem]">{dimension}</span>
      </td>
      <td className="prose-serif py-3 pr-4 align-top" style={soarTone ? { color: soarTone } : undefined}>
        {soar}
      </td>
      <td className="prose-serif py-3 align-top" style={swarmTone ? { color: swarmTone } : { color: "var(--ink-soft)" }}>
        {swarm}
      </td>
    </tr>
  )
}

function NextRow({ term, description, action }: { term: string; description: string; action: ReactNode }) {
  return (
    <div className="rule-row items-center md:grid-cols-[12rem_minmax(0,1fr)_auto]">
      <span className="title-serif text-[1.125rem]">{term}</span>
      <span className="prose-serif max-w-[62ch]">{description}</span>
      {action}
    </div>
  )
}
