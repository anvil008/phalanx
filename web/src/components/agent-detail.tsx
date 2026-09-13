import { Badge } from "@foundry/ui/components/badge"
import { Button } from "@foundry/ui/components/button"
import { Separator } from "@foundry/ui/components/separator"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { X } from "lucide-react"
import type { AgentDef, AgentRuntime, Incident } from "@/lib/model"
import { CLASS_LABEL } from "@/lib/model"
import { compact, relative } from "@/lib/format"

const STATE_TONE: Record<string, "neutral" | "positive" | "negative" | "warning" | "info" | "faint"> = {
  standby: "faint",
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
  const engaged = incidents.filter((incident) => runtime?.incidentIds.includes(incident.id))
  return (
    <aside className="fleet-drawer-in flex w-full shrink-0 flex-col gap-4 rounded-shell border border-border bg-card p-4 lg:w-88">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-block size-2 rounded-full" style={{ background: `var(--phalanx-class-${agent.class})` }} />
            <span className="font-mono text-xs text-muted-foreground">{agent.id}</span>
          </div>
          <h2 className="mt-1 truncate text-sm font-medium text-foreground">{agent.name}</h2>
          <p className="text-xs text-muted-foreground">
            {CLASS_LABEL[agent.class]} · {agent.discipline}
          </p>
        </div>
        <Button size="icon" variant="ghost" className="size-6 shrink-0" onClick={onClose} aria-label="Close">
          <X className="size-3.5" />
        </Button>
      </header>

      <div className="flex items-center gap-2 rounded-item border border-border bg-well px-2.5 py-2">
        <StatusDot
          tone={STATE_TONE[runtime?.state ?? "standby"] ?? "neutral"}
          pulse={runtime?.state === "working" || runtime?.state === "consulting"}
        />
        <span className="text-xs text-foreground">{runtime?.activity ?? "Standing by"}</span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{runtime?.state ?? "standby"}</span>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{agent.summary}</p>

      <div>
        <h3 className="text-xs font-medium text-foreground">Delegate when</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{agent.delegateWhen}</p>
      </div>

      <Separator />

      <div className="grid grid-cols-3 gap-3">
        <Metric label="Tasks" value={String(runtime?.tasksHandled ?? 0)} />
        <Metric label="Findings" value={String(runtime?.findings ?? 0)} />
        <Metric label="Capacity" value={`${runtime?.incidentIds.length ?? 0}/${agent.capacity}`} />
      </div>
      {runtime && runtime.tokens.output > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Input tokens" value={compact(runtime.tokens.input)} />
          <Metric label="Output tokens" value={compact(runtime.tokens.output)} />
        </div>
      ) : null}

      <Separator />

      <div>
        <h3 className="text-xs font-medium text-foreground">A2A skills</h3>
        <ul className="mt-2 flex flex-col gap-2">
          {agent.skills.map((skill) => (
            <li key={skill.id}>
              <div className="font-mono text-[11px] text-foreground">{skill.id}</div>
              <p className="text-xs leading-relaxed text-muted-foreground">{skill.description}</p>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-xs font-medium text-foreground">Instruments</h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {agent.tools.map((tool) => (
            <Badge key={tool} variant="outline" className="font-mono text-[10px] text-muted-foreground">
              {tool}
            </Badge>
          ))}
        </div>
      </div>

      {engaged.length > 0 ? (
        <div>
          <h3 className="text-xs font-medium text-foreground">Engaged on</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {engaged.map((incident) => (
              <li key={incident.id}>
                <button
                  type="button"
                  className="w-full rounded-item border border-border px-2.5 py-1.5 text-left hover:bg-accent"
                  onClick={() => onOpenIncident?.(incident.id)}
                >
                  <span className="font-mono text-[11px] text-foreground">{incident.code}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{incident.phase}</span>
                  <p className="truncate text-xs text-muted-foreground">{incident.title}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {runtime?.lastMessageAt ? (
        <p className="text-[11px] text-muted-foreground">Last active {relative(runtime.lastMessageAt)}</p>
      ) : null}
    </aside>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-mono text-sm text-foreground">{value}</div>
    </div>
  )
}
