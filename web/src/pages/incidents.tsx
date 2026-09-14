import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@foundry/ui/components/badge"
import { Button } from "@foundry/ui/components/button"
import { Card, CardContent, CardHeader } from "@foundry/ui/components/card"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { ArrowRight, Shield, Activity } from "lucide-react"
import { AgentDetail } from "@/components/agent-detail"
import { BusTrace } from "@/components/bus-trace"
import { RunControls } from "@/components/run-controls"
import { SectionHeader } from "@/components/section-header"
import { BusLegend, ClassLegend, SwarmGraph } from "@/components/swarm-graph"
import { duration, relative } from "@/lib/format"
import { buildCampaignLayout } from "@/lib/graph-model"
import type { Incident, IncidentSeverity } from "@/lib/model"
import { useAgentIndex, usePhalanx, useIncidentList } from "@/lib/store"

/* Incident Response Team.
   Executive incident command view with real-time swarm orchestration,
   coordination bus links, and cross-incident specialist sharing. */

const SEV_CLASS: Record<IncidentSeverity, { badge: string; text: string }> = {
  sev1: {
    badge: "border-destructive/50 bg-destructive/15 text-destructive",
    text: "text-destructive",
  },
  sev2: {
    badge: "border-warning/50 bg-warning/15 text-warning",
    text: "text-warning",
  },
  sev3: {
    badge: "border-primary/50 bg-primary/15 text-primary",
    text: "text-primary",
  },
  sev4: {
    badge: "border-border bg-black/40 text-muted-foreground",
    text: "text-muted-foreground",
  },
}

export function IncidentsPage() {
  const navigate = useNavigate()
  const state = usePhalanx()
  const agents = useAgentIndex()
  const incidents = useIncidentList()
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)

  const layout = useMemo(
    () => buildCampaignLayout({ agents: state.agents, runtime: state.runtime, incidents }),
    [state.agents, state.runtime, incidents],
  )

  const engagedCount = [...state.runtime.values()].filter((each) => each.incidentIds.length > 0).length
  const sharedAgents = layout.nodes.filter((node) => node.shared)
  const commanderTraffic = state.bus.filter(
    (message) =>
      message.fromAgentId.startsWith("ic-") && (message.toAgentId?.startsWith("ic-") ?? false),
  )
  const agent = selectedAgent ? agents.get(selectedAgent) : undefined

  return (
    <PageContent className="phalanx-page-scroll-fade">
      <PageHeader
        title="Incident Response Team"
        subtitle={`${incidents.filter((each) => each.status !== "resolved").length} active breaches · ${engagedCount} specialists dispatched`}
        actions={<RunControls compact />}
      />

      {/* Active Incidents Grid */}
      <div className="flex flex-col gap-3">
        <SectionHeader title="ACTIVE ENGAGEMENTS">
          <span className="font-mono text-[10px] text-muted-foreground">SELECT INCIDENT TO INSPECT SWARM MESH</span>
        </SectionHeader>

        {incidents.length === 0 ? (
          <Card className="border-border bg-card/75">
            <CardContent className="py-10 text-center">
              <Shield className="size-6 text-positive mx-auto mb-2" />
              <p className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">
                No active security incidents
              </p>
              <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                Execute an attack scenario or multi-front campaign from the toolbar to observe autonomous incident commanders coordinating response squads.
              </p>
              <div className="mt-4 flex justify-center">
                <RunControls />
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
            {incidents.map((incident) => (
              <IncidentTile
                key={incident.id}
                incident={incident}
                commanderName={agents.get(incident.commanderId)?.callsign ?? incident.commanderId}
                engaged={
                  [...state.runtime.values()].filter((each) => each.incidentIds.includes(incident.id)).length
                }
                focused={focus === incident.id}
                onFocus={() => setFocus(focus === incident.id ? null : incident.id)}
                onOpen={() => navigate(`/incidents/${incident.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Swarm Graph Instrument Section */}
      <div className="flex flex-col gap-3 mt-2">
        <SectionHeader title="FULL ESTATE TELEMETRY · MULTI-INCIDENT SWARM">
          <ClassLegend />
        </SectionHeader>

        <div className="flex flex-col gap-3 lg:flex-row">
          <SwarmGraph
            generation={state.generation}
            layout={layout}
            bus={state.bus}
            selected={selectedAgent}
            onSelect={setSelectedAgent}
            focusIncidentId={focus}
            onOpenIncident={(incidentId) => navigate(`/incidents/${incidentId}`)}
            className="h-[34rem] w-full lg:flex-1"
          />
          {agent ? (
            <AgentDetail
              agent={agent}
              runtime={state.runtime.get(agent.id)}
              incidents={incidents}
              onClose={() => setSelectedAgent(null)}
              onOpenIncident={(incidentId) => navigate(`/incidents/${incidentId}`)}
            />
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <BusLegend />
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
            Amber dashed links mark commander cross-correlation · Multi-ring nodes represent shared capacity
          </p>
        </div>
      </div>

      {/* Coordination & Traffic Strips */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border bg-card/85">
          <CardHeader className="pb-0 pt-3.5 px-4 border-b border-border/40">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Activity className="size-3.5 text-primary" />
              <span>COMMANDER-TO-COMMANDER A2A ARBITRATION</span>
            </span>
          </CardHeader>
          <CardContent className="pt-3 px-4">
            {commanderTraffic.length === 0 ? (
              <p className="font-mono text-xs text-muted-foreground py-4">
                Commanders have not required cross-incident arbitration yet. Real-time indicator correlation triggers when campaigns cross infrastructure zones.
              </p>
            ) : (
              <BusTrace messages={commanderTraffic} agents={agents} onSelectAgent={setSelectedAgent} limit={12} />
            )}

            {sharedAgents.length > 0 ? (
              <div className="mt-4 border-t border-border/50 pt-3">
                <h4 className="font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Shared Responders (Dual Front Capacity)
                </h4>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {sharedAgents.map((node) => (
                    <li key={node.id} className="flex items-center gap-2 text-xs rounded border border-border/50 bg-black/40 p-2 font-mono">
                      <StatusDot tone="warning" pulse />
                      <span className="font-bold text-foreground">{node.label}</span>
                      <span className="text-muted-foreground truncate">{node.activity}</span>
                      <span className="ml-auto text-[10px] text-warning shrink-0">
                        {node.incidentIds.length} INCIDENTS
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border bg-card/85">
          <CardHeader className="pb-0 pt-3.5 px-4 border-b border-border/40">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Activity className="size-3.5 text-primary" />
              <span>LIVE PROTOCOL BUS TRAFFIC</span>
            </span>
          </CardHeader>
          <CardContent className="pt-3 px-4">
            <BusTrace messages={state.bus} agents={agents} onSelectAgent={setSelectedAgent} limit={16} />
          </CardContent>
        </Card>
      </div>
    </PageContent>
  )
}

function IncidentTile({
  incident,
  commanderName,
  engaged,
  focused,
  onFocus,
  onOpen,
}: {
  incident: Incident
  commanderName: string
  engaged: number
  focused: boolean
  onFocus: () => void
  onOpen: () => void
}) {
  const resolved = incident.status === "resolved"
  const sevInfo = SEV_CLASS[incident.severity] ?? SEV_CLASS.sev4

  return (
    <Card
      className={`transition-all duration-200 bg-card/80 backdrop-blur-md relative overflow-hidden ${
        focused
          ? "border-primary shadow-[0_0_16px_rgba(76,201,217,0.3)] ring-1 ring-primary/40"
          : "border-border hover:border-border/90 hover:bg-card/95"
      }`}
    >
      {/* Top severity accent line */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] ${resolved ? "bg-positive" : incident.severity === "sev1" ? "bg-destructive" : "bg-warning"}`} />

      <CardHeader className="gap-2 pb-0 p-4">
        <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`font-mono text-[10px] font-bold ${sevInfo.badge}`}>
              {incident.severity.toUpperCase()}
            </Badge>
            <span className="font-mono text-xs font-bold text-foreground">{incident.code}</span>
          </div>

          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase text-muted-foreground">
            <StatusDot
              tone={resolved ? "positive" : incident.status === "contained" ? "warning" : "negative"}
              pulse={!resolved}
            />
            <span>{incident.status}</span>
          </div>
        </div>

        <h3 className="text-xs font-bold text-foreground leading-snug">{incident.title}</h3>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 p-4 pt-2">
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{incident.summary}</p>

        {/* Space Mono metadata fields */}
        <div className="grid grid-cols-2 gap-2 rounded-item border border-border/60 bg-black/40 p-2.5 font-mono">
          <Field label="COMMANDER" value={commanderName} />
          <Field label="PHASE" value={incident.phase.toUpperCase()} />
          <Field label="SPECIALISTS" value={`${engaged} ENGAGED`} />
          <Field label="ELAPSED" value={duration(incident.openedAt, incident.closedAt)} />
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-baseline justify-between font-mono text-[10px] text-muted-foreground">
            <span>RESPONSE PLAN EXECUTION</span>
            <span className="text-foreground font-bold">{incident.progress}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border/60">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                resolved ? "bg-positive" : incident.severity === "sev1" ? "bg-destructive" : "bg-primary"
              }`}
              style={{ width: `${incident.progress}%` }}
            />
          </div>
        </div>

        {incident.links.length > 0 ? (
          <div className="rounded border border-warning/40 bg-warning/10 p-1.5 font-mono text-[10.5px] text-warning flex items-center gap-1.5">
            <Activity className="size-3 shrink-0" />
            <span className="truncate">
              Linked to {incident.links.length} campaign front ({incident.links[0]!.reason})
            </span>
          </div>
        ) : null}

        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" className="flex-1 font-mono text-[11px] h-7 gap-1" onClick={onOpen}>
            <span>OPEN SWARM GRAPH</span>
            <ArrowRight className="size-3" />
          </Button>
          <Button size="sm" variant="outline" className="font-mono text-[11px] h-7 px-3" onClick={onFocus}>
            {focused ? "UNFOCUS" : "FOCUS"}
          </Button>
        </div>

        <div className="font-mono text-[9px] text-muted-foreground/70 uppercase">
          UPDATED {relative(incident.updatedAt)}
        </div>
      </CardContent>
    </Card>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-[11px] font-bold text-foreground truncate mt-0.5">{value}</div>
    </div>
  )
}
