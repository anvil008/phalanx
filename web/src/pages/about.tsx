import { useState, useMemo } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  FastForward,
  FileCheck2,
  FileCode,
  GitFork,
  KeyRound,
  Layers,
  Lock,
  MessageSquare,
  Network,
  Radio,
  Scale,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Users,
  XCircle,
} from "lucide-react"
import { Badge } from "@foundry/ui/components/badge"
import { Button } from "@foundry/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@foundry/ui/components/card"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { SegmentedControl } from "@foundry/ui/components/segmented-control"
import { Separator } from "@foundry/ui/components/separator"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { cn } from "@foundry/ui/lib/utils"
import { usePhalanx } from "@/lib/store"

/* --------------------------------------------------------------------------
   SYNTAX HIGHLIGHTED CODE VIEWER COMPONENT
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

  // Tokenize JSON lines for clean syntax coloration
  const renderFormattedLine = (line: string) => {
    // String keys: "key":
    const keyMatch = line.match(/^(\s*)("([^"]+)")(\s*:\s*)(.*)$/)
    if (keyMatch) {
      const [, indent, , key, colon, value] = keyMatch
      return (
        <span>
          {indent}
          <span className="text-[#4cc9d9]">"{key}"</span>
          <span className="text-muted-foreground">{colon}</span>
          {renderValueTokens(value)}
        </span>
      )
    }
    return <span>{renderValueTokens(line)}</span>
  }

  const renderValueTokens = (val: string) => {
    // Strings in quotes
    if (val.startsWith('"') && (val.endsWith('",') || val.endsWith('"'))) {
      const isComma = val.endsWith(",")
      const strContent = isComma ? val.slice(0, -1) : val
      return (
        <>
          <span className="text-emerald-300">{strContent}</span>
          {isComma && <span className="text-muted-foreground">,</span>}
        </>
      )
    }
    // Booleans or numbers
    if (/^\s*(true|false|null)\s*,?\s*$/.test(val)) {
      return <span className="text-purple-400 font-semibold">{val}</span>
    }
    if (/^\s*-?\d+(\.\d+)?\s*,?\s*$/.test(val)) {
      return <span className="text-amber-400 font-semibold">{val}</span>
    }
    return <span className="text-foreground/90">{val}</span>
  }

  const lines = code.trim().split("\n")

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/80 bg-black/90 shadow-2xl transition-all hover:border-[#4cc9d9]/40">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-border/70 bg-card/60 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-destructive/60" />
            <span className="size-2.5 rounded-full bg-warning/60" />
            <span className="size-2.5 rounded-full bg-positive/60" />
          </div>
          <Separator orientation="vertical" className="h-3.5 mx-1" />
          <span className="font-mono text-xs font-semibold text-foreground/90">{title}</span>
          {subtitle && <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">· {subtitle}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-[#4cc9d9]/30 bg-[#4cc9d9]/10 font-mono text-[10px] text-[#4cc9d9]">
            {badgeText}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            className="h-7 cursor-pointer gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground"
            title="Copy code to clipboard"
          >
            {copied ? (
              <>
                <Check className="size-3.5 text-positive" />
                <span className="text-positive text-[11px] font-medium">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                <span className="text-[11px]">Copy</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Code Body */}
      <div className="max-h-[32rem] overflow-x-auto overflow-y-auto p-4 font-mono text-xs leading-relaxed select-text">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="hover:bg-white/[0.02]">
                <td className="w-8 select-none pr-3 text-right font-mono text-[11px] text-muted-foreground/40">{idx + 1}</td>
                <td className="whitespace-pre font-mono">{renderFormattedLine(line)}</td>
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
  { id: "overview", label: "Executive Overview", icon: Shield },
  { id: "architecture", label: "4-Tier Architecture", icon: Layers },
  { id: "unscripted-orchestration", label: "Unscripted Command", icon: Brain },
  { id: "a2a-protocol", label: "A2A Protocol", icon: Network },
  { id: "a2ui-catalog", label: "A2UI Surfaces", icon: LayoutDashboardIcon },
  { id: "tool-estate", label: "37 Tool Estate", icon: Terminal },
  { id: "model-support", label: "Multi-Model & Replay", icon: Cpu },
  { id: "comparison", label: "Swarm vs SOAR", icon: Scale },
]

function LayoutDashboardIcon(props: React.ComponentProps<typeof Layers>) {
  return <Layers {...props} />
}

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
  { name: "verify_closure", category: "detection", clearance: "read", description: "Run automated re-attack simulations to mathematically prove remediation of root exploit vector.", agents: ["verify-anchor"] },

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
  { name: "draft_brief", category: "governance", clearance: "read", description: "Draft technical executive summaries and legal briefs separating facts from hypotheses.", agents: ["comms-herald"] },
  { name: "publish_status", category: "governance", clearance: "act", description: "Publish vetted public status updates with sanitized operational impact summaries.", agents: ["comms-herald"] },
  { name: "assess_obligations", category: "governance", clearance: "read", description: "Evaluate GDPR, SEC 4-day, and HIPAA regulatory disclosure clocks against compromised data.", agents: ["legal-scout"] },
]

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

  // Interactive state
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
        subtitle={state.mode === "live" ? `active swarm · ${state.commanderModel}` : "deterministic replay · zero-ground-truth"}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate("/protocol")}
              className="h-8 gap-1.5 border-border/80 bg-background/50 text-xs font-medium hover:border-[#4cc9d9]/40"
            >
              <Radio className="size-3.5 text-[#4cc9d9]" />
              <span className="hidden sm:inline">Inspect Bus Trace</span>
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/")}
              className="h-8 gap-1.5 bg-[#4cc9d9] text-[#04171a] font-semibold hover:bg-[#6fd8e5]"
            >
              <Activity className="size-3.5" />
              <span>Launch Mission Control</span>
            </Button>
          </div>
        }
      />

      {/* Quick Navigation Sticky Bar */}
      <div className="sticky top-0 z-20 -mx-5 -mt-2 mb-6 border-b border-border/80 bg-background/95 px-5 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="mr-2 hidden text-xs font-semibold tracking-wider text-muted-foreground uppercase lg:inline">
            Sections:
          </span>
          {NAV_SECTIONS.map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => scrollToSection(sec.id)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-control/40 px-3 py-1 text-xs font-medium text-muted-foreground transition-all duration-150 hover:border-[#4cc9d9]/50 hover:bg-[#4cc9d9]/10 hover:text-foreground active:scale-95"
            >
              <sec.icon className="size-3 text-[#4cc9d9]" />
              <span>{sec.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto flex max-w-5xl flex-col gap-16 pb-20">

        {/* ------------------------------------------------------------------
            HERO STAT STRIP
            ------------------------------------------------------------------ */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-xl border border-border/80 bg-card/60 p-4 shadow-sm backdrop-blur">
            <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Autonomous Agents</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight text-foreground font-mono">19</span>
              <span className="text-xs text-[#4cc9d9] font-medium">5 Cmdrs · 14 Specs</span>
            </div>
          </div>
          <div className="rounded-xl border border-border/80 bg-card/60 p-4 shadow-sm backdrop-blur">
            <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Security Instruments</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight text-foreground font-mono">37</span>
              <span className="text-xs text-muted-foreground">SOC & EDR Stack</span>
            </div>
          </div>
          <div className="rounded-xl border border-border/80 bg-card/60 p-4 shadow-sm backdrop-blur">
            <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Coordination Bus</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight text-foreground font-mono">A2A</span>
              <span className="text-xs text-[#4cc9d9] font-medium">JSON-RPC 2.0</span>
            </div>
          </div>
          <div className="rounded-xl border border-border/80 bg-card/60 p-4 shadow-sm backdrop-blur">
            <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Dynamic Interface</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight text-foreground font-mono">A2UI</span>
              <span className="text-xs text-positive font-medium">Zero Code Exec</span>
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1 rounded-xl border border-border/80 bg-card/60 p-4 shadow-sm backdrop-blur">
            <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Mean Containment</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight text-positive font-mono">&lt; 90s</span>
              <span className="text-xs text-muted-foreground">Autonomous MTTC</span>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------
            SECTION: #OVERVIEW
            ------------------------------------------------------------------ */}
        <section id="overview" className="scroll-mt-20 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-[#4cc9d9]/40 bg-[#4cc9d9]/10 font-mono text-xs text-[#4cc9d9]">
                EXECUTIVE OVERVIEW
              </Badge>
              <span className="text-xs text-muted-foreground">Core Thesis & Motivation</span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              Autonomous Blue Team Swarms vs. Real-Time Cyber Intrusions
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Modern cyber attacks execute at machine speed. Advanced threat actors utilize automated recon, in-memory process
              injection, zero-day chains, and stolen OAuth tokens to compromise infrastructure in minutes. Meanwhile, human Security
              Operations Centers (SOCs) remain throttled by alert fatigue, context switching, and rigid SOAR scripts that break the
              moment an adversary deviates from pre-scripted playbooks.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-border/80 bg-card/50 transition-all hover:border-[#4cc9d9]/30">
              <CardHeader className="pb-2">
                <div className="mb-2 size-8 rounded-lg border border-[#4cc9d9]/30 bg-[#4cc9d9]/10 p-1.5 text-[#4cc9d9]">
                  <Brain className="size-full" />
                </div>
                <CardTitle className="text-sm font-semibold">The Paradigm Shift</CardTitle>
              </CardHeader>
              <CardContent className="text-xs leading-relaxed text-muted-foreground">
                Phalanx abandons fixed DAG workflows. Incident Commanders are LLM agents equipped with open-ended diagnostic
                tools, reasoning loops, and dynamic discovery capabilities, allowing them to formulate and test hypotheses in
                real time.
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/50 transition-all hover:border-[#4cc9d9]/30">
              <CardHeader className="pb-2">
                <div className="mb-2 size-8 rounded-lg border border-purple-500/30 bg-purple-500/10 p-1.5 text-purple-400">
                  <Network className="size-full" />
                </div>
                <CardTitle className="text-sm font-semibold">Decentralized Mesh</CardTitle>
              </CardHeader>
              <CardContent className="text-xs leading-relaxed text-muted-foreground">
                No central orchestration bottleneck. Agents collaborate peer-to-peer over Google’s Agent2Agent (A2A) protocol.
                Forensics specialists consult network analysts directly without routing unnecessary round-trips through the commander.
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/50 transition-all hover:border-[#4cc9d9]/30">
              <CardHeader className="pb-2">
                <div className="mb-2 size-8 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-1.5 text-emerald-400">
                  <Lock className="size-full" />
                </div>
                <CardTitle className="text-sm font-semibold">Strict Epistemic Isolation</CardTitle>
              </CardHeader>
              <CardContent className="text-xs leading-relaxed text-muted-foreground">
                Zero ground-truth contamination. The blue team has no backdoor access to the attack generator’s internal state.
                Every finding, IOC, and containment action is derived strictly from realistic, simulated enterprise telemetry.
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ------------------------------------------------------------------
            SECTION: #ARCHITECTURE
            ------------------------------------------------------------------ */}
        <section id="architecture" className="scroll-mt-20 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-[#4cc9d9]/40 bg-[#4cc9d9]/10 font-mono text-xs text-[#4cc9d9]">
                SYSTEM DESIGN
              </Badge>
              <span className="text-xs text-muted-foreground">4-Tier Decoupled Flow</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Visual 4-Tier Architectural Pipeline
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Phalanx decouples raw security telemetry, autonomous cognitive reasoning, decentralized agent communication, and
              safe UI generation into four distinct, self-contained architectural tiers.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {/* Tier 1 */}
            <div className="relative rounded-xl border border-border/80 bg-card/60 p-5 transition-all hover:border-[#4cc9d9]/40">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-500/10 font-mono text-xs font-bold text-[#4cc9d9]">
                    01
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Tier 1: Telemetry & Simulated Estate</h3>
                    <p className="text-xs text-muted-foreground">High-fidelity synthetic sensors and sandboxed actuators</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="font-mono text-[10px]">EDR Process Trees</Badge>
                  <Badge variant="secondary" className="font-mono text-[10px]">NetFlow & PCAP</Badge>
                  <Badge variant="secondary" className="font-mono text-[10px]">CloudTrail & IDP</Badge>
                  <Badge variant="secondary" className="font-mono text-[10px]">Memory Triage</Badge>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Provides continuous synthetic sensor event streams without touching live infrastructure. Includes 37 instruments
                ranging from SIEM free-text search to volatile RAM extraction, as well as safe actuators that sever network adapters,
                sinkhole IP blocks, rotate credentials, and rebuild hosts from golden images.
              </p>
            </div>

            {/* Connecting Connector */}
            <div className="flex justify-center -my-2 text-[#4cc9d9]/60">
              <ArrowRight className="size-4 rotate-90" />
            </div>

            {/* Tier 2 */}
            <div className="relative rounded-xl border border-border/80 bg-card/60 p-5 transition-all hover:border-[#4cc9d9]/40">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-500/10 font-mono text-xs font-bold text-[#4cc9d9]">
                    02
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Tier 2: Cognitive Blue Specialist Swarm</h3>
                    <p className="text-xs text-muted-foreground">19 autonomous AI defense operators with scoped clearance</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="font-mono text-[10px]">5 Commanders</Badge>
                  <Badge variant="secondary" className="font-mono text-[10px]">8 Analysts</Badge>
                  <Badge variant="secondary" className="font-mono text-[10px]">3 Response Ops</Badge>
                  <Badge variant="secondary" className="font-mono text-[10px]">3 Governance</Badge>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Domain-specific AI operators: Incident Commanders (Atlas, Vesper, Orrery, Warden, Marshal), Forensics (Cinder),
                Network (Tide), Malware Reversing (Splice), Threat Intel (Oracle), Exploitability (Lathe), Threat Hunter (Drift),
                Containment (Bulwark), and Detection Engineers (Loom). Each agent is provisioned only with tools fitting its clearance.
              </p>
            </div>

            {/* Connecting Connector */}
            <div className="flex justify-center -my-2 text-[#4cc9d9]/60">
              <ArrowRight className="size-4 rotate-90" />
            </div>

            {/* Tier 3 */}
            <div className="relative rounded-xl border border-border/80 bg-card/60 p-5 transition-all hover:border-[#4cc9d9]/40">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-500/10 font-mono text-xs font-bold text-[#4cc9d9]">
                    03
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Tier 3: Agent2Agent (A2A) Coordination Bus</h3>
                    <p className="text-xs text-muted-foreground">Open, decentralized JSON-RPC 2.0 communication mesh</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="font-mono text-[10px]">JSON-RPC 2.0</Badge>
                  <Badge variant="secondary" className="font-mono text-[10px]">Google A2A v0.3</Badge>
                  <Badge variant="secondary" className="font-mono text-[10px]">Agent Cards</Badge>
                  <Badge variant="secondary" className="font-mono text-[10px]">Peer-to-Peer</Badge>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Every agent exposes an HTTP discovery card at <code className="font-mono text-foreground">/.well-known/agent-card.json</code>.
                Delegation, status tracking, artifact delivery, and peer-to-peer questioning are dispatched as standard JSON-RPC
                messages, preserving strict audit trails and zero central hub bottlenecks.
              </p>
            </div>

            {/* Connecting Connector */}
            <div className="flex justify-center -my-2 text-[#4cc9d9]/60">
              <ArrowRight className="size-4 rotate-90" />
            </div>

            {/* Tier 4 */}
            <div className="relative rounded-xl border border-border/80 bg-card/60 p-5 transition-all hover:border-[#4cc9d9]/40">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-500/10 font-mono text-xs font-bold text-[#4cc9d9]">
                    04
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Tier 4: A2UI Declarative Interface Runtime</h3>
                    <p className="text-xs text-muted-foreground">Agent-authored operator cockpits with zero client-side code execution</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="font-mono text-[10px]">A2UI v0.9</Badge>
                  <Badge variant="secondary" className="font-mono text-[10px]">Declarative JSON</Badge>
                  <Badge variant="secondary" className="font-mono text-[10px]">In-Place Updates</Badge>
                  <Badge variant="secondary" className="font-mono text-[10px]">Sanitized UI</Badge>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Commanders stream declarative UI specifications directly to the human operator’s dashboard via JSON operations.
                The frontend translates these abstract component tokens into native <code className="font-mono text-foreground">@foundry/ui</code> React
                widgets. No arbitrary JavaScript is ever executed, eliminating prompt injection and XSS vulnerabilities completely.
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------
            SECTION: #UNSCRIPTED-ORCHESTRATION
            ------------------------------------------------------------------ */}
        <section id="unscripted-orchestration" className="scroll-mt-20 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-[#4cc9d9]/40 bg-[#4cc9d9]/10 font-mono text-xs text-[#4cc9d9]">
                COGNITIVE ENGINE
              </Badge>
              <span className="text-xs text-muted-foreground">The End of Rigid DAGs</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Unscripted Orchestration: Why State Machines Fail in Cyber Defense
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Traditional Security Orchestration, Automation, and Response (SOAR) platforms rely on pre-programmed decision
              trees and Directed Acyclic Graphs (DAGs). During real intrusions, this architecture inevitably breaks.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="size-4" />
                <h3 className="text-sm font-semibold">The Failure Mode of Rigid SOAR</h3>
              </div>
              <ul className="space-y-2.5 text-xs text-muted-foreground leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="text-destructive font-bold">✕</span>
                  <span><strong>Branch Explosion:</strong> Adversaries constantly mutate tactics. Writing playbooks for every permutation of initial access, evasion, and persistence requires impossible manual upkeep.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-destructive font-bold">✕</span>
                  <span><strong>Context Blindness:</strong> SOAR playbooks execute sequentially. If an unexpected error occurs (e.g. an API times out or a host is already offline), the workflow stalls awaiting manual human triage.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-destructive font-bold">✕</span>
                  <span><strong>No Semantic Synthesis:</strong> A hardcoded script cannot infer that an unusual DNS lookup on an internal proxy is semantically linked to a memory-injected stager discovered on an API pod.</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-4 rounded-xl border border-positive/30 bg-positive/5 p-5">
              <div className="flex items-center gap-2 text-positive">
                <ShieldCheck className="size-4" />
                <h3 className="text-sm font-semibold">How Phalanx Commanders Adapt</h3>
              </div>
              <ul className="space-y-2.5 text-xs text-muted-foreground leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="text-positive font-bold">✓</span>
                  <span><strong>Dynamic Discovery:</strong> The commander starts with zero workflow. It calls <code className="font-mono text-foreground">a2a_discover</code> to read the live roster and dynamically selects specialists based on their declared skills.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-positive font-bold">✓</span>
                  <span><strong>Hypothesis-Driven Investigation:</strong> The commander evaluates intermediate findings, formulates competing theories, and continuously adapts tasks as new telemetry sheds light on the adversary.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-positive font-bold">✓</span>
                  <span><strong>Blast-Radius Awareness:</strong> Destructive containment actions (<code className="font-mono text-foreground">isolate_host</code>, <code className="font-mono text-foreground">revoke_sessions</code>) require explicit risk justification, weighing downtime against dwell time.</span>
                </li>
              </ul>
            </div>
          </div>

          <Card className="border-border/80 bg-card/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">The Commander’s OODA Execution Loop</CardTitle>
              <CardDescription className="text-xs">
                How an LLM Incident Commander orchestrates defense under high uncertainty
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border/70 bg-black/40 p-3">
                  <div className="font-mono text-[11px] font-bold text-[#4cc9d9]">01 · OBSERVE</div>
                  <div className="mt-1 text-xs font-semibold text-foreground">Ingest & Discover</div>
                  <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                    Parses detection alerts, calls <code className="font-mono">a2a_discover</code>, and inspects available specialists.
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-black/40 p-3">
                  <div className="font-mono text-[11px] font-bold text-[#4cc9d9]">02 · ORIENT</div>
                  <div className="mt-1 text-xs font-semibold text-foreground">Synthesize Evidence</div>
                  <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                    Correlates memory artifacts, outbound NetFlow, and CVE records to identify the intrusion vector.
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-black/40 p-3">
                  <div className="font-mono text-[11px] font-bold text-[#4cc9d9]">03 · DECIDE</div>
                  <div className="mt-1 text-xs font-semibold text-foreground">Task Delegation</div>
                  <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                    Dispatches targeted tasks to specialists and calculates containment blast radius.
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-black/40 p-3">
                  <div className="font-mono text-[11px] font-bold text-[#4cc9d9]">04 · ACT</div>
                  <div className="mt-1 text-xs font-semibold text-foreground">Contain & Backtest</div>
                  <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                    Authorizes isolation, deploys egress sinkholes, and authors new detection rules.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ------------------------------------------------------------------
            SECTION: #A2A-PROTOCOL
            ------------------------------------------------------------------ */}
        <section id="a2a-protocol" className="scroll-mt-20 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-[#4cc9d9]/40 bg-[#4cc9d9]/10 font-mono text-xs text-[#4cc9d9]">
                WIRE PROTOCOL
              </Badge>
              <span className="text-xs text-muted-foreground">Google Agent2Agent (A2A) v0.3</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Peer-to-Peer A2A Protocol Deep Dive
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Phalanx implements the Google Agent2Agent (A2A) protocol specification over JSON-RPC 2.0. Rather than invoking internal
              function pointers, all inter-agent task delegation and communication moves as fully-formed wire envelopes.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <SegmentedControl<"card" | "request" | "response">
                value={a2aTab}
                onChange={setA2aTab}
                options={[
                  { value: "card", label: "Agent Card (.well-known)", icon: <FileCode className="size-3.5" /> },
                  { value: "request", label: "Delegation (message/send)", icon: <GitFork className="size-3.5" /> },
                  { value: "response", label: "Task Result (TASK_COMPLETED)", icon: <FileCheck2 className="size-3.5" /> },
                ]}
                className="w-fit"
              />
              <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
                Endpoint: <code className="text-[#4cc9d9]">/api/a2a/agents/&#123;id&#125;</code>
              </span>
            </div>

            {a2aTab === "card" && (
              <CodeSnippetViewer
                title="forensics-cinder / agent-card.json"
                subtitle="GET /.well-known/agent-card.json"
                badgeText="A2A CARD v0.3"
                code={CODE_AGENT_CARD}
              />
            )}

            {a2aTab === "request" && (
              <CodeSnippetViewer
                title="ic-atlas → forensics-cinder / message/send"
                subtitle="JSON-RPC 2.0 Request"
                badgeText="JSON-RPC 2.0"
                code={CODE_A2A_REQUEST}
              />
            )}

            {a2aTab === "response" && (
              <CodeSnippetViewer
                title="forensics-cinder → ic-atlas / task result"
                subtitle="JSON-RPC 2.0 Success Response"
                badgeText="TASK_COMPLETED"
                code={CODE_A2A_RESPONSE}
              />
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border/70 bg-card/40 p-3.5">
              <div className="font-mono text-xs font-semibold text-[#4cc9d9]">Decentralized Discovery</div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Specialists publish declared capabilities, parameters, and <code className="font-mono text-foreground">delegateWhen</code> criteria.
                Agents discover peers dynamically without hardcoded addresses.
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-card/40 p-3.5">
              <div className="font-mono text-xs font-semibold text-[#4cc9d9]">Lateral P2P Communication</div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Specialists query peers directly (e.g. Forensics requests PCAP from Network Analyst) to accelerate analysis
                without congesting the Commander.
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-card/40 p-3.5">
              <div className="font-mono text-xs font-semibold text-[#4cc9d9]">Full Protocol Auditability</div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Every hop is logged with unique <code className="font-mono text-foreground">taskId</code> and <code className="font-mono text-foreground">contextId</code>,
                enabling complete replayability on the Protocol Trace page.
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------
            SECTION: #A2UI-CATALOG
            ------------------------------------------------------------------ */}
        <section id="a2ui-catalog" className="scroll-mt-20 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-[#4cc9d9]/40 bg-[#4cc9d9]/10 font-mono text-xs text-[#4cc9d9]">
                DYNAMIC UI RUNTIME
              </Badge>
              <span className="text-xs text-muted-foreground">A2UI v0.9 Specification</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              A2UI v0.9 Runtime Surface Generation
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              How can autonomous agents author dynamic, high-impact operator dashboards without introducing Cross-Site Scripting
              (XSS) or arbitrary code execution vulnerabilities? Phalanx uses the A2UI v0.9 declarative specification.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Agent Emitted A2UI Payload
                </span>
                <Badge variant="secondary" className="font-mono text-[10px]">updateComponents</Badge>
              </div>
              <CodeSnippetViewer
                title="surface / incident-inc-8841"
                subtitle="Declarative Component Tree"
                badgeText="A2UI v0.9"
                code={CODE_A2UI_PAYLOAD}
              />
            </div>

            <div className="flex flex-col">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Native Client Render Result
                </span>
                <Badge variant="outline" className="border-positive/30 bg-positive/10 text-positive font-mono text-[10px]">
                  Zero Code Executed
                </Badge>
              </div>

              {/* Rendered Mock Card matching A2UI */}
              <div className="flex flex-1 flex-col justify-center rounded-xl border border-destructive/40 bg-card/80 p-5 shadow-xl backdrop-blur">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <div>
                    <span className="font-mono text-[10px] font-bold tracking-widest text-destructive uppercase">
                      CRITICAL ACTION
                    </span>
                    <h4 className="text-base font-bold text-foreground">Immediate Containment Required</h4>
                  </div>
                  <StatusDot tone="negative" pulse />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-border/60 bg-black/40 p-3">
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase">Threat Vector</div>
                    <div className="font-mono text-xs font-bold text-destructive">C2 Beacon Active</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase">Target Host</div>
                    <div className="font-mono text-xs font-bold text-warning">app-api-21</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase">Blast Radius</div>
                    <div className="font-mono text-xs font-bold text-info">Single Service Pod</div>
                  </div>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Adversary implant actively communicating with external C2 185.121.44.19. Containment operator recommends network isolation.
                </p>

                <div className="mt-4 flex items-center justify-end border-t border-border/60 pt-3">
                  <Button size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs font-semibold gap-1.5 cursor-pointer">
                    <ShieldAlert className="size-3.5" />
                    Authorize Host Isolation
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card/40 p-4">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
              Key Guarantees of A2UI Runtime Surfaces
            </h4>
            <div className="grid gap-3 sm:grid-cols-3 text-xs text-muted-foreground">
              <div>
                <strong className="text-foreground">Catalog Enforcement:</strong> Agents can only invoke elements pre-registered in
                <code className="font-mono text-[#4cc9d9]"> /api/a2ui/catalog.json</code> (<code className="font-mono">Card</code>, <code className="font-mono">MetricRow</code>, <code className="font-mono">Timeline</code>).
              </div>
              <div>
                <strong className="text-foreground">In-Place Mutation:</strong> Emitting updates with the same <code className="font-mono text-foreground">cardId</code> mutates
                existing cards in place without screen jitter or scrolling away.
              </div>
              <div>
                <strong className="text-foreground">Zero DOM Injection:</strong> The client maps tokens directly into pre-compiled React components;
                no <code className="font-mono text-foreground">eval()</code> or HTML string rendering is permitted.
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------
            SECTION: #TOOL-ESTATE
            ------------------------------------------------------------------ */}
        <section id="tool-estate" className="scroll-mt-20 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-[#4cc9d9]/40 bg-[#4cc9d9]/10 font-mono text-xs text-[#4cc9d9]">
                INSTRUMENTATION
              </Badge>
              <span className="text-xs text-muted-foreground">37 Simulated SOC Instruments</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              The Simulated Tool Estate & Zero-Ground-Truth Isolation
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Phalanx agents are equipped with 37 simulated security instruments covering the full spectrum of SOC operations.
              Agents are strictly quarantined from hidden scenario ground truth, forcing realistic forensic deduction.
            </p>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: "all", label: "All Instruments (37)" },
              { id: "telemetry", label: "Telemetry & Sensors (6)" },
              { id: "forensics", label: "Deep Forensics (5)" },
              { id: "intel", label: "Threat Intel (4)" },
              { id: "sandbox", label: "Sandboxing (2)" },
              { id: "containment", label: "Containment (6)" },
              { id: "detection", label: "Detection (3)" },
              { id: "command", label: "Command (7)" },
              { id: "governance", label: "Governance (4)" },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setToolCategory(cat.id)}
                className={cn(
                  "cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-medium transition-all select-none",
                  toolCategory === cat.id
                    ? "border-[#4cc9d9] bg-[#4cc9d9]/15 text-[#4cc9d9] font-semibold"
                    : "border-border/60 bg-control/40 text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Tools Grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTools.map((tool) => (
              <div
                key={tool.name}
                className="group flex flex-col justify-between rounded-xl border border-border/70 bg-card/50 p-3.5 transition-all hover:border-[#4cc9d9]/40 hover:bg-card/80"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <code className="font-mono text-xs font-bold text-[#4cc9d9] group-hover:underline">
                      {tool.name}
                    </code>
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-mono text-[9px] uppercase",
                        tool.clearance === "command"
                          ? "border-purple-500/40 text-purple-400 bg-purple-500/10"
                          : tool.clearance === "act"
                          ? "border-warning/40 text-warning bg-warning/10"
                          : "border-border text-muted-foreground"
                      )}
                    >
                      {tool.clearance}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {tool.description}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-border/50 pt-2 text-[10px] text-muted-foreground">
                  <span className="font-semibold text-foreground/70">Assigned:</span>
                  {tool.agents.map((ag) => (
                    <span key={ag} className="rounded bg-white/5 px-1 font-mono text-[10px] text-foreground/80">
                      {ag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------------
            SECTION: #MODEL-SUPPORT
            ------------------------------------------------------------------ */}
        <section id="model-support" className="scroll-mt-20 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-[#4cc9d9]/40 bg-[#4cc9d9]/10 font-mono text-xs text-[#4cc9d9]">
                MODELS & RUNTIME
              </Badge>
              <span className="text-xs text-muted-foreground">Frontier AI & Replay Engine</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Multi-Model Flexibility & Deterministic Replay
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Enterprise security defense demands vendor independence. Phalanx features a plug-and-play provider architecture
              supporting leading models alongside an offline deterministic replay engine.
            </p>
          </div>

          <div className="space-y-4">
            <SegmentedControl<"gemini" | "claude" | "openai" | "replay">
              value={activeModelTab}
              onChange={setActiveModelTab}
              options={[
                { value: "gemini", label: "Google Gemini", icon: <Brain className="size-3.5 text-cyan-400" /> },
                { value: "claude", label: "Anthropic Claude", icon: <Bot className="size-3.5 text-amber-400" /> },
                { value: "openai", label: "OpenAI GPT-5", icon: <Cpu className="size-3.5 text-emerald-400" /> },
                { value: "replay", label: "Deterministic Replay", icon: <FastForward className="size-3.5 text-purple-400" /> },
              ]}
              className="w-fit"
            />

            {activeModelTab === "gemini" && (
              <Card className="border-border/80 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Brain className="size-4 text-cyan-400" />
                    Google Gemini 3 Architecture
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Massive 2M token context window and native multi-turn tool calling
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2 text-xs text-muted-foreground leading-relaxed">
                  <div className="rounded-lg border border-border/70 bg-black/40 p-4">
                    <div className="font-semibold text-foreground mb-1">Commander: Gemini 3.1 Pro</div>
                    <p>
                      Holds entire incident histories, multi-hour memory dumps, and complex inter-agent transcripts within its 2M
                      token context. Excels at high-level reasoning and long-horizon campaign deconfliction.
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-black/40 p-4">
                    <div className="font-semibold text-foreground mb-1">Specialists: Gemini 3.8 Flash</div>
                    <p>
                      Sub-second latency and high throughput for high-frequency specialist telemetry queries. Rapidly filters gigabytes
                      of SIEM and NetFlow rows without stalling swarm momentum.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeModelTab === "claude" && (
              <Card className="border-border/80 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Bot className="size-4 text-amber-400" />
                    Anthropic Claude 5 Architecture
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Hybrid thinking and rigorous chain-of-thought forensic reasoning
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2 text-xs text-muted-foreground leading-relaxed">
                  <div className="rounded-lg border border-border/70 bg-black/40 p-4">
                    <div className="font-semibold text-foreground mb-1">Commander: Claude Sonnet 5</div>
                    <p>
                      Utilizes extended thinking for deep forensic hypothesis testing, malware binary disassembly, and root-cause
                      reconstruction. Uniquely skilled at weighing containment blast radius against operational impact.
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-black/40 p-4">
                    <div className="font-semibold text-foreground mb-1">Specialists: Claude Haiku 4.5</div>
                    <p>
                      Extremely fast and cost-effective execution for targeted indicator enrichment, CVE lookups, and log triage.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeModelTab === "openai" && (
              <Card className="border-border/80 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Cpu className="size-4 text-emerald-400" />
                    OpenAI GPT-5 Architecture
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Strict JSON schema adherence and enterprise tool orchestration
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2 text-xs text-muted-foreground leading-relaxed">
                  <div className="rounded-lg border border-border/70 bg-black/40 p-4">
                    <div className="font-semibold text-foreground mb-1">Commander: GPT-5</div>
                    <p>
                      Reliable structured output formatting ensuring 100% compliance with A2A JSON-RPC 2.0 and A2UI schema contracts.
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-black/40 p-4">
                    <div className="font-semibold text-foreground mb-1">Specialists: GPT-5-mini</div>
                    <p>
                      Lightweight execution engine for parallel telemetry parsing and regulatory notification clock evaluation.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeModelTab === "replay" && (
              <Card className="border-border/80 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <FastForward className="size-4 text-purple-400" />
                    Deterministic Replay Engine (Offline-First)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Zero-token, 100% reproducible scientific benchmark and evaluation mode
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-xs text-muted-foreground leading-relaxed">
                  <p>
                    Phalanx ships with a pre-recorded, millisecond-accurate deterministic replay director. It streams the authentic
                    tool responses, A2A coordination messages, and dynamic A2UI dashboards with zero model API calls.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3 pt-1">
                    <div className="rounded-lg border border-border/60 bg-black/40 p-3">
                      <div className="font-semibold text-foreground">Zero Cloud Dependency</div>
                      <p className="mt-1 text-[11px]">Runs completely offline; perfect for conferences, air-gapped labs, and CI/CD testing.</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-black/40 p-3">
                      <div className="font-semibold text-foreground">Scientific Benchmarking</div>
                      <p className="mt-1 text-[11px]">Allows evaluating future model updates against identical, reproducible cyber scenarios.</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-black/40 p-3">
                      <div className="font-semibold text-foreground">Zero Token Cost</div>
                      <p className="mt-1 text-[11px]">Enables infinite exploration of the full mission control and protocol traces for free.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        {/* ------------------------------------------------------------------
            SECTION: #COMPARISON
            ------------------------------------------------------------------ */}
        <section id="comparison" className="scroll-mt-20 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-[#4cc9d9]/40 bg-[#4cc9d9]/10 font-mono text-xs text-[#4cc9d9]">
                COMPARATIVE ANALYSIS
              </Badge>
              <span className="text-xs text-muted-foreground">Architectural Benchmarks</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Traditional SOAR Playbooks vs. Autonomous Multi-Agent Swarms
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              A detailed architectural comparison illustrating the transition from rigid automation to autonomous agentic cyber defense.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/80 bg-card/40 shadow-xl">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border/80 bg-black/60">
                  <th className="p-3.5 font-semibold text-foreground">Dimension</th>
                  <th className="p-3.5 font-semibold text-muted-foreground">Rigid SOAR Playbooks</th>
                  <th className="p-3.5 font-semibold text-[#4cc9d9]">Phalanx Autonomous Swarm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                <tr className="hover:bg-white/[0.02]">
                  <td className="p-3.5 font-semibold text-foreground">Orchestration Model</td>
                  <td className="p-3.5 text-muted-foreground">Static DAG / BPMN state machines with hardcoded conditionals.</td>
                  <td className="p-3.5 font-medium text-foreground">Dynamic LLM Incident Commander with runtime skill discovery.</td>
                </tr>
                <tr className="hover:bg-white/[0.02]">
                  <td className="p-3.5 font-semibold text-foreground">Novel / Evasive Attacks</td>
                  <td className="p-3.5 text-muted-foreground">
                    <span className="inline-flex items-center gap-1 text-destructive font-medium">
                      <XCircle className="size-3" /> Fails on unmapped branches; requires human intervention.
                    </span>
                  </td>
                  <td className="p-3.5 font-medium text-foreground">
                    <span className="inline-flex items-center gap-1 text-positive font-medium">
                      <CheckCircle2 className="size-3" /> Synthesizes new investigation paths from live telemetry evidence.
                    </span>
                  </td>
                </tr>
                <tr className="hover:bg-white/[0.02]">
                  <td className="p-3.5 font-semibold text-foreground">Coordination Topology</td>
                  <td className="p-3.5 text-muted-foreground">Central hub-and-spoke bottleneck; sequential step execution.</td>
                  <td className="p-3.5 font-medium text-foreground">Decentralized peer-to-peer mesh over Google A2A protocol.</td>
                </tr>
                <tr className="hover:bg-white/[0.02]">
                  <td className="p-3.5 font-semibold text-foreground">Operator Cockpit</td>
                  <td className="p-3.5 text-muted-foreground">Static pre-built forms and manual ticketing queues.</td>
                  <td className="p-3.5 font-medium text-foreground">Runtime-authored A2UI v0.9 declarative surfaces updating in place.</td>
                </tr>
                <tr className="hover:bg-white/[0.02]">
                  <td className="p-3.5 font-semibold text-foreground">Cross-Domain Telemetry</td>
                  <td className="p-3.5 text-muted-foreground">Fragmented scripts (isolated IP lookup without host context).</td>
                  <td className="p-3.5 font-medium text-foreground">Holistic correlation across EDR, NetFlow, memory, and Cloud IAM.</td>
                </tr>
                <tr className="hover:bg-white/[0.02]">
                  <td className="p-3.5 font-semibold text-foreground">Containment Decisioning</td>
                  <td className="p-3.5 text-muted-foreground">Blind automated triggers or manual escalation queues.</td>
                  <td className="p-3.5 font-medium text-foreground">Blast-radius aware reasoning balancing dwell time vs service impact.</td>
                </tr>
                <tr className="hover:bg-white/[0.02]">
                  <td className="p-3.5 font-semibold text-foreground">Post-Incident Hardening</td>
                  <td className="p-3.5 text-muted-foreground">Manual post-mortem ticket written days or weeks later.</td>
                  <td className="p-3.5 font-medium text-foreground">Autonomous Sigma/YARA rule authoring and 30-day backtesting.</td>
                </tr>
                <tr className="hover:bg-white/[0.02]">
                  <td className="p-3.5 font-semibold text-foreground">Extensibility</td>
                  <td className="p-3.5 text-muted-foreground">Complex workflow refactoring and fragile custom integration code.</td>
                  <td className="p-3.5 font-medium text-foreground">Drop-in modularity: new agents publish an <code className="font-mono text-xs">agent-card.json</code>.</td>
                </tr>
                <tr className="hover:bg-white/[0.02]">
                  <td className="p-3.5 font-semibold text-foreground">Offline Benchmarking</td>
                  <td className="p-3.5 text-muted-foreground">Rarely supported; requires active infrastructure connections.</td>
                  <td className="p-3.5 font-medium text-foreground">100% offline deterministic replay engine for scientific evaluation.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ------------------------------------------------------------------
            CALL TO ACTION CARDS
            ------------------------------------------------------------------ */}
        <section className="space-y-4 pt-4 border-t border-border/80">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-foreground">Experience the Swarm in Action</h3>
              <p className="text-xs text-muted-foreground">
                Run scenarios, inspect agent skills, or test live AI model configurations.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="group relative flex flex-col justify-between border-border/80 bg-card/60 transition-all hover:border-[#4cc9d9]/50 hover:bg-card/90">
              <CardHeader className="pb-3">
                <div className="mb-2 size-8 rounded-lg border border-[#4cc9d9]/30 bg-[#4cc9d9]/10 p-1.5 text-[#4cc9d9]">
                  <Activity className="size-full" />
                </div>
                <CardTitle className="text-sm font-semibold">Mission Control</CardTitle>
                <CardDescription className="text-xs">
                  Launch a simulated ransomware or lateral movement attack and observe the autonomous swarm contain it live.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button
                  size="sm"
                  onClick={() => navigate("/")}
                  className="w-full gap-1.5 bg-[#4cc9d9] font-semibold text-[#04171a] hover:bg-[#6fd8e5]"
                >
                  <span>Open Mission Control</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </CardContent>
            </Card>

            <Card className="group relative flex flex-col justify-between border-border/80 bg-card/60 transition-all hover:border-[#4cc9d9]/50 hover:bg-card/90">
              <CardHeader className="pb-3">
                <div className="mb-2 size-8 rounded-lg border border-purple-500/30 bg-purple-500/10 p-1.5 text-purple-400">
                  <Users className="size-full" />
                </div>
                <CardTitle className="text-sm font-semibold">Inspect Agent Roster</CardTitle>
                <CardDescription className="text-xs">
                  Review all 19 autonomous agents, their declared skills, clearance levels, tool allocations, and delegation criteria.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("/roster")}
                  className="w-full gap-1.5 border-border hover:border-purple-500/50 hover:text-foreground"
                >
                  <span>View Full Roster</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </CardContent>
            </Card>

            <Card className="group relative flex flex-col justify-between border-border/80 bg-card/60 transition-all hover:border-[#4cc9d9]/50 hover:bg-card/90">
              <CardHeader className="pb-3">
                <div className="mb-2 size-8 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-1.5 text-emerald-400">
                  <KeyRound className="size-full" />
                </div>
                <CardTitle className="text-sm font-semibold">Settings & Live API</CardTitle>
                <CardDescription className="text-xs">
                  Configure Gemini 3, Claude 5, or GPT-5 API keys, switch modes, and benchmark model response latencies.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("/settings")}
                  className="w-full gap-1.5 border-border hover:border-emerald-500/50 hover:text-foreground"
                >
                  <span>Open Settings</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-control/30 px-4 py-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Radio className="size-4 text-[#4cc9d9]" />
              <span>Deep dive into the live JSON-RPC 2.0 message stream on the <Link to="/protocol" className="text-foreground underline decoration-[#4cc9d9]/50 underline-offset-2 hover:text-[#4cc9d9]">Protocol Trace</Link> page.</span>
            </div>
            <div className="flex items-center gap-2">
              <MessageSquare className="size-4 text-purple-400" />
              <span>Read agent discussions in natural language on the <Link to="/chat" className="text-foreground underline decoration-purple-400/50 underline-offset-2 hover:text-purple-400">Agent Chat</Link> page.</span>
            </div>
          </div>
        </section>

      </div>
    </PageContent>
  )
}
