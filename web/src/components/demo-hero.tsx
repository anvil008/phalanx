import { useEffect, useState } from "react"
import { Button } from "@foundry/ui/components/button"
import { cn } from "@foundry/ui/lib/utils"
import { Loader2 } from "lucide-react"
import { SectionHeader } from "@/components/section-header"
import { phalanxApi, usePhalanx } from "@/lib/store"

/* The scenario deck.
   The page chrome already carries the product name, the mode and reset, so all
   this owns is the run surface: one quiet mono strip while the swarm is
   engaged, and the three scenarios as panels — what it is, what it touches,
   who answers it, and the button that starts it. */

interface DemoHeroProps {
  className?: string
}

const SCENARIOS = [
  {
    id: "zero-day-edge",
    eyebrow: "01 · Zero-day ingress",
    title: "Ingress zero-day and exfiltration",
    tone: "negative",
    severity: "Sev 1",
    target: "Target edge-gw-01",
    concepts: ["T1190", "T1552", "T1041"],
    summary:
      "Pre-auth HTTP desync on the edge TLS terminator, DMZ deployment credential pivot, bulk S3 customer export harvesting, and 47s C2 beaconing.",
    plan: ["Atlas (command)", "Cinder + Spectre", "Aegis (isolate host)"],
    runLabel: "Run scenario",
  },
  {
    id: "identity-front",
    eyebrow: "02 · Identity consent",
    title: "Corporate identity consent abuse",
    tone: "warning",
    severity: "Sev 2",
    target: "Target corp-idp-01",
    concepts: ["T1098.005", "T1114.002"],
    summary:
      "Unregistered OAuth application tricked two finance users into granting mail-read consent, initiating automated corporate mailbox harvesting.",
    plan: ["Vesper (command)", "Keystone + Archivist", "Sentry (revoke app)"],
    runLabel: "Run scenario",
  },
  {
    id: "campaign",
    eyebrow: "03 · Salt Meridian",
    title: "Coordinated multi-front campaign",
    tone: "info",
    severity: "Two fronts",
    target: "Targets edge-gw-01 and corp-idp-01",
    concepts: ["T1190", "T1098.005", "T1071.001"],
    summary:
      "Simultaneous dual-vector breach. Incident commanders cross-correlate indicators in real time while Orrery arbitrates responder capacity.",
    plan: ["Atlas + Vesper", "Orrery (arbitration)", "8 swarm specialists"],
    runLabel: "Run campaign",
  },
] as const

export function DemoHero({ className }: DemoHeroProps) {
  const state = usePhalanx()
  const incidents = [...state.incidents.values()]
  const isRunning = incidents.length > 0 || state.detections.length > 0

  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [, setTick] = useState(0)

  // Live timer tick when incidents are active
  useEffect(() => {
    if (!isRunning) return
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [isRunning])

  const isZeroDayRan = incidents.some((inc) => inc.scenarioId === "zero-day-edge")
  const isIdentityRan = incidents.some((inc) => inc.scenarioId === "identity-front")
  const isCampaignRan = isZeroDayRan && isIdentityRan

  const zeroDayIncident = incidents.find((i) => i.scenarioId === "zero-day-edge")
  const identityIncident = incidents.find((i) => i.scenarioId === "identity-front")

  const isZeroDayActive = Boolean(zeroDayIncident && !zeroDayIncident.closedAt)
  const isIdentityActive = Boolean(identityIncident && !identityIncident.closedAt)
  const isCampaignActive = isZeroDayActive || isIdentityActive

  // Determine earliest opened timestamp for elapsed timer
  const earliestOpened = incidents.reduce<number | null>((acc, inc) => {
    const t = Date.parse(inc.openedAt)
    if (isNaN(t)) return acc
    return acc === null ? t : Math.min(acc, t)
  }, null)

  const elapsedSeconds = earliestOpened !== null ? Math.max(0, Math.floor((Date.now() - earliestOpened) / 1000)) : 0
  const elapsedFormatted = `T+${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}s`

  // Active containment phase
  const primaryIncident = incidents[0]
  const currentPhase = primaryIncident ? primaryIncident.phase : "detect"

  const launch = async (id: string, action: () => Promise<{ ok: boolean; reason?: string }>, rerun = false) => {
    setBusyAction(id)
    setNotice(null)
    if (rerun) {
      await phalanxApi.reset()
    }
    const result = await action()
    setBusyAction(null)
    if (!result.ok) {
      setNotice(result.reason ?? "Scenario could not be started.")
    }
  }

  // Each row keeps its own run/rerun rule; the server stays the authority.
  const runState = (id: string) => {
    if (id === "zero-day-edge") {
      return {
        ran: isZeroDayRan,
        active: isZeroDayActive,
        start: () => launch("zero-day-edge", () => phalanxApi.runScenario("zero-day-edge"), isZeroDayRan),
      }
    }
    if (id === "identity-front") {
      return {
        ran: isIdentityRan,
        active: isIdentityActive,
        start: () => launch("identity-front", () => phalanxApi.runScenario("identity-front"), isIdentityRan),
      }
    }
    return {
      ran: isCampaignRan,
      active: isCampaignActive,
      start: () => launch("campaign", () => phalanxApi.runCampaign(), isZeroDayRan || isIdentityRan),
    }
  }

  return (
    <div className={cn("flex flex-col gap-3 shrink-0", className)}>
      {isRunning ? (
        <p className="meta-mono flex flex-wrap items-center gap-x-5 gap-y-1 border-y border-rule-soft py-1.5">
          <span className="text-ink">
            Swarm engaged · {incidents.length} active incident{incidents.length > 1 ? "s" : ""}
          </span>
          <span>Containment phase {currentPhase}</span>
          <span>Elapsed {elapsedFormatted}</span>
          <span>{state.posture.agentsEngaged} specialists dispatched</span>
        </p>
      ) : null}

      {notice ? <p className="meta-mono text-[color:var(--warning)]!">{notice}</p> : null}

      <div className="flex flex-col gap-2">
        <SectionHeader title="Scenarios">
          <span>Choose a scenario to run</span>
        </SectionHeader>

        <ul className="grid gap-3 md:grid-cols-3">
          {SCENARIOS.map((scenario) => {
            const { ran, active, start } = runState(scenario.id)
            return (
              <li key={scenario.id} className="panel flex flex-col gap-2 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="eyebrow truncate">{scenario.eyebrow}</span>
                  <span className="sev-tag shrink-0" data-tone={scenario.tone}>
                    {scenario.severity}
                  </span>
                </div>

                <h3 className="title text-[0.875rem]">{scenario.title}</h3>
                <p className="prose line-clamp-3 text-[0.75rem]!">{scenario.summary}</p>

                <p className="meta-mono">
                  {scenario.target} · {scenario.concepts.join(" · ")}
                </p>

                <p className="meta-mono mt-auto pt-1 text-ink-soft!">Plan {scenario.plan.join(" → ")}</p>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyAction !== null}
                    onClick={() => void start()}
                    className={cn("justify-center gap-1.5", active && "button-ink")}
                  >
                    {busyAction === scenario.id ? (
                      <>
                        <Loader2 className="size-3 animate-spin" />
                        <span>Dispatching</span>
                      </>
                    ) : active ? (
                      <span>Running</span>
                    ) : ran ? (
                      <span>Run again</span>
                    ) : (
                      <span>{scenario.runLabel}</span>
                    )}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
