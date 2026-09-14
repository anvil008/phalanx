import { useState } from "react"
import { Button } from "@foundry/ui/components/button"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { X, Check, Copy } from "lucide-react"
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

  // The published A2A discovery card, verbatim.
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
    <aside className="fleet-drawer-in flex w-full shrink-0 flex-col gap-3 border-l border-rule bg-card p-3.5 lg:w-96">
      <header className="flex items-start justify-between gap-3 border-b border-rule-soft pb-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="meta-mono flex items-center gap-2 text-ink!">
            <span
              className="phalanx-signal"
              style={{ color: `var(--phalanx-class-${agent.class})` }}
            />
            {agent.callsign}
            <span className="text-muted-foreground">{agent.id}</span>
          </span>
          <h2 className="title truncate text-[0.9375rem]">{agent.name}</h2>
          <span className="meta-mono">
            {agent.discipline} · {CLASS_LABEL[agent.class]} · {agent.clearance} clearance
          </span>
        </div>

        <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={onClose} aria-label="Close">
          <X className="size-3.5" />
        </Button>
      </header>

      {/* Dossier or the raw discovery card — a label with a rule under it, never a pill. */}
      <div className="flex items-center gap-5 border-b border-rule-soft">
        <TabButton active={tab === "dossier"} onClick={() => setTab("dossier")} label="Dossier" />
        <TabButton active={tab === "card"} onClick={() => setTab("card")} label="Agent card" />
      </div>

      {tab === "dossier" ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-rule-soft pb-3">
            <StatusDot
              tone={STATE_TONE[runtime?.state ?? "standby"] ?? "neutral"}
              pulse={runtime?.state === "working" || runtime?.state === "consulting"}
            />
            <span className="prose text-[0.75rem]! text-ink!">{runtime?.activity ?? "Standing by"}</span>
            <span className="meta-mono ml-auto">{runtime?.state ?? "standby"}</span>
          </div>

          <p className="prose text-[0.75rem]!">{agent.summary}</p>

          <div className="flex flex-col gap-1.5">
            <h3 className="eyebrow">Delegate when</h3>
            <p className="prose text-[0.75rem]! text-ink-soft!">{agent.delegateWhen}</p>
          </div>

          <dl className="grid grid-cols-3 gap-3 border-t border-rule-soft pt-3">
            <Metric label="Tasks" value={String(runtime?.tasksHandled ?? 0)} />
            <Metric label="Findings" value={String(runtime?.findings ?? 0)} />
            <Metric label="Capacity" value={`${runtime?.incidentIds.length ?? 0} / ${agent.capacity}`} />
          </dl>

          {runtime && runtime.tokens.output > 0 ? (
            <dl className="grid grid-cols-2 gap-3">
              <Metric label="Input tokens" value={compact(runtime.tokens.input)} />
              <Metric label="Output tokens" value={compact(runtime.tokens.output)} />
            </dl>
          ) : null}

          <div className="flex flex-col gap-1.5 border-t border-rule-soft pt-3">
            <h3 className="eyebrow">Published skills</h3>
            <ul className="flex flex-col">
              {agent.skills.map((skill) => (
                <li key={skill.id} className="rule-row gap-1!">
                  <span className="meta-mono text-accent-indigo!">{skill.id}</span>
                  <span className="prose text-[0.75rem]!">{skill.description}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="eyebrow">Instruments</h3>
            <div className="concepts">
              {agent.tools.map((tool) => (
                <span key={tool}>{tool}</span>
              ))}
            </div>
          </div>

          {engaged.length > 0 ? (
            <div className="flex flex-col gap-1.5 border-t border-rule-soft pt-3">
              <h3 className="eyebrow">Engaged on</h3>
              <ul className="flex flex-col">
                {engaged.map((incident) => (
                  <li key={incident.id}>
                    <button
                      type="button"
                      className="rule-row w-full gap-1! text-left"
                      onClick={() => onOpenIncident?.(incident.id)}
                    >
                      <span className="meta-mono flex items-center gap-2 text-ink!">
                        {incident.code}
                        <span className="ml-auto text-muted-foreground">{incident.phase}</span>
                      </span>
                      <span className="prose truncate text-[0.75rem]!">{incident.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {runtime?.lastMessageAt ? (
            <p className="meta-mono">Last telemetry {relative(runtime.lastMessageAt)}</p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="meta-mono">/.well-known/agent-card.json</span>
            <Button size="xs" variant="outline" onClick={copyJson} className="gap-1">
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </Button>
          </div>

          <pre className="no-scrollbar max-h-[26rem] overflow-auto border border-rule p-3 font-mono text-[0.75rem] leading-relaxed text-muted-foreground">
            <code>{a2aCardJson}</code>
          </pre>
        </div>
      )}
    </aside>
  )
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`meta-mono -mb-px border-b pb-1.5 transition-colors ${
        active ? "border-[var(--accent)] text-ink!" : "border-transparent hover:text-ink!"
      }`}
    >
      {label}
    </button>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="eyebrow">{label}</dt>
      <dd className="font-mono text-sm text-ink!">{value}</dd>
    </div>
  )
}
