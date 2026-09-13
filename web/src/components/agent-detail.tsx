import { useState } from "react"
import { Badge } from "@foundry/ui/components/badge"
import { Button } from "@foundry/ui/components/button"
import { Separator } from "@foundry/ui/components/separator"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { X, Code, FileText, Check, Copy } from "lucide-react"
import type { AgentDef, AgentRuntime, Incident } from "@/lib/model"
import { CLASS_LABEL } from "@/lib/model"
import { compact, relative } from "@/lib/format"

const STATE_TONE: Record<string, "neutral" | "positive" | "negative" | "warning" | "info" | "faint"> = {
  standby: "positive",
  briefing: "info",
  working: "info",
  consulting: "warning",
  reporting: "positive",
  blocked: "negative",
  offline: "faint",
  "stood-down": "faint",
}

function getClearanceStamp(clearance: string): { label: string; variant: string } {
  switch (clearance) {
    case "command":
      return { label: "TS//SCI // ORCON", variant: "border-primary/50 bg-primary/15 text-primary" }
    case "act":
      return { label: "SECRET // REL PHALANX", variant: "border-warning/50 bg-warning/15 text-warning" }
    default:
      return { label: "CONFIDENTIAL // BLUE-MESH", variant: "border-border/80 bg-black/40 text-muted-foreground" }
  }
}

export function AgentDetail({
  agent,
  runtime,
  incidents,
  onClose,
  onOpenIncident,
}: {
  agent: AgentDef
  runtime: AgentRuntime | undefined
  incidents: Incident[]
  onClose: () => void
  onOpenIncident?: (incidentId: string) => void
}) {
  const [tab, setTab] = useState<"dossier" | "card">("dossier")
  const [copied, setCopied] = useState(false)
  const engaged = incidents.filter((incident) => runtime?.incidentIds.includes(incident.id))
  const clearance = getClearanceStamp(agent.clearance)

  // Construct official A2A discovery card format
  const a2aCardJson = JSON.stringify(
    {
      agentId: agent.id,
      name: agent.name,
      callsign: agent.callsign,
      class: agent.class,
      discipline: agent.discipline,
      clearance: agent.clearance,
      delegateWhen: agent.delegateWhen,
      skills: agent.skills,
      tools: agent.tools,
      capacity: agent.capacity,
      endpoint: `/api/a2a/agents/${agent.id}/.well-known/agent-card.json`,
      protocol: "A2A/2.0+JSON-RPC",
    },
    null,
    2,
  )

  const copyJson = () => {
    void navigator.clipboard.writeText(a2aCardJson)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <aside className="fleet-drawer-in flex w-full shrink-0 flex-col gap-4 rounded-shell border border-border bg-card/95 p-4 backdrop-blur-md shadow-2xl lg:w-96 relative overflow-hidden">
      {/* Top highlight */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

      {/* Header */}
      <header className="flex items-start justify-between gap-3 border-b border-border/50 pb-3">
        <div className="min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              className="inline-block size-2 rounded-full shadow-[0_0_6px_currentColor]"
              style={{
                background: `var(--phalanx-class-${agent.class})`,
                color: `var(--phalanx-class-${agent.class})`,
              }}
            />
            <span className="font-mono text-xs font-bold tracking-wider text-foreground uppercase">
              {agent.callsign}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">({agent.id})</span>
          </div>

          <h2 className="truncate text-sm font-bold text-foreground">{agent.name}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold ${clearance.variant}`}>
              {clearance.label}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {CLASS_LABEL[agent.class]}
            </span>
          </div>
        </div>

        <Button size="icon" variant="ghost" className="size-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={onClose} aria-label="Close">
          <X className="size-3.5" />
        </Button>
      </header>

      {/* View Switcher: Profile vs A2A Agent Card */}
      <div className="flex items-center rounded-control border border-border/80 bg-black/40 p-0.5">
        <button
          type="button"
          onClick={() => setTab("dossier")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-[10px] font-mono rounded-item transition-all ${
            tab === "dossier"
              ? "bg-primary text-primary-foreground font-bold shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="size-3" />
          <span>DOSSIER</span>
        </button>

        <button
          type="button"
          onClick={() => setTab("card")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-[10px] font-mono rounded-item transition-all ${
            tab === "card"
              ? "bg-primary text-primary-foreground font-bold shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Code className="size-3" />
          <span>A2A CARD (JSON)</span>
        </button>
      </div>

      {tab === "dossier" ? (
        <div className="flex flex-col gap-4">
          {/* Status strip */}
          <div className="flex items-center gap-2 rounded-item border border-border bg-black/40 px-3 py-2">
            <StatusDot
              tone={STATE_TONE[runtime?.state ?? "standby"] ?? "neutral"}
              pulse={runtime?.state === "working" || runtime?.state === "consulting"}
            />
            <span className="text-xs text-foreground font-medium">{runtime?.activity ?? "Standing by"}</span>
            <span className="ml-auto font-mono text-[10px] uppercase text-muted-foreground">
              {runtime?.state ?? "standby"}
            </span>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">{agent.summary}</p>

          <div>
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              DELEGATE WHEN
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-foreground/90 bg-card/70 border border-border/60 rounded-item p-2.5">
              {agent.delegateWhen}
            </p>
          </div>

          <Separator />

          <div className="grid grid-cols-3 gap-2">
            <Metric label="TASKS" value={String(runtime?.tasksHandled ?? 0)} />
            <Metric label="FINDINGS" value={String(runtime?.findings ?? 0)} />
            <Metric label="CAPACITY" value={`${runtime?.incidentIds.length ?? 0}/${agent.capacity}`} />
          </div>

          {runtime && runtime.tokens.output > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              <Metric label="INPUT TOKENS" value={compact(runtime.tokens.input)} />
              <Metric label="OUTPUT TOKENS" value={compact(runtime.tokens.output)} />
            </div>
          ) : null}

          <Separator />

          <div>
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              A2A PUBLISHED SKILLS
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {agent.skills.map((skill) => (
                <li key={skill.id} className="rounded border border-border/50 bg-black/30 p-2">
                  <div className="font-mono text-[11px] font-bold text-primary">{skill.id}</div>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{skill.description}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              INSTRUMENTS & MCP TOOLS
            </h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {agent.tools.map((tool) => (
                <Badge key={tool} variant="outline" className="font-mono text-[10px] border-border/80 bg-black/40 text-muted-foreground">
                  {tool}
                </Badge>
              ))}
            </div>
          </div>

          {engaged.length > 0 ? (
            <div>
              <h3 className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                ACTIVELY ENGAGED ON
              </h3>
              <ul className="mt-2 flex flex-col gap-1.5">
                {engaged.map((incident) => (
                  <li key={incident.id}>
                    <button
                      type="button"
                      className="w-full rounded-item border border-border bg-card/60 p-2 text-left hover:bg-secondary transition-colors"
                      onClick={() => onOpenIncident?.(incident.id)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-foreground">{incident.code}</span>
                        <span className="ml-auto font-mono text-[10px] text-muted-foreground uppercase">{incident.phase}</span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground mt-0.5">{incident.title}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {runtime?.lastMessageAt ? (
            <p className="font-mono text-[10px] text-muted-foreground">
              LAST TELEMETRY {relative(runtime.lastMessageAt).toUpperCase()}
            </p>
          ) : null}
        </div>
      ) : (
        /* Full A2A Agent Card Document View (.well-known/agent-card.json) */
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-muted-foreground uppercase">
              /.well-known/agent-card.json
            </span>
            <Button
              size="xs"
              variant="outline"
              onClick={copyJson}
              className="h-6 px-2 font-mono text-[10px] gap-1"
            >
              {copied ? <Check className="size-3 text-positive" /> : <Copy className="size-3" />}
              <span>{copied ? "COPIED" : "COPY JSON"}</span>
            </Button>
          </div>

          <pre className="rounded-item border border-border/80 bg-black/80 p-3 font-mono text-[10.5px] leading-relaxed text-foreground overflow-x-auto max-h-[26rem] no-scrollbar">
            <code>{a2aCardJson}</code>
          </pre>
        </div>
      )}
    </aside>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/60 bg-black/30 p-2">
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-xs sm:text-sm font-bold text-foreground mt-0.5">{value}</div>
    </div>
  )
}
