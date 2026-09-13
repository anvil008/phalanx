import { useNavigate } from "react-router-dom"
import { Badge } from "@foundry/ui/components/badge"
import { Button } from "@foundry/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/components/card"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { Radio, RotateCcw } from "lucide-react"
import { A2UISurface } from "@/components/a2ui-surface"
import { DemoHero } from "@/components/demo-hero"
import { KillChain } from "@/components/kill-chain"
import { RangePanel } from "@/components/range-panel"
import { BusTrace } from "@/components/bus-trace"
import { SectionHeader } from "@/components/section-header"
import { relative, shortTime } from "@/lib/format"
import type { IncidentSeverity } from "@/lib/model"
import { phalanxApi, useAgentIndex, usePhalanx, useIncidentList } from "@/lib/store"

/* Mission Control.
   Not an incident list — the standing view of the estate and the swarm, with
   the agents' own live cards on it. The card column is authored by the
   commanders at run time over A2UI; everything around it is ours. */

const THREAT_TONE = {
  green: "positive",
  amber: "warning",
  red: "negative",
  black: "negative",
} as const

const SEV_CLASS: Record<IncidentSeverity, string> = {
  sev1: "text-[color:var(--phalanx-sev1)] border-[color:var(--phalanx-sev1)]/40",
  sev2: "text-[color:var(--phalanx-sev2)] border-[color:var(--phalanx-sev2)]/40",
  sev3: "text-[color:var(--phalanx-sev3)] border-[color:var(--phalanx-sev3)]/40",
  sev4: "text-muted-foreground border-border",
}

export function MissionControlPage() {
  const navigate = useNavigate()
  const state = usePhalanx()
  const agents = useAgentIndex()
  const incidents = useIncidentList()
  const surface = state.surfaces.get("mission-control")
  const engaged = [...state.runtime.values()].filter((each) => each.incidentIds.length > 0)
  const affectedHosts = [...state.hosts.values()].filter((host) => host.status !== "healthy")

  return (
    <PageContent className="phalanx-page-scroll-fade">
      <PageHeader
        title="Mission Control"
        subtitle={state.mode === "live" ? `Live Swarm (${state.commanderModel}) · real-time reasoning` : "Deterministic Replay · verified SOC telemetry"}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[11px] border-border/80 bg-black/40 gap-1.5 h-7 px-2.5">
              <StatusDot tone={state.mode === "live" ? "positive" : "info"} size="xs" />
              <span>{state.mode === "live" ? "Live Swarm" : "Deterministic Replay"}</span>
            </Badge>
            <Button
              size="xs"
              variant="outline"
              onClick={() => void phalanxApi.reset()}
              className="h-7 px-2.5 font-mono text-[11px] text-muted-foreground hover:text-destructive hover:border-destructive/40"
              title="Reset environment to clean baseline"
            >
              <RotateCcw className="size-3 mr-1" />
              Reset
            </Button>
          </div>
        }
      />

      <DemoHero />

      <div className="grid grid-cols-2 divide-y divide-border/60 rounded-lg border border-border/80 bg-card/60 backdrop-blur-sm sm:grid-cols-3 sm:divide-y-0 sm:divide-x xl:grid-cols-6 shrink-0">
        <Stat
          label="Threat level"
          value={state.posture.threatLevel.toUpperCase()}
          tone={THREAT_TONE[state.posture.threatLevel]}
          subtext={state.posture.threatLevel === "green" ? "Perimeter nominal" : "Active engagement"}
        />
        <Stat
          label="Open incidents"
          value={String(state.posture.openIncidents)}
          tone={state.posture.openIncidents > 0 ? "warning" : "positive"}
          subtext={state.posture.openIncidents === 0 ? "All queues clear" : "Active response"}
        />
        <Stat
          label="Agents engaged"
          value={`${state.posture.agentsEngaged}/${state.agents.length}`}
          subtext={state.posture.agentsEngaged === 0 ? "19 standby defenders" : "Swarm dispatched"}
        />
        <Stat
          label="Bus traffic"
          value={`${state.posture.busMessagesPerMin}/min`}
          subtext="A2A protocol flow"
        />
        <Stat
          label="Mean time to contain"
          value={state.posture.meanTimeToContainSec === null ? "—" : `${state.posture.meanTimeToContainSec}s`}
          subtext="Detect to isolate"
        />
        <Stat
          label="Contained today"
          value={String(state.posture.containedToday)}
          tone="positive"
          subtext="Automated containment"
        />
      </div>

      <KillChain state={state} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] shrink-0">
        <div className="flex flex-col gap-3">
          {state.rangeStatus ? <RangePanel status={state.rangeStatus} compact /> : null}
          <SectionHeader title="Live from the swarm">
            <span className="font-mono text-[11px] text-muted-foreground">A2UI · agent-authored</span>
          </SectionHeader>
          <A2UISurface
            surface={surface}
            onAction={(actionId, payload) => void phalanxApi.action("mission-control", actionId, payload)}
            empty={
              <Card className="border-border/60 bg-card/40">
                <CardContent className="py-10 text-center">
                  <div className="mx-auto flex size-8 items-center justify-center rounded-control border border-border/80 bg-accent/40 text-muted-foreground">
                    <Radio className="size-4 text-positive" />
                  </div>
                  <p className="mt-2.5 text-xs font-semibold text-foreground">Swarm on Standby</p>
                  <p className="mt-1 text-[11px] text-muted-foreground max-w-sm mx-auto">
                    All 19 autonomous agents are polling telemetry sensors. Launch an attack scenario above to observe real-time agent-to-agent investigation and containment cards.
                  </p>
                </CardContent>
              </Card>
            }
          />
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <SectionHeader title="Incidents" />

            {incidents.length === 0 ? (
              <p className="text-xs text-muted-foreground">No incidents open.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {incidents.slice(0, 4).map((incident) => (
                  <li key={incident.id}>
                    <button
                      type="button"
                      className="w-full rounded-item border border-border px-3 py-2 text-left transition-colors hover:bg-accent"
                      onClick={() => navigate(`/incidents/${incident.id}`)}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`font-mono text-[10px] ${SEV_CLASS[incident.severity]}`}>
                          {incident.severity}
                        </Badge>
                        <span className="font-mono text-[11px] text-foreground">{incident.code}</span>
                        <span className="ml-auto text-[11px] text-muted-foreground">{incident.phase}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{incident.title}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <SectionHeader title="Detections" />
            {state.detections.length === 0 ? (
              <p className="text-xs text-muted-foreground">Estate is quiet.</p>
            ) : (
              <ol className="flex flex-col">
                {state.detections.slice(0, 7).map((detection) => (
                  <li key={detection.id} className="grid grid-cols-[4.5rem_1fr] gap-3 border-b border-border/60 py-2 last:border-b-0">
                    <span className="font-mono text-[11px] text-muted-foreground">{shortTime(detection.at)}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusDot tone={detection.severity === "sev1" ? "negative" : detection.severity === "sev2" ? "warning" : "info"} />
                        <span className="font-mono text-[11px] text-foreground">{detection.rule}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{detection.host}</span>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{detection.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {affectedHosts.length > 0 ? (
            <div className="flex flex-col gap-2">
              <SectionHeader title="Estate" />
              <ul className="flex flex-col gap-1.5">
                {affectedHosts.map((host) => (
                  <li key={host.id} className="flex items-center gap-2 text-xs">
                    <StatusDot
                      tone={host.status === "compromised" ? "negative" : host.status === "isolated" ? "warning" : "positive"}
                    />
                    <span className="font-mono text-[11px] text-foreground">{host.name}</span>
                    <span className="text-muted-foreground">{host.status}</span>
                    <span className="ml-auto truncate text-[11px] text-muted-foreground">{host.role}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] shrink-0">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium">Coordination bus</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            <BusTrace messages={state.bus} agents={agents} limit={14} emptyText="No agent-to-agent traffic yet." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium">Fleet</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            {engaged.length === 0 ? (
              <p className="text-xs text-muted-foreground">All {state.agents.length} agents on standby.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {engaged.map((runtime) => {
                  const agent = agents.get(runtime.id)
                  if (!agent) return null
                  return (
                    <li key={runtime.id} className="flex items-center gap-2 text-xs">
                      <span className="inline-block size-1.5 rounded-full" style={{ background: `var(--phalanx-class-${agent.class})` }} />
                      <span className="font-mono text-[11px] text-foreground">{agent.callsign}</span>
                      <span className="truncate text-muted-foreground">{runtime.activity}</span>
                      <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
                        {runtime.lastMessageAt ? relative(runtime.lastMessageAt) : "—"}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContent>
  )
}

function Stat({
  label,
  value,
  tone = "neutral",
  subtext,
}: {
  label: string
  value: string
  tone?: "neutral" | "positive" | "warning" | "negative"
  subtext?: string
}) {
  const colour =
    tone === "positive"
      ? "text-positive"
      : tone === "warning"
        ? "text-warning"
        : tone === "negative"
          ? "text-destructive"
          : "text-foreground"
  return (
    <div className="flex flex-col justify-between p-3 sm:p-3.5">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-lg font-bold tracking-tight ${colour}`}>{value}</div>
      {subtext ? <div className="mt-0.5 text-[11px] text-muted-foreground/75 truncate">{subtext}</div> : null}
    </div>
  )
}
