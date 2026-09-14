import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@foundry/ui/components/button"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { ArrowRight, Play, Square } from "lucide-react"
import { RangePanel } from "@/components/range-panel"
import { PanelSection } from "@/components/section-header"
import { shortTime } from "@/lib/format"
import { phalanxApi, useAgentIndex, usePhalanx, useIncidentList } from "@/lib/store"

/* Range page.
   The evidence that "real data" is not a figure of speech: the raw event log
   the attack is writing, tailed live, next to the lab status. The incident the
   agents opened links straight to its swarm. */

interface RangeEvent {
  ts: string
  source: string
  host: string
  kind: string
  detail: string
  tags: string[]
}

const KIND_TONE: Record<string, string> = {
  http: "text-info",
  process: "text-warning",
  file: "text-warning",
  netflow: "text-destructive",
  dns: "text-muted-foreground",
  auth: "text-info",
  audit: "text-muted-foreground",
  control: "text-positive",
}

export function RangePage() {
  const navigate = useNavigate()
  const state = usePhalanx()
  const incidents = useIncidentList()
  const agents = useAgentIndex()
  const [events, setEvents] = useState<RangeEvent[]>([])
  const timer = useRef<number | null>(null)

  const running = state.rangeStatus !== null
  const rangeIncidents = incidents.filter((incident) => incident.scenarioId === "range")

  useEffect(() => {
    const poll = async () => {
      try {
        const response = await fetch("/api/range/events")
        const payload = (await response.json()) as { events: RangeEvent[] }
        setEvents(payload.events)
      } catch {
        // transient; keep the last frame
      }
    }
    void poll()
    if (running) {
      timer.current = window.setInterval(() => void poll(), 1200)
      return () => {
        if (timer.current) window.clearInterval(timer.current)
      }
    }
    return undefined
  }, [running, state.generation])

  return (
    <PageContent className="phalanx-page-scroll-fade">
      <PageHeader
        title="Live Range"
        subtitle={running ? state.rangeStatus?.attackStage : "idle"}
        actions={
          running ? (
            <Button size="sm" variant="outline" onClick={() => void phalanxApi.stopRange()}>
              <Square className="size-3.5" /> Stop range
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => void phalanxApi.runRange()}>
              <Play className="size-3.5" /> Run the attack
            </Button>
          )
        }
      />

      <p className="prose max-w-[72ch] text-[0.75rem]!">
        This runs a real, scripted attack against an isolated estate of instrumented services on this host — six loopback
        HTTP services, a fake C2, and an attacker process, all confined to 127.0.0.1. The attack writes real logs; a real
        detector turns those logs into the incident; and the agents read the same bytes. Containment acts on the range for
        real — isolate the gateway and the beacon you see below actually stops.
      </p>

      {!running && events.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 px-3 py-10 text-center">
          <p className="title text-[0.875rem]">The range is idle</p>
          <p className="prose max-w-[52ch] text-[0.75rem]!">
            Run the attack to spin up the estate, launch the intrusion, and watch the incident open from the real
            telemetry. Nothing leaves this host.
          </p>
          <Button size="sm" className="button-ink" onClick={() => void phalanxApi.runRange()}>
            <Play className="size-3.5" /> Run the attack
          </Button>
        </div>
      ) : null}

      {/* The left column only exists once the range has something to report. */}
      <div
        className={`grid gap-3 ${
          state.rangeStatus || rangeIncidents.length > 0 ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]" : ""
        }`}
      >
        <div className="flex flex-col gap-3 empty:hidden">
          {state.rangeStatus ? <RangePanel status={state.rangeStatus} /> : null}

          {rangeIncidents.length > 0 ? (
            <PanelSection
              title={rangeIncidents.length > 1 ? "Incidents from the range" : "Incident from the range"}
              meta={<span>{rangeIncidents.length} open</span>}
            >
              {rangeIncidents.map((rangeIncident) => (
                <button
                  key={rangeIncident.id}
                  type="button"
                  className="panel-row w-full items-start text-left"
                  onClick={() => navigate(`/incidents/${rangeIncident.id}`)}
                >
                  <span className="meta-mono flex items-center gap-2">
                    <StatusDot tone={rangeIncident.status === "resolved" ? "positive" : rangeIncident.status === "contained" ? "warning" : "negative"} pulse={rangeIncident.status === "open"} />
                    <span className="text-ink">{rangeIncident.code}</span>
                    <span>{agents.get(rangeIncident.commanderId)?.callsign ?? rangeIncident.commanderId}</span>
                    <span className="ml-auto">{rangeIncident.phase} · {rangeIncident.status}</span>
                  </span>
                  <span className="title mt-1 flex items-center gap-1.5 text-[0.875rem]">
                    {rangeIncident.title} <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                  </span>
                </button>
              ))}
            </PanelSection>
          ) : null}
        </div>

        <PanelSection
          title="Raw telemetry"
          meta={<span>{events.length} events · events.jsonl</span>}
        >
          <div className="max-h-[38rem] overflow-y-auto px-3 py-2.5">
            {events.length === 0 ? (
              <p className="meta-mono">No events yet.</p>
            ) : (
              <ol className="flex flex-col gap-1 font-mono text-[11px] leading-relaxed">
                {[...events].reverse().map((event, index) => (
                  <li key={index} className="flex gap-2">
                    <span className="shrink-0 text-muted-foreground">{shortTime(event.ts)}</span>
                    <span className="w-24 shrink-0 truncate text-muted-foreground">{event.host}</span>
                    <span className={`w-16 shrink-0 ${KIND_TONE[event.kind] ?? "text-muted-foreground"}`}>{event.kind}</span>
                    <span className="min-w-0 text-ink">{event.detail}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </PanelSection>
      </div>
    </PageContent>
  )
}
