import { useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Button } from "@foundry/ui/components/button"
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
   Topology, tasking, timeline and the commander's own A2UI card, in the same
   hairline language as the rest of the product. */

const SEV_TONE: Record<IncidentSeverity, string> = {
  sev1: "negative",
  sev2: "warning",
  sev3: "info",
  sev4: "muted",
}

const TONE_TEXT: Record<IncidentTimelineEntry["tone"], string> = {
  neutral: "text-muted-foreground",
  info: "text-info",
  positive: "text-positive",
  warning: "text-warning",
  negative: "text-destructive",
}

function severityLabel(severity: IncidentSeverity): string {
  return `Sev ${severity.slice(3)}`
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
        <PageHeader title="Incident dossier" />
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="title-serif text-[1.125rem]">Incident not found in active memory</p>
          <Button size="sm" variant="outline" onClick={() => navigate("/incidents")}>
            Return to the incident response team
          </Button>
        </div>
      </PageContent>
    )
  }

  const surface = state.surfaces.get(incident.surfaceId)
  const commander = agents.get(incident.commanderId)
  const incidentBus = state.bus.filter((message) => message.incidentId === incident.id)
  const agent = selectedAgent ? agents.get(selectedAgent) : undefined
  const phaseIndex = PHASE_ORDER.indexOf(incident.phase)

  return (
    <PageContent className="phalanx-page-scroll-fade">
      <PageHeader
        title={`${incident.code} · ${incident.title}`}
        subtitle={`Commander ${commander?.callsign ?? incident.commanderId} · phase ${incident.phase}`}
        actions={
          <Button size="sm" variant="outline" render={<Link to="/incidents" />}>
            <ArrowLeft className="size-3.5 mr-1.5" />
            <span>All incidents</span>
          </Button>
        }
      />

      {/* Status strip */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-y border-rule-soft py-3">
        <div className="flex flex-wrap items-center gap-4">
          <span className="sev-tag" data-tone={SEV_TONE[incident.severity]}>
            {severityLabel(incident.severity)}
          </span>

          <span className="meta-mono flex items-center gap-1.5">
            <StatusDot
              tone={incident.status === "resolved" ? "positive" : incident.status === "contained" ? "warning" : "negative"}
              pulse={incident.status === "open"}
            />
            <span className="text-ink">{incident.status}</span>
          </span>

          <span className="meta-mono">
            Elapsed <span className="text-ink">{duration(incident.openedAt, incident.closedAt)}</span>
          </span>

          <span className="meta-mono">
            Confidence <span className="text-ink">{incident.confidence}%</span>
          </span>
        </div>

        {/* Phase stepper */}
        <div className="meta-mono flex items-center gap-3 overflow-x-auto">
          {PHASE_ORDER.map((phase, index) => {
            const isCompleted = index < phaseIndex
            const isCurrent = index === phaseIndex
            return (
              <span key={phase} className="flex items-center gap-1.5">
                <span
                  className="inline-block size-1.5 rounded-full"
                  style={{
                    background: isCurrent
                      ? "var(--accent)"
                      : isCompleted
                        ? "var(--muted)"
                        : "var(--rule)",
                  }}
                />
                <span className={isCurrent ? "text-ink" : isCompleted ? "" : "text-muted-soft"}>{phase}</span>
              </span>
            )
          })}
        </div>
      </div>

      <p className="prose-serif max-w-[72ch]">{incident.summary}</p>

      {incident.links.length > 0 ? (
        <p className="meta-mono text-[color:var(--warning)]!">
          Part of a multi-front campaign. Correlated with{" "}
          {incident.links.map((link) => {
            const other = state.incidents.get(link.incidentId)
            return other ? (
              <Link key={link.incidentId} to={`/incidents/${link.incidentId}`} className="text-ink underline">
                {other.code}
              </Link>
            ) : null
          })}{" "}
          — {incident.links[0]!.reason}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Left column: swarm graph, tasking, incident bus */}
        <div className="flex flex-col gap-4">
          <SectionHeader title="Swarm topology">
            <ClassLegend />
          </SectionHeader>

          <div className="flex flex-col gap-3 2xl:flex-row">
            <SwarmGraph
              generation={state.generation}
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

          {/* Commander tasking */}
          <div className="flex flex-col">
            <SectionHeader title="Tasking" />
            {incident.assignments.length === 0 ? (
              <p className="meta-mono pt-3">The commander has not tasked specialists yet</p>
            ) : (
              <ul className="flex flex-col">
                {incident.assignments.map((assignment) => {
                  const assignee = agents.get(assignment.agentId)
                  return (
                    <li key={assignment.agentId} className="rule-row grid-cols-[7rem_minmax(0,1fr)] items-baseline">
                      <button
                        type="button"
                        className="meta-mono flex items-center gap-1.5 text-left text-ink! hover:text-accent-indigo!"
                        onClick={() => setSelectedAgent(assignment.agentId)}
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ background: `var(--phalanx-class-${assignee?.class ?? "analysis"})` }}
                        />
                        <span>{assignee?.callsign ?? assignment.agentId}</span>
                      </button>
                      <p className="prose-serif">{assignment.objective}</p>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Incident A2A traffic */}
          <div className="flex flex-col gap-3">
            <SectionHeader title={`Bus traffic · ${incident.code}`} />
            <BusTrace
              messages={incidentBus}
              agents={agents}
              onSelectAgent={setSelectedAgent}
              emptyText="No A2A messages on this incident bus yet."
              limit={40}
            />
          </div>
        </div>

        {/* Right column: commander surface, timeline, scope & evidence */}
        <div className="flex flex-col gap-4">
          <SectionHeader title={`Commander ${commander?.callsign ?? "IC"}`}>
            <span>A2UI</span>
          </SectionHeader>

          {incident.scenarioId === "range" && state.rangeStatus ? <RangePanel status={state.rangeStatus} /> : null}

          <A2UISurface
            surface={surface}
            onAction={(actionId, payload) => void phalanxApi.action(incident.surfaceId, actionId, payload)}
            empty={<p className="meta-mono">The commander has not published an A2UI card yet</p>}
          />

          {/* Timeline */}
          <div className="flex flex-col">
            <SectionHeader title="Timeline" />
            {incident.timeline.length === 0 ? (
              <p className="meta-mono pt-3">No timeline events recorded</p>
            ) : (
              <ol className="flex flex-col">
                {[...incident.timeline].reverse().map((entry) => (
                  <li key={entry.id} className="rule-row grid-cols-[4.5rem_minmax(0,1fr)] items-baseline">
                    <span className="meta-mono">{shortTime(entry.at)}</span>
                    <p className="prose-serif">
                      <span className="meta-mono mr-1.5 text-ink!">{entry.actorName}</span>
                      <span className={TONE_TEXT[entry.tone]}>{entry.text}</span>
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Scope & assets */}
          {incident.indicators.length > 0 || incident.assets.length > 0 ? (
            <div className="flex flex-col gap-3">
              <SectionHeader title="Assets and indicators" />

              {incident.assets.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <span className="eyebrow">Affected assets</span>
                  <p className="meta-mono flex flex-wrap gap-x-4 text-ink-soft!">
                    {incident.assets.map((asset) => (
                      <span key={asset}>{asset}</span>
                    ))}
                  </p>
                </div>
              ) : null}

              {incident.indicators.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <span className="eyebrow">Indicators</span>
                  <p className="meta-mono flex flex-wrap gap-x-4 text-[color:var(--negative)]!">
                    {incident.indicators.map((indicator) => (
                      <span key={indicator}>{indicator}</span>
                    ))}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <IncidentEvidence incident={incident} />
        </div>
      </div>
    </PageContent>
  )
}
