import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@foundry/ui/components/badge"
import { Button } from "@foundry/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/components/card"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { ArrowRight } from "lucide-react"
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
   The overview of incidents, and — the reason this page exists rather than
   being a list — one graph of the entire team working every incident at the
   same time, with the commanders' own coordination drawn between them. */

const SEV_CLASS: Record<IncidentSeverity, string> = {
  sev1: "text-[color:var(--phalanx-sev1)] border-[color:var(--phalanx-sev1)]/40",
  sev2: "text-[color:var(--phalanx-sev2)] border-[color:var(--phalanx-sev2)]/40",
  sev3: "text-[color:var(--phalanx-sev3)] border-[color:var(--phalanx-sev3)]/40",
  sev4: "text-muted-foreground border-border",
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
        subtitle={`${incidents.filter((each) => each.status !== "resolved").length} open · ${engagedCount} agents engaged`}
        actions={<RunControls compact />}
      />

      <div className="flex flex-col gap-3">
        <SectionHeader title="Incidents">
          <span className="text-[11px] text-muted-foreground">Open an incident to watch its swarm</span>
        </SectionHeader>
        {incidents.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-foreground">No incidents.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Run the multi-front campaign to see two commanders working different fronts of the same adversary.
              </p>
              <div className="mt-4 flex justify-center">
                <RunControls />
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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

      <div className="flex flex-col gap-3">
        <SectionHeader title="The whole team, right now">
          <ClassLegend />
        </SectionHeader>
        <div className="flex flex-col gap-3 lg:flex-row">
          <SwarmGraph
            key={state.generation}
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BusLegend />
          <p className="text-[11px] text-muted-foreground">
            Dashed amber links are commander-to-commander. Dashed rings mark an agent working more than one incident.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium">Commander coordination</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            {commanderTraffic.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Commanders have not needed each other yet. They will when two incidents share infrastructure.
              </p>
            ) : (
              <BusTrace messages={commanderTraffic} agents={agents} onSelectAgent={setSelectedAgent} limit={12} />
            )}
            {sharedAgents.length > 0 ? (
              <div className="mt-4 border-t border-border pt-3">
                <h4 className="text-xs font-medium text-foreground">Shared specialists</h4>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {sharedAgents.map((node) => (
                    <li key={node.id} className="flex items-center gap-2 text-xs">
                      <StatusDot tone="warning" pulse />
                      <span className="font-mono text-[11px] text-foreground">{node.label}</span>
                      <span className="text-muted-foreground">{node.activity}</span>
                      <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                        {node.incidentIds.length} incidents
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium">All traffic</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
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
  return (
    <Card className={focused ? "border-primary/50" : undefined}>
      <CardHeader className="gap-1.5 pb-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`font-mono text-[10px] ${SEV_CLASS[incident.severity]}`}>
            {incident.severity}
          </Badge>
          <span className="font-mono text-[11px] text-foreground">{incident.code}</span>
          <StatusDot
            tone={resolved ? "positive" : incident.status === "contained" ? "warning" : "negative"}
            pulse={!resolved}
            className="ml-auto"
          />
        </div>
        <CardTitle className="text-sm font-medium normal-case leading-snug tracking-normal">{incident.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-3">
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{incident.summary}</p>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <Field label="Commander" value={commanderName} />
          <Field label="Phase" value={incident.phase} />
          <Field label="Agents" value={String(engaged)} />
          <Field label="Elapsed" value={duration(incident.openedAt, incident.closedAt)} />
        </div>

        <div>
          <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
            <span>Response plan</span>
            <span className="font-mono">{incident.progress}%</span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-well">
            <div
              className={`h-full rounded-full transition-all duration-700 ${resolved ? "bg-positive" : "bg-primary"}`}
              style={{ width: `${incident.progress}%` }}
            />
          </div>
        </div>

        {incident.links.length > 0 ? (
          <p className="text-[11px] text-warning">
            Linked to {incident.links.length} other incident{incident.links.length === 1 ? "" : "s"} — {incident.links[0]!.reason}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <Button size="sm" className="flex-1" onClick={onOpen}>
            Open swarm <ArrowRight className="size-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={onFocus}>
            {focused ? "Unfocus" : "Focus"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Updated {relative(incident.updatedAt)}</p>
      </CardContent>
    </Card>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-mono text-[11px] text-foreground">{value}</div>
    </div>
  )
}
