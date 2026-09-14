import { useNavigate } from "react-router-dom"
import { Button } from "@foundry/ui/components/button"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { RotateCcw } from "lucide-react"
import { A2UISurface } from "@/components/a2ui-surface"
import { DemoHero } from "@/components/demo-hero"
import { KillChain } from "@/components/kill-chain"
import { RangePanel } from "@/components/range-panel"
import { BusTrace } from "@/components/bus-trace"
import { PanelSection, SectionHeader } from "@/components/section-header"
import { relative, shortTime } from "@/lib/format"
import type { IncidentSeverity } from "@/lib/model"
import { phalanxApi, useAgentIndex, usePhalanx, useIncidentList } from "@/lib/store"

/* Mission Control.
   The standing posture of the estate, the scenarios you can run against it,
   and the cards the agents write while they work. Dashboard language: panels
   group, hairlines separate, and mono carries anything measured. */

const THREAT_TONE = {
  green: "neutral",
  amber: "warning",
  red: "negative",
  black: "negative",
} as const

const SEV_TONE: Record<IncidentSeverity, string> = {
  sev1: "negative",
  sev2: "warning",
  sev3: "info",
  sev4: "muted",
}

function severityLabel(severity: IncidentSeverity): string {
  return `Sev ${severity.slice(3)}`
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
        subtitle={`${state.agents.length} defenders · ${state.mode === "live" ? state.commanderModel : "replay"}`}
        actions={
          <div className="flex items-center gap-4">
            <span className="meta-mono flex items-center gap-1.5">
              <StatusDot tone={state.mode === "live" ? "positive" : "info"} pulse={state.mode === "live"} size="xs" />
              <span>{state.mode === "live" ? "Live" : "Replay"}</span>
            </span>
            <Button
              size="xs"
              variant="outline"
              onClick={() => void phalanxApi.reset()}
              title="Reset environment to clean baseline"
            >
              <RotateCcw className="size-3 mr-1" />
              Reset
            </Button>
          </div>
        }
      />

      <DemoHero />

      {/* Posture, as one panel of readings divided by hairlines */}
      <div className="panel grid shrink-0 grid-cols-2 gap-px overflow-hidden bg-rule-soft sm:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="Threat level"
          value={state.posture.threatLevel}
          tone={THREAT_TONE[state.posture.threatLevel]}
          subtext={state.posture.threatLevel === "green" ? "Perimeter nominal" : "Engagement active"}
        />
        <Stat
          label="Open incidents"
          value={String(state.posture.openIncidents)}
          tone={state.posture.openIncidents > 0 ? "warning" : "neutral"}
          subtext={state.posture.openIncidents === 0 ? "All queues clear" : "Active triage"}
        />
        <Stat
          label="Agents engaged"
          value={`${state.posture.agentsEngaged}/${state.agents.length}`}
          subtext={state.posture.agentsEngaged === 0 ? "19 standby defenders" : "Swarm dispatched"}
        />
        <Stat label="Bus traffic" value={`${state.posture.busMessagesPerMin}/min`} subtext="A2A protocol flow" />
        <Stat
          label="MTTC"
          value={state.posture.meanTimeToContainSec === null ? "—" : `${state.posture.meanTimeToContainSec}s`}
          subtext="Detect to isolation"
        />
        <Stat label="Contained today" value={String(state.posture.containedToday)} subtext="Autonomous barrier" />
      </div>

      <KillChain state={state} />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] shrink-0">
        <div className="flex flex-col gap-3">
          {state.rangeStatus ? <RangePanel status={state.rangeStatus} compact /> : null}

          <div className="flex flex-col gap-3">
            <SectionHeader title="Live from the swarm">
              <span>Agent-authored surfaces</span>
            </SectionHeader>

            <A2UISurface
              surface={surface}
              onAction={(actionId, payload) => void phalanxApi.action("mission-control", actionId, payload)}
              empty={
                <div className="panel px-3 py-6">
                  <p className="title text-[0.875rem]">Telemetry on standby</p>
                  <p className="prose mt-1 max-w-[62ch] text-[0.75rem]!">
                    All 19 blue-team defenders are watching estate ingress and identity logs. Run a scenario above to
                    watch the containment cards arrive.
                  </p>
                </div>
              }
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {/* Incidents feed */}
          <PanelSection title="Incidents" meta={<span>{incidents.length} open</span>}>
            {incidents.length === 0 ? (
              <p className="meta-mono px-3 py-2.5">No incidents open · perimeter secure</p>
            ) : (
              <ul className="flex flex-col">
                {incidents.slice(0, 4).map((incident) => (
                  <li key={incident.id}>
                    <button
                      type="button"
                      className="panel-row w-full grid-cols-[1fr_auto] text-left"
                      onClick={() => navigate(`/incidents/${incident.id}`)}
                    >
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="flex items-center gap-2">
                          <span className="sev-tag" data-tone={SEV_TONE[incident.severity]}>
                            {severityLabel(incident.severity)}
                          </span>
                          <span className="meta-mono text-ink!">{incident.code}</span>
                        </span>
                        <span className="title truncate text-[0.8125rem]">{incident.title}</span>
                      </span>
                      <span className="meta-mono self-center">{incident.phase}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </PanelSection>

          {/* Detections feed */}
          <PanelSection title="Detections" meta={<span>{state.detections.length} recorded</span>}>
            {state.detections.length === 0 ? (
              <p className="meta-mono px-3 py-2.5">No adversary anomalies recorded</p>
            ) : (
              <ul className="flex flex-col">
                {state.detections.slice(0, 6).map((detection) => (
                  <li key={detection.id} className="panel-row grid-cols-[minmax(0,1fr)_auto] items-start">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="meta-mono flex items-center gap-2 text-ink!">
                        <StatusDot
                          tone={
                            detection.severity === "sev1"
                              ? "negative"
                              : detection.severity === "sev2"
                                ? "warning"
                                : "info"
                          }
                        />
                        {detection.rule}
                      </span>
                      <span className="meta-mono truncate">{detection.detail}</span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="meta-mono">{shortTime(detection.at)}</span>
                      <span className="meta-mono text-ink-soft!">{detection.host}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PanelSection>

          {/* Affected estate */}
          {affectedHosts.length > 0 ? (
            <PanelSection title="Affected hosts" meta={<span>{affectedHosts.length} touched</span>}>
              <ul className="flex flex-col">
                {affectedHosts.map((host) => (
                  <li key={host.id} className="panel-row grid-cols-[minmax(0,1fr)_auto]">
                    <span className="meta-mono flex min-w-0 items-center gap-2">
                      <StatusDot
                        tone={host.status === "compromised" ? "negative" : host.status === "isolated" ? "warning" : "positive"}
                      />
                      <span className="shrink-0 text-ink">{host.name}</span>
                      <span className="truncate">{host.role}</span>
                    </span>
                    <span
                      className="sev-tag"
                      data-tone={host.status === "compromised" ? "negative" : host.status === "isolated" ? "warning" : "positive"}
                    >
                      {host.status === "isolated" ? "isolated" : host.status}
                    </span>
                  </li>
                ))}
              </ul>
            </PanelSection>
          ) : null}
        </div>
      </div>

      {/* Coordination bus & fleet strip */}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] shrink-0">
        <PanelSection title="A2A coordination bus" meta={<span>{state.bus.length} messages</span>}>
          <BusTrace messages={state.bus} agents={agents} limit={14} emptyText="No agent-to-agent traffic recorded." />
        </PanelSection>

        <PanelSection title="Responders" meta={<span>{engaged.length} engaged</span>}>
          {engaged.length === 0 ? (
            <p className="meta-mono px-3 py-2.5">All 19 specialists on standby</p>
          ) : (
            <ul className="flex flex-col">
              {engaged.map((runtime) => {
                const agent = agents.get(runtime.id)
                if (!agent) return null
                return (
                  <li key={runtime.id} className="panel-row grid-cols-[minmax(0,1fr)_auto]">
                    <span className="meta-mono flex min-w-0 items-center gap-2">
                      <span
                        className="inline-block size-1.5 rounded-full"
                        style={{ background: `var(--phalanx-class-${agent.class})` }}
                      />
                      <span className="text-ink">{agent.callsign}</span>
                      <span className="truncate">{runtime.activity}</span>
                    </span>
                    <span className="meta-mono">{runtime.lastMessageAt ? relative(runtime.lastMessageAt) : "—"}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </PanelSection>
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
  tone?: "neutral" | "warning" | "negative"
  subtext?: string
}) {
  const colour = tone === "warning" ? "text-warning" : tone === "negative" ? "text-destructive" : "text-ink"

  return (
    <div className="flex flex-col gap-0.5 bg-card px-3 py-2.5">
      <span className="eyebrow">{label}</span>
      <span className={`font-mono text-[1.125rem] leading-tight font-normal ${colour}`}>{value}</span>
      {subtext ? <span className="meta-mono truncate">{subtext}</span> : null}
    </div>
  )
}
