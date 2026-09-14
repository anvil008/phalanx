import { useNavigate, Link } from "react-router-dom"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { ArrowRight } from "lucide-react"
import { DemoHero } from "@/components/demo-hero"
import { PanelSection } from "@/components/section-header"
import { usePhalanx, useIncidentList } from "@/lib/store"

/* Simulation Lab.
   Author attack scenarios, run multi-front campaigns, or spin up live
   adversary range tests with autonomous defenders and real-time swarm telemetry. */

export function SimulationsPage() {
  const navigate = useNavigate()
  const state = usePhalanx()
  const incidents = useIncidentList()
  const hasActiveEngagements = incidents.length > 0 || state.rangeStatus !== null

  return (
    <PageContent className="phalanx-page-scroll-fade">
      <PageHeader
        title="Simulation Lab"
        subtitle={`${state.agents.length} defenders · ${state.mode === "live" ? state.commanderModel : "replay"} · 3 attack scenarios & live range lab`}
        actions={
          <span className="meta-mono flex items-center gap-1.5">
            <StatusDot tone={state.mode === "live" ? "positive" : "info"} pulse={state.mode === "live"} size="xs" />
            <span>{state.mode === "live" ? "Live" : "Replay"}</span>
          </span>
        }
      />

      <DemoHero collapsible={false} />

      {/* Below DemoHero: active engagements or scenario architectural briefing cards */}
      {hasActiveEngagements ? (
        <PanelSection
          title="Active Engagements"
          meta={
            <Link
              to="/incidents"
              className="meta-mono inline-flex items-center gap-1 hover:text-ink transition-colors"
            >
              <span>View in Swarm Graph</span>
              <ArrowRight className="size-3" />
            </Link>
          }
        >
          <ul className="flex flex-col">
            {incidents.map((incident) => {
              const commander = state.agents.find((a) => a.id === incident.commanderId)
              return (
                <li
                  key={incident.id}
                  className="panel-row grid-cols-[1fr_auto] items-center cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => navigate(`/incidents/${incident.id}`)}
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="sev-tag" data-tone={incident.severity === "sev1" ? "negative" : "warning"}>
                        Sev {incident.severity.slice(3)}
                      </span>
                      <span className="meta-mono text-ink!">{incident.code}</span>
                      <span className="meta-mono text-ink-soft!">·</span>
                      <span className="meta-mono text-ink-soft!">{incident.phase}</span>
                    </div>
                    <span className="title truncate text-[0.8125rem]">{incident.title}</span>
                    {commander ? (
                      <span className="meta-mono text-ink-soft! text-[11px]">
                        Commander: <span className="text-ink">{commander.callsign}</span> ({commander.name})
                      </span>
                    ) : null}
                  </div>
                  <Link
                    to={`/incidents/${incident.id}`}
                    className="meta-mono inline-flex items-center gap-1 text-ink hover:text-primary transition-colors text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>View in Swarm Graph</span>
                    <ArrowRight className="size-3" />
                  </Link>
                </li>
              )
            })}

            {state.rangeStatus ? (
              <li
                className="panel-row grid-cols-[1fr_auto] items-center cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => navigate("/range")}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <StatusDot tone="negative" pulse size="xs" />
                    <span className="sev-tag" data-tone="negative">LIVE RANGE</span>
                    <span className="meta-mono text-ink!">STAGE: {state.rangeStatus.attackStage.toUpperCase()}</span>
                  </div>
                  <span className="title text-[0.8125rem]">
                    Live adversary attack against isolated VM range · {state.rangeStatus.beaconCount} beacons · {(state.rangeStatus.exfilBytes / 1e6).toFixed(2)} MB exfiltrated
                  </span>
                </div>
                <Link
                  to="/range"
                  className="meta-mono inline-flex items-center gap-1 text-ink hover:text-primary transition-colors text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span>Range Telemetry</span>
                  <ArrowRight className="size-3" />
                </Link>
              </li>
            ) : null}
          </ul>
        </PanelSection>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="panel p-3.5 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="meta-mono text-ink font-semibold">OP-1041 · INGRESS ZERO-DAY</span>
              <span className="sev-tag" data-tone="negative">Sev 1</span>
            </div>
            <p className="prose text-[0.75rem] leading-relaxed text-muted-foreground">
              Deterministic memory corruption against edge gateway. Tests automated anomaly detection, forensic triage, and host isolation.
            </p>
          </div>

          <div className="panel p-3.5 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="meta-mono text-ink font-semibold">OP-1042 · IDENTITY FRONT</span>
              <span className="sev-tag" data-tone="warning">Sev 2</span>
            </div>
            <p className="prose text-[0.75rem] leading-relaxed text-muted-foreground">
              OAuth consent abuse and directory reconnaissance against corporate IdP. Tests credential revocation and identity guardrails.
            </p>
          </div>

          <div className="panel p-3.5 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="meta-mono text-ink font-semibold">CAMPAIGN · SALT MERIDIAN</span>
              <span className="sev-tag" data-tone="negative">Sev 1 Coordinated</span>
            </div>
            <p className="prose text-[0.75rem] leading-relaxed text-muted-foreground">
              Concurrent multi-vector assault. Tests Commander-to-Commander cross-correlation over the A2A bus and unified arbitration.
            </p>
          </div>
        </div>
      )}
    </PageContent>
  )
}
