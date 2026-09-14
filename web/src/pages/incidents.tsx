import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@foundry/ui/components/button"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { AgentDetail } from "@/components/agent-detail"
import { BusTrace } from "@/components/bus-trace"
import { RunControls } from "@/components/run-controls"
import { PanelSection, SectionHeader } from "@/components/section-header"
import { BusLegend, ClassLegend, SwarmGraph } from "@/components/swarm-graph"
import { duration, relative } from "@/lib/format"
import { buildCampaignLayout } from "@/lib/graph-model"
import type { Incident, IncidentSeverity } from "@/lib/model"
import { useAgentIndex, usePhalanx, useIncidentList } from "@/lib/store"

/* Incident Response Team.
   Every open incident as a row, the whole estate as one graph, and the
   commander-to-commander traffic that ties two fronts into one campaign. */

const SEV_TONE: Record<IncidentSeverity, string> = {
  sev1: "negative",
  sev2: "warning",
  sev3: "info",
  sev4: "muted",
}

function severityLabel(severity: IncidentSeverity): string {
  return `Sev ${severity.slice(3)}`
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
      />

      {/* The run controls are their own panel, reset included: the chrome bar
          keeps the title, and one busy signal gates every button. */}
      <div className="panel px-3 py-2.5">
        <RunControls />
      </div>

      {/* Active incidents */}
      <PanelSection
        title="Engagements"
        meta={<span>Select an incident to inspect its swarm mesh</span>}
      >
        {incidents.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
            <p className="title text-[0.875rem]">No active security incidents</p>
            <p className="prose max-w-[52ch] text-[0.75rem]!">
              Run an attack scenario or a multi-front campaign to watch autonomous incident commanders coordinate their
              response squads.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {incidents.map((incident) => (
              <IncidentRow
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
          </ul>
        )}
      </PanelSection>

      {/* Swarm graph */}
      <div className="flex flex-col gap-3">
        <SectionHeader title="Estate telemetry">
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
          <p className="meta-mono">
            Amber dashed links mark commander cross-correlation · multi-ring nodes carry shared capacity
          </p>
        </div>
      </div>

      {/* Coordination & traffic */}
      <div className="grid gap-3 xl:grid-cols-2">
        <div className="flex flex-col gap-3">
          <PanelSection title="Commander arbitration" meta={<span>{commanderTraffic.length} hops</span>}>
            {commanderTraffic.length === 0 ? (
              <p className="prose max-w-[62ch] px-3 py-2.5 text-[0.75rem]!">
                Commanders have not needed cross-incident arbitration yet. Indicator correlation starts when a campaign
                crosses infrastructure zones.
              </p>
            ) : (
              <BusTrace messages={commanderTraffic} agents={agents} onSelectAgent={setSelectedAgent} limit={12} />
            )}
          </PanelSection>

          {sharedAgents.length > 0 ? (
            <PanelSection title="Shared responders" meta={<span>{sharedAgents.length} agents</span>}>
              <ul className="flex flex-col">
                {sharedAgents.map((node) => (
                  <li key={node.id} className="panel-row grid-cols-[1fr_auto]">
                    <span className="meta-mono flex min-w-0 items-center gap-2">
                      <StatusDot tone="warning" />
                      <span className="text-ink">{node.label}</span>
                      <span className="truncate">{node.activity}</span>
                    </span>
                    <span className="meta-mono">{node.incidentIds.length} incidents</span>
                  </li>
                ))}
              </ul>
            </PanelSection>
          ) : null}
        </div>

        <PanelSection title="Bus traffic" meta={<span>{state.bus.length} messages</span>}>
          <BusTrace messages={state.bus} agents={agents} onSelectAgent={setSelectedAgent} limit={16} />
        </PanelSection>
      </div>
    </PageContent>
  )
}

function IncidentRow({
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
    <li
      className={`panel-row items-start gap-y-3 grid-cols-1 lg:grid-cols-[8rem_minmax(0,1.5fr)_minmax(0,1fr)] ${focused ? "bg-wash" : ""}`}
    >
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow">{incident.code}</span>
        <span className="sev-tag w-fit" data-tone={SEV_TONE[incident.severity]}>
          {severityLabel(incident.severity)}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="title text-[0.875rem]">{incident.title}</h3>
        <p className="prose line-clamp-2 max-w-[62ch] text-[0.75rem]!">{incident.summary}</p>
        <p className="meta-mono flex flex-wrap gap-x-4">
          <span>
            Commander <span className="text-ink">{commanderName}</span>
          </span>
          <span>
            Phase <span className="text-ink">{incident.phase}</span>
          </span>
          <span>
            <span className="text-ink">{engaged}</span> engaged
          </span>
          <span>{duration(incident.openedAt, incident.closedAt)}</span>
        </p>
        {incident.links.length > 0 ? (
          <p className="meta-mono text-[color:var(--warning)]!">
            Linked to {incident.links.length} campaign front ({incident.links[0]!.reason})
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <span className="meta-mono flex items-center gap-1.5">
          <StatusDot tone={resolved ? "positive" : incident.status === "contained" ? "warning" : "negative"} />
          <span className="text-ink">{incident.status}</span>
        </span>

        <div>
          <div className="meta-mono flex items-baseline justify-between">
            <span>Response plan</span>
            <span className="text-ink">{incident.progress}%</span>
          </div>
          <div className="mt-1 h-px w-full bg-rule-soft">
            <div
              className="h-px bg-[color:var(--accent)] transition-all duration-700"
              style={{ width: `${incident.progress}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button size="sm" variant="outline" onClick={onOpen}>
            Open swarm graph
          </Button>
          <Button size="sm" variant="ghost" onClick={onFocus}>
            {focused ? "Unfocus" : "Focus"}
          </Button>
        </div>

        <span className="meta-mono">Updated {relative(incident.updatedAt)}</span>
      </div>
    </li>
  )
}
