import { useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Badge } from "@foundry/ui/components/badge"
import { Button } from "@foundry/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/components/card"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { ArrowLeft } from "lucide-react"
import { A2UISurface } from "@/components/a2ui-surface"
import { RangePanel } from "@/components/range-panel"
import { AgentDetail } from "@/components/agent-detail"
import { BusTrace } from "@/components/bus-trace"
import { SectionHeader } from "@/components/section-header"
import { BusLegend, ClassLegend, SwarmGraph } from "@/components/swarm-graph"
import { duration, shortTime } from "@/lib/format"
import { buildIncidentLayout } from "@/lib/graph-model"
import { PHASE_ORDER, type IncidentSeverity, type IncidentTimelineEntry } from "@/lib/model"
import { IncidentEvidence } from "@/components/incident-evidence"
import { phalanxApi, useAgentIndex, usePhalanx, useIncidentList } from "@/lib/store"

/* One incident, and the swarm working it.
   The card column on the right is published by this incident's commander over
   A2UI as the response develops; the graph beside it is the same information
   as topology. */

const SEV_CLASS: Record<IncidentSeverity, string> = {
  sev1: "text-[color:var(--phalanx-sev1)] border-[color:var(--phalanx-sev1)]/40",
  sev2: "text-[color:var(--phalanx-sev2)] border-[color:var(--phalanx-sev2)]/40",
  sev3: "text-[color:var(--phalanx-sev3)] border-[color:var(--phalanx-sev3)]/40",
  sev4: "text-muted-foreground border-border",
}

const TONE_TEXT: Record<IncidentTimelineEntry["tone"], string> = {
  neutral: "text-muted-foreground",
  info: "text-info",
  positive: "text-positive",
  warning: "text-warning",
  negative: "text-destructive",
}

export function IncidentDetailPage() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const state = usePhalanx()
  const agents = useAgentIndex()
  const incidents = useIncidentList()
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)

  const incident = state.incidents.get(id)
  const layout = useMemo(
    () => buildIncidentLayout({ agents: state.agents, runtime: state.runtime, incidents, incidentId: id }),
    [state.agents, state.runtime, incidents, id],
  )

  if (!incident) {
    return (
      <PageContent>
        <PageHeader title="Incident" />
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-foreground">That incident is not in the current world.</p>
            <Button size="sm" variant="outline" className="mt-4" onClick={() => navigate("/incidents")}>
              Back to the team
            </Button>
          </CardContent>
        </Card>
      </PageContent>
    )
  }

  const surface = state.surfaces.get(incident.surfaceId)
  const commander = agents.get(incident.commanderId)
  const incidentBus = state.bus.filter((message) => message.incidentId === incident.id)
  const agent = selectedAgent ? agents.get(selectedAgent) : undefined
  const phaseIndex = PHASE_ORDER.indexOf(incident.phase)

  return (
    <PageContent className="esper-page-scroll-fade">
      <PageHeader
        title={`${incident.code} · ${incident.title}`}
        subtitle={`${commander?.callsign ?? incident.commanderId} · ${incident.phase}`}
        actions={
          <Button size="sm" variant="ghost" render={<Link to="/incidents" />}>
            <ArrowLeft className="size-3.5" /> Team
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline" className={`font-mono text-[11px] ${SEV_CLASS[incident.severity]}`}>
          {incident.severity}
        </Badge>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <StatusDot
            tone={incident.status === "resolved" ? "positive" : incident.status === "contained" ? "warning" : "negative"}
            pulse={incident.status === "open"}
          />
          {incident.status}
        </span>
        <span className="text-xs text-muted-foreground">
          Elapsed <span className="font-mono text-foreground">{duration(incident.openedAt, incident.closedAt)}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          Confidence <span className="font-mono text-foreground">{incident.confidence}%</span>
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {PHASE_ORDER.map((phase, index) => (
            <span
              key={phase}
              className={`rounded-item px-2 py-0.5 font-mono text-[10px] ${
                index < phaseIndex
                  ? "text-muted-foreground"
                  : index === phaseIndex
                    ? "bg-primary-surface text-primary"
                    : "text-muted-foreground/40"
              }`}
            >
              {phase}
            </span>
          ))}
        </div>
      </div>

      <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">{incident.summary}</p>

      {incident.links.length > 0 ? (
        <div className="rounded-item border border-warning/35 bg-warning-surface px-3 py-2">
          <p className="text-xs text-warning">
            Part of a wider campaign.{" "}
            {incident.links.map((link) => {
              const other = state.incidents.get(link.incidentId)
              return other ? (
                <Link key={link.incidentId} to={`/incidents/${link.incidentId}`} className="underline">
                  {other.code}
                </Link>
              ) : null
            })}
            {" — "}
            {incident.links[0]!.reason}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <SectionHeader title="Swarm in action">
            <ClassLegend />
          </SectionHeader>
          <div className="flex flex-col gap-3 2xl:flex-row">
            <SwarmGraph
              key={state.generation}
              layout={layout}
              bus={state.bus}
              selected={selectedAgent}
              onSelect={setSelectedAgent}
              className="h-[30rem] w-full 2xl:flex-1"
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
          <BusLegend />

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-medium">Tasking</CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              {incident.assignments.length === 0 ? (
                <p className="text-xs text-muted-foreground">The commander has not tasked anyone yet.</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {incident.assignments.map((assignment) => {
                    const assignee = agents.get(assignment.agentId)
                    return (
                      <li key={assignment.agentId} className="grid grid-cols-[6.5rem_1fr] gap-3">
                        <button
                          type="button"
                          className="flex items-start gap-1.5 text-left"
                          onClick={() => setSelectedAgent(assignment.agentId)}
                        >
                          <span
                            className="mt-1 inline-block size-1.5 shrink-0 rounded-full"
                            style={{ background: `var(--esper-class-${assignee?.class ?? "analysis"})` }}
                          />
                          <span className="font-mono text-[11px] text-foreground">{assignee?.callsign ?? assignment.agentId}</span>
                        </button>
                        <p className="text-xs leading-relaxed text-muted-foreground">{assignment.objective}</p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-medium">A2A traffic on this incident</CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              <BusTrace
                messages={incidentBus}
                agents={agents}
                onSelectAgent={setSelectedAgent}
                emptyText="Nothing on the bus for this incident yet."
                limit={40}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <SectionHeader title={`${commander?.callsign ?? "Commander"}'s view`}>
            <span className="font-mono text-[11px] text-muted-foreground">A2UI</span>
          </SectionHeader>
          {incident.scenarioId === "range" && state.rangeStatus ? <RangePanel status={state.rangeStatus} /> : null}
          <A2UISurface
            surface={surface}
            onAction={(actionId, payload) => void phalanxApi.action(incident.surfaceId, actionId, payload)}
            empty={<p className="text-xs text-muted-foreground">The commander has not published a card yet.</p>}
          />

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-medium">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              {incident.timeline.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing recorded yet.</p>
              ) : (
                <ol className="flex flex-col gap-2.5">
                  {[...incident.timeline].reverse().map((entry) => (
                    <li key={entry.id} className="grid grid-cols-[4.5rem_1fr] gap-3">
                      <span className="font-mono text-[11px] text-muted-foreground">{shortTime(entry.at)}</span>
                      <p className="text-xs leading-relaxed">
                        <span className="font-mono text-[11px] text-muted-foreground">{entry.actorName}</span>{" "}
                        <span className={TONE_TEXT[entry.tone]}>{entry.text}</span>
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {incident.indicators.length > 0 || incident.assets.length > 0 ? (
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-sm font-medium">Scope & Assets</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 pt-3">
                {incident.assets.length > 0 ? (
                  <div>
                    <div className="text-[11px] text-muted-foreground">Affected Estate Assets</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {incident.assets.map((asset) => (
                        <Badge key={asset} variant="outline" className="font-mono text-[10px] text-muted-foreground">
                          {asset}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                {incident.indicators.length > 0 ? (
                  <div>
                    <div className="text-[11px] text-muted-foreground">Observed Indicators</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {incident.indicators.map((indicator) => (
                        <Badge key={indicator} variant="outline" className="font-mono text-[10px] text-destructive">
                          {indicator}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <IncidentEvidence incident={incident} />
        </div>
      </div>
    </PageContent>
  )
}
