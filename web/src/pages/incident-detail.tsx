import { useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Badge } from "@foundry/ui/components/badge"
import { Button } from "@foundry/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/components/card"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { ArrowLeft, Shield, Terminal, Clock, Activity, ArrowRight } from "lucide-react"
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

/* One Incident, and the Swarm working it.
   Executive tactical breakdown: real-time topology, MITRE indicators,
   and dynamic A2UI commander cards. */

const SEV_CLASS: Record<IncidentSeverity, { badge: string; text: string }> = {
  sev1: { badge: "border-destructive/50 bg-destructive/15 text-destructive", text: "text-destructive" },
  sev2: { badge: "border-warning/50 bg-warning/15 text-warning", text: "text-warning" },
  sev3: { badge: "border-primary/50 bg-primary/15 text-primary", text: "text-primary" },
  sev4: { badge: "border-border bg-black/40 text-muted-foreground", text: "text-muted-foreground" },
}

const TONE_TEXT: Record<IncidentTimelineEntry["tone"], string> = {
  neutral: "text-muted-foreground",
  info: "text-info font-medium",
  positive: "text-positive font-medium",
  warning: "text-warning font-medium",
  negative: "text-destructive font-medium",
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
        <PageHeader title="Incident Dossier" />
        <Card className="border-border bg-card/85">
          <CardContent className="py-10 text-center font-mono">
            <p className="text-sm font-bold text-foreground">Incident not found in active memory space.</p>
            <Button size="sm" variant="outline" className="mt-4 font-mono text-xs" onClick={() => navigate("/incidents")}>
              Return to Incident Response Team
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
  const sevInfo = SEV_CLASS[incident.severity] ?? SEV_CLASS.sev4

  return (
    <PageContent className="phalanx-page-scroll-fade">
      <PageHeader
        title={`${incident.code} · ${incident.title}`}
        subtitle={`COMMANDER ${commander?.callsign?.toUpperCase() ?? incident.commanderId.toUpperCase()} · ACTIVE PHASE: ${incident.phase.toUpperCase()}`}
        actions={
          <Button size="sm" variant="outline" className="font-mono text-xs gap-1.5 h-7.5" render={<Link to="/incidents" />}>
            <ArrowLeft className="size-3.5" />
            <span>ALL INCIDENTS</span>
          </Button>
        }
      />

      {/* Incident Status Strip */}
      <div className="rounded-shell border border-border bg-card/80 p-3.5 backdrop-blur-md flex flex-wrap items-center gap-4 justify-between shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline" className={`font-mono text-[10px] font-bold ${sevInfo.badge}`}>
            {incident.severity.toUpperCase()}
          </Badge>

          <span className="flex items-center gap-1.5 font-mono text-xs text-foreground">
            <StatusDot
              tone={incident.status === "resolved" ? "positive" : incident.status === "contained" ? "warning" : "negative"}
              pulse={incident.status === "open"}
            />
            <span className="font-bold uppercase">{incident.status}</span>
          </span>

          <span className="font-mono text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="size-3 text-muted-foreground" />
            <span>ELAPSED: <strong className="text-foreground">{duration(incident.openedAt, incident.closedAt)}</strong></span>
          </span>

          <span className="font-mono text-xs text-muted-foreground">
            CONFIDENCE: <strong className="text-foreground">{incident.confidence}%</strong>
          </span>
        </div>

        {/* Phase Stepper */}
        <div className="flex items-center gap-1 font-mono text-[10px] overflow-x-auto">
          {PHASE_ORDER.map((phase, index) => {
            const isCompleted = index < phaseIndex
            const isCurrent = index === phaseIndex
            return (
              <div key={phase} className="flex items-center gap-1">
                <span
                  className={`rounded px-2 py-0.5 font-bold uppercase transition-colors ${
                    isCurrent
                      ? "bg-primary text-primary-foreground shadow-[0_0_8px_rgba(76,201,217,0.4)]"
                      : isCompleted
                        ? "bg-positive/20 text-positive border border-positive/30"
                        : "text-muted-foreground/40 border border-transparent"
                  }`}
                >
                  {phase}
                </span>
                {index < PHASE_ORDER.length - 1 ? (
                  <ArrowRight className="size-2.5 text-muted-foreground/30" />
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-item border border-border/70 bg-card/60 p-3 text-xs text-muted-foreground leading-relaxed">
        {incident.summary}
      </div>

      {incident.links.length > 0 ? (
        <div className="rounded-item border border-warning/40 bg-warning/10 p-2.5 font-mono text-xs text-warning flex items-center gap-2">
          <Activity className="size-3.5 shrink-0" />
          <span>
            Part of multi-front campaign. Correlated with{" "}
            {incident.links.map((link) => {
              const other = state.incidents.get(link.incidentId)
              return other ? (
                <Link key={link.incidentId} to={`/incidents/${link.incidentId}`} className="underline font-bold text-foreground">
                  {other.code}
                </Link>
              ) : null
            })}{" "}
            — {incident.links[0]!.reason}
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Left Column: Swarm Graph, Tasking, Incident Bus */}
        <div className="flex flex-col gap-3">
          <SectionHeader title="INCIDENT SWARM TOPOLOGY">
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

          {/* Commander Tasking Table */}
          <Card className="border-border bg-card/85">
            <CardHeader className="pb-0 pt-3.5 px-4 border-b border-border/40">
              <CardTitle className="font-mono text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Terminal className="size-3.5 text-primary" />
                <span>COMMANDER TASKING & SQUAD ASSIGNMENTS</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3 px-4">
              {incident.assignments.length === 0 ? (
                <p className="font-mono text-xs text-muted-foreground py-2">The commander has not tasked specialists yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {incident.assignments.map((assignment) => {
                    const assignee = agents.get(assignment.agentId)
                    return (
                      <li key={assignment.agentId} className="flex items-start gap-3 rounded border border-border/50 bg-black/30 p-2.5">
                        <button
                          type="button"
                          className="flex items-center gap-1.5 text-left shrink-0 font-mono text-[11px] font-bold text-foreground hover:text-primary transition-colors"
                          onClick={() => setSelectedAgent(assignment.agentId)}
                        >
                          <span
                            className="size-1.5 rounded-full shadow-[0_0_4px_currentColor]"
                            style={{
                              background: `var(--phalanx-class-${assignee?.class ?? "analysis"})`,
                              color: `var(--phalanx-class-${assignee?.class ?? "analysis"})`,
                            }}
                          />
                          <span>{assignee?.callsign ?? assignment.agentId}</span>
                        </button>
                        <p className="text-xs text-muted-foreground leading-relaxed">{assignment.objective}</p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Incident A2A Bus Traffic */}
          <Card className="border-border bg-card/85">
            <CardHeader className="pb-0 pt-3.5 px-4 border-b border-border/40">
              <CardTitle className="font-mono text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Activity className="size-3.5 text-primary" />
                <span>A2A PROTOCOL TRAFFIC FOR {incident.code}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3 px-4">
              <BusTrace
                messages={incidentBus}
                agents={agents}
                onSelectAgent={setSelectedAgent}
                emptyText="No A2A messages on this incident bus yet."
                limit={40}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Commander A2UI Surface, Timeline, Scope & Evidence */}
        <div className="flex flex-col gap-3">
          <SectionHeader title={`COMMANDER ${commander?.callsign?.toUpperCase() ?? "IC"}'S VIEW`}>
            <span className="font-mono text-[10px] text-primary font-bold">[A2UI PROTOCOL]</span>
          </SectionHeader>

          {incident.scenarioId === "range" && state.rangeStatus ? <RangePanel status={state.rangeStatus} /> : null}

          {/* A2UI Surface Container */}
          <div className="relative overflow-hidden rounded-shell border border-border bg-card/85 backdrop-blur-md shadow-xl">
            <div className="h-[2px] w-full bg-gradient-to-r from-primary via-accent-indigo to-primary" />
            <div className="p-3.5">
              <A2UISurface
                surface={surface}
                onAction={(actionId, payload) => void phalanxApi.action(incident.surfaceId, actionId, payload)}
                empty={<p className="font-mono text-xs text-muted-foreground py-4 text-center">Commander has not published an A2UI card yet.</p>}
              />
            </div>
          </div>

          {/* Incident Timeline */}
          <Card className="border-border bg-card/85">
            <CardHeader className="pb-0 pt-3.5 px-4 border-b border-border/40">
              <CardTitle className="font-mono text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Clock className="size-3.5 text-primary" />
                <span>RESPONSE TIMELINE & ACTIONS</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3 px-4">
              {incident.timeline.length === 0 ? (
                <p className="font-mono text-xs text-muted-foreground py-2">No timeline events recorded.</p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {[...incident.timeline].reverse().map((entry) => (
                    <li key={entry.id} className="grid grid-cols-[4.5rem_1fr] gap-2.5 rounded border border-border/40 bg-black/25 p-2">
                      <span className="font-mono text-[10px] text-muted-foreground/80">{shortTime(entry.at)}</span>
                      <p className="text-xs leading-relaxed">
                        <span className="font-mono text-[10.5px] font-bold text-foreground mr-1.5">{entry.actorName}</span>
                        <span className={TONE_TEXT[entry.tone]}>{entry.text}</span>
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {/* Scope & Assets */}
          {incident.indicators.length > 0 || incident.assets.length > 0 ? (
            <Card className="border-border bg-card/85">
              <CardHeader className="pb-0 pt-3.5 px-4 border-b border-border/40">
                <CardTitle className="font-mono text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <Shield className="size-3.5 text-primary" />
                  <span>TARGET ASSETS & OBSERVED INDICATORS</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 pt-3 px-4">
                {incident.assets.length > 0 ? (
                  <div>
                    <div className="font-mono text-[10px] uppercase text-muted-foreground tracking-wide">
                      AFFECTED INFRASTRUCTURE ASSETS
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {incident.assets.map((asset) => (
                        <Badge key={asset} variant="outline" className="font-mono text-[10px] border-border bg-black/40 text-foreground">
                          {asset}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}

                {incident.indicators.length > 0 ? (
                  <div>
                    <div className="font-mono text-[10px] uppercase text-muted-foreground tracking-wide">
                      EXTRACTED THREAT INDICATORS (IOCs)
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {incident.indicators.map((indicator) => (
                        <Badge key={indicator} variant="outline" className="font-mono text-[10px] border-destructive/40 bg-destructive/15 text-destructive font-bold">
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
