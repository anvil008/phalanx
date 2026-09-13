import { useNavigate } from "react-router-dom"
import { Badge } from "@foundry/ui/components/badge"
import { Button } from "@foundry/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/components/card"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { Radio, RotateCcw, Shield, Activity, Terminal, CheckCircle2 } from "lucide-react"
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
   Executive SOC command deck: standing posture of the estate, swarm telemetry,
   and agent-authored A2UI cards. Adopts the warm obsidian palette and Space Mono typography. */

const THREAT_TONE = {
  green: "positive",
  amber: "warning",
  red: "negative",
  black: "negative",
} as const

const SEV_CLASS: Record<IncidentSeverity, string> = {
  sev1: "text-[color:var(--phalanx-sev1)] border-[color:var(--phalanx-sev1)]/40 bg-[color:var(--phalanx-sev1)]/10",
  sev2: "text-[color:var(--phalanx-sev2)] border-[color:var(--phalanx-sev2)]/40 bg-[color:var(--phalanx-sev2)]/10",
  sev3: "text-[color:var(--phalanx-sev3)] border-[color:var(--phalanx-sev3)]/40 bg-[color:var(--phalanx-sev3)]/10",
  sev4: "text-muted-foreground border-border bg-black/40",
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
        subtitle={
          state.mode === "live"
            ? `Live Swarm (${state.commanderModel.toUpperCase()}) · real-time multi-agent reasoning`
            : "Deterministic Replay · verified executive SOC telemetry"
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[11px] border-border/80 bg-card/70 gap-1.5 h-7 px-2.5">
              <StatusDot tone={state.mode === "live" ? "positive" : "info"} pulse={state.mode === "live"} size="xs" />
              <span>{state.mode === "live" ? "LIVE SWARM" : "REPLAY MESH"}</span>
            </Badge>
            <Button
              size="xs"
              variant="outline"
              onClick={() => void phalanxApi.reset()}
              className="h-7 px-2.5 font-mono text-[11px] text-muted-foreground hover:text-destructive hover:border-destructive/40"
              title="Reset environment to clean baseline"
            >
              <RotateCcw className="size-3 mr-1" />
              RESET
            </Button>
          </div>
        }
      />

      <DemoHero />

      {/* Stat Tiles: Space Mono metrics, micro-gauges, tracked uppercase labels */}
      <div className="grid grid-cols-2 divide-y divide-border/60 rounded-shell border border-border bg-card/80 backdrop-blur-md sm:grid-cols-3 sm:divide-y-0 sm:divide-x xl:grid-cols-6 shrink-0 shadow-lg">
        <Stat
          label="THREAT LEVEL"
          value={state.posture.threatLevel.toUpperCase()}
          tone={THREAT_TONE[state.posture.threatLevel]}
          subtext={state.posture.threatLevel === "green" ? "PERIMETER NOMINAL" : "ENGAGEMENT ACTIVE"}
          meterPercent={state.posture.threatLevel === "green" ? 15 : state.posture.threatLevel === "amber" ? 65 : 100}
        />
        <Stat
          label="OPEN INCIDENTS"
          value={String(state.posture.openIncidents)}
          tone={state.posture.openIncidents > 0 ? "warning" : "positive"}
          subtext={state.posture.openIncidents === 0 ? "ALL QUEUES CLEAR" : "ACTIVE TRIAGE"}
          meterPercent={Math.min(100, state.posture.openIncidents * 33)}
        />
        <Stat
          label="AGENTS ENGAGED"
          value={`${state.posture.agentsEngaged}/${state.agents.length}`}
          tone={state.posture.agentsEngaged > 0 ? "warning" : "neutral"}
          subtext={state.posture.agentsEngaged === 0 ? "19 STANDBY DEFENDERS" : "SWARM DISPATCHED"}
          meterPercent={(state.posture.agentsEngaged / Math.max(1, state.agents.length)) * 100}
        />
        <Stat
          label="BUS TRAFFIC"
          value={`${state.posture.busMessagesPerMin}/MIN`}
          subtext="A2A PROTOCOL FLOW"
          meterPercent={Math.min(100, state.posture.busMessagesPerMin * 5)}
        />
        <Stat
          label="MTTC"
          value={state.posture.meanTimeToContainSec === null ? "—" : `${state.posture.meanTimeToContainSec}s`}
          subtext="DETECT TO AIR-GAP"
          meterPercent={state.posture.meanTimeToContainSec ? 85 : 0}
        />
        <Stat
          label="CONTAINED TODAY"
          value={String(state.posture.containedToday)}
          tone="positive"
          subtext="AUTONOMOUS BARRIER"
          meterPercent={state.posture.containedToday > 0 ? 100 : 0}
        />
      </div>

      <KillChain state={state} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] shrink-0">
        <div className="flex flex-col gap-3">
          {state.rangeStatus ? <RangePanel status={state.rangeStatus} compact /> : null}

          {/* Enhanced "Live from the Swarm" (A2UI) Container with glowing accent bar */}
          <div className="relative overflow-hidden rounded-shell border border-border bg-card/85 backdrop-blur-md shadow-xl">
            {/* Top luminous accent bar */}
            <div className="h-[2px] w-full bg-gradient-to-r from-primary via-accent-indigo to-primary" />

            <div className="p-4 border-b border-border/50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Terminal className="size-4 text-primary" />
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-foreground">
                  LIVE FROM THE SWARM · AGENT-AUTHORED SURFACES
                </span>
              </div>
              <Badge variant="outline" className="font-mono text-[10px] border-primary/40 bg-primary/10 text-primary gap-1">
                <StatusDot tone="positive" pulse size="xs" />
                <span>A2UI RUNTIME ACTIVE</span>
              </Badge>
            </div>

            <div className="p-4">
              <A2UISurface
                surface={surface}
                onAction={(actionId, payload) => void phalanxApi.action("mission-control", actionId, payload)}
                empty={
                  <div className="py-10 text-center">
                    <div className="mx-auto flex size-9 items-center justify-center rounded-control border border-border/80 bg-accent/40 text-muted-foreground shadow-[0_0_12px_rgba(76,201,217,0.2)]">
                      <Radio className="size-4 text-positive animate-pulse" />
                    </div>
                    <p className="mt-3 font-mono text-xs font-bold uppercase tracking-wider text-foreground">
                      Swarm Polling Telemetry on Standby
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground max-w-sm mx-auto leading-relaxed">
                      All 19 blue-team defenders are continuously monitoring estate ingress and identity logs. Dispatch an attack scenario above to observe live A2UI containment cards.
                    </p>
                  </div>
                }
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* Incidents Feed */}
          <div className="flex flex-col gap-2">
            <SectionHeader title="ACTIVE INCIDENTS" />

            {incidents.length === 0 ? (
              <p className="text-xs font-mono text-muted-foreground">NO INCIDENTS OPEN · PERIMETER SECURE</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {incidents.slice(0, 4).map((incident) => (
                  <li key={incident.id}>
                    <button
                      type="button"
                      className="w-full rounded-item border border-border bg-card/60 p-3 text-left transition-all hover:bg-secondary hover:border-primary/50"
                      onClick={() => navigate(`/incidents/${incident.id}`)}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`font-mono text-[10px] ${SEV_CLASS[incident.severity]}`}>
                          {incident.severity.toUpperCase()}
                        </Badge>
                        <span className="font-mono text-xs font-bold text-foreground">{incident.code}</span>
                        <span className="ml-auto font-mono text-[10px] text-muted-foreground uppercase">{incident.phase}</span>
                      </div>
                      <p className="mt-1.5 truncate text-xs text-foreground/80 font-medium">{incident.title}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Detections Feed */}
          <div className="flex flex-col gap-2">
            <SectionHeader title="REAL-TIME DETECTIONS FEED" />
            {state.detections.length === 0 ? (
              <p className="text-xs font-mono text-muted-foreground">NO ADVERSARY ANOMALIES RECORDED.</p>
            ) : (
              <div className="rounded-item border border-border/70 bg-card/60 divide-y divide-border/40 overflow-hidden">
                {state.detections.slice(0, 6).map((detection) => (
                  <div key={detection.id} className="p-2.5 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <StatusDot tone={detection.severity === "sev1" ? "negative" : detection.severity === "sev2" ? "warning" : "info"} />
                        <span className="font-mono text-[11px] font-bold text-foreground">{detection.rule}</span>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">{shortTime(detection.at)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-muted-foreground">
                      <span className="truncate">{detection.detail}</span>
                      <span className="rounded border border-border/60 bg-black/40 px-1.5 py-0.5 text-foreground shrink-0">
                        {detection.host}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Affected Estate List with clean status pills */}
          {affectedHosts.length > 0 ? (
            <div className="flex flex-col gap-2">
              <SectionHeader title="AFFECTED ESTATE INFRASTRUCTURE" />
              <div className="rounded-item border border-border/70 bg-card/60 divide-y divide-border/40 overflow-hidden">
                {affectedHosts.map((host) => (
                  <div key={host.id} className="flex items-center justify-between p-2.5 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <StatusDot
                        tone={host.status === "compromised" ? "negative" : host.status === "isolated" ? "warning" : "positive"}
                        pulse={host.status !== "healthy"}
                      />
                      <span className="font-bold text-foreground">{host.name}</span>
                      <span className="text-muted-foreground text-[11px]">({host.role})</span>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[9px] font-bold uppercase ${
                        host.status === "isolated"
                          ? "border-warning/50 bg-warning/15 text-warning"
                          : host.status === "compromised"
                            ? "border-destructive/50 bg-destructive/15 text-destructive"
                            : "border-positive/50 bg-positive/15 text-positive"
                      }`}
                    >
                      {host.status === "isolated" ? "AIR-GAPPED" : host.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Coordination bus & fleet strip */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] shrink-0">
        <Card className="border-border bg-card/85">
          <CardHeader className="pb-0 pt-3.5 px-4 border-b border-border/40">
            <CardTitle className="font-mono text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Activity className="size-3.5 text-primary" />
              <span>A2A COORDINATION BUS LOGS</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 px-4">
            <BusTrace messages={state.bus} agents={agents} limit={14} emptyText="No agent-to-agent traffic recorded." />
          </CardContent>
        </Card>

        <Card className="border-border bg-card/85">
          <CardHeader className="pb-0 pt-3.5 px-4 border-b border-border/40">
            <CardTitle className="font-mono text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Shield className="size-3.5 text-primary" />
              <span>ACTIVE FLEET RESPONDERS</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 px-4">
            {engaged.length === 0 ? (
              <div className="py-6 text-center font-mono text-xs text-muted-foreground">
                <CheckCircle2 className="size-4 text-positive mx-auto mb-1.5" />
                <span>ALL 19 SPECIALISTS ON STANDBY PATROL</span>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {engaged.map((runtime) => {
                  const agent = agents.get(runtime.id)
                  if (!agent) return null
                  return (
                    <li key={runtime.id} className="flex items-center gap-2 text-xs rounded border border-border/40 bg-black/30 p-2">
                      <span className="inline-block size-2 rounded-full shadow-[0_0_4px_currentColor]" style={{ background: `var(--phalanx-class-${agent.class})`, color: `var(--phalanx-class-${agent.class})` }} />
                      <span className="font-mono text-xs font-bold text-foreground">{agent.callsign}</span>
                      <span className="truncate text-muted-foreground text-[11px]">{runtime.activity}</span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
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
  meterPercent,
}: {
  label: string
  value: string
  tone?: "neutral" | "positive" | "warning" | "negative"
  subtext?: string
  meterPercent?: number
}) {
  const colour =
    tone === "positive"
      ? "text-positive"
      : tone === "warning"
        ? "text-warning"
        : tone === "negative"
          ? "text-destructive"
          : "text-foreground"

  const meterColor =
    tone === "positive"
      ? "bg-positive"
      : tone === "warning"
        ? "bg-warning"
        : tone === "negative"
          ? "bg-destructive"
          : "bg-primary"

  return (
    <div className="flex flex-col justify-between p-3.5 sm:p-4">
      <div className="soc-micro-label text-muted-foreground">{label}</div>
      <div className={`mt-1.5 font-mono text-lg sm:text-xl font-bold tracking-tight ${colour}`}>{value}</div>
      {meterPercent !== undefined ? (
        <div className="mt-2 h-1 w-full rounded-full bg-border/60 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${meterColor}`}
            style={{ width: `${Math.max(4, Math.min(100, meterPercent))}%` }}
          />
        </div>
      ) : null}
      {subtext ? <div className="mt-1 font-mono text-[10px] text-muted-foreground/80 truncate uppercase tracking-wider">{subtext}</div> : null}
    </div>
  )
}
