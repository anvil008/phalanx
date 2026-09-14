import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@foundry/ui/components/button"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { cn } from "@foundry/ui/lib/utils"
import {
  Play,
  RotateCcw,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  ArrowRight,
  Activity,
} from "lucide-react"
import { PhalanxProductMark } from "@/components/phalanx-mark"
import { phalanxApi, usePhalanx } from "@/lib/store"

interface DemoHeroProps {
  className?: string
}

export function DemoHero({ className }: DemoHeroProps) {
  const state = usePhalanx()
  const incidents = [...state.incidents.values()]
  const isRunning = incidents.length > 0 || state.detections.length > 0

  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(null)
  const isCollapsed = userCollapsed ?? false

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
  const currentPhase = primaryIncident ? primaryIncident.phase.toUpperCase() : "DETECT"

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

  const handleReset = async () => {
    setBusyAction("reset")
    setNotice(null)
    await phalanxApi.reset()
    setBusyAction(null)
  }

  return (
    <div className={cn("flex flex-col gap-3 shrink-0", className)}>
      {isCollapsed ? (
        /* Compact command strip */
        <div className="border border-rule-soft bg-card py-2.5 px-4 rounded-md flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <PhalanxProductMark className="size-6" />
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-ink">
                Phalanx Command Deck
              </span>
              <span className="text-muted-foreground/50 text-xs">·</span>
              {isRunning ? (
                <span className="inline-flex items-center gap-1.5 border border-warning/40 bg-warning/10 text-warning text-[10px] font-mono h-5 py-0 px-2 rounded">
                  <StatusDot tone="warning" pulse size="xs" />
                  <span>ENGAGED ({incidents.length} ACTIVE)</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 border border-positive/30 bg-positive/10 text-positive text-[10px] font-mono h-5 py-0 px-2 rounded">
                  <StatusDot tone="positive" size="xs" />
                  <span>PERIMETER NOMINAL</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5">
              <Button
                size="xs"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() => void launch("zero-day-edge", () => phalanxApi.runScenario("zero-day-edge"), isZeroDayRan)}
                className={cn(
                  "font-mono text-[11px] h-6.5 px-2.5 border-rule-soft transition-all",
                  isZeroDayActive && "border-destructive/70 bg-destructive/15 text-destructive",
                )}
                title="Execute OP-1041: Ingress Zero-Day & Exfiltration"
              >
                <Play className="size-2.5 mr-1" />
                OP-1041 {isZeroDayRan && !isZeroDayActive ? "(RE-RUN)" : ""}
              </Button>

              <Button
                size="xs"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() => void launch("identity-front", () => phalanxApi.runScenario("identity-front"), isIdentityRan)}
                className={cn(
                  "font-mono text-[11px] h-6.5 px-2.5 border-rule-soft transition-all",
                  isIdentityActive && "border-warning/70 bg-warning/15 text-warning",
                )}
                title="Execute OP-1042: Corporate Identity Consent Abuse"
              >
                <Play className="size-2.5 mr-1" />
                OP-1042 {isIdentityRan && !isIdentityActive ? "(RE-RUN)" : ""}
              </Button>

              <Button
                size="xs"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() => void launch("campaign", () => phalanxApi.runCampaign(), isZeroDayRan || isIdentityRan)}
                className={cn(
                  "font-mono text-[11px] h-6.5 px-2.5 border-rule-soft transition-all",
                  isCampaignActive && "border-primary/70 bg-primary/15 text-primary",
                )}
                title="Execute CAMPAIGN: Salt Meridian Multi-Front"
              >
                <Play className="size-2.5 mr-1" />
                CAMPAIGN
              </Button>
            </div>

            {/* Live engine mode indicator */}
            <div className="flex items-center gap-1.5 rounded border border-rule-soft bg-wash px-2 py-0.5 text-[10px] font-mono">
              <StatusDot tone={state.mode === "live" ? "positive" : "info"} pulse={state.mode === "live"} size="xs" />
              <span className="text-muted-foreground uppercase">
                {state.mode === "live" ? "LIVE" : "REPLAY"}
              </span>
              <Link to="/settings" className="text-primary hover:underline ml-1 text-[10px]">
                CFG
              </Link>
            </div>

            <Button
              size="xs"
              variant="outline"
              disabled={busyAction !== null}
              onClick={() => void handleReset()}
              className="h-6.5 px-2 text-[11px] font-mono border-rule-soft hover:border-destructive/40 hover:text-destructive"
              title="Reset simulation to clean state"
            >
              {busyAction === "reset" ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
              <span className="ml-1">RESET</span>
            </Button>

            <Button
              size="xs"
              variant="ghost"
              onClick={() => setUserCollapsed(false)}
              className="h-6.5 px-2 text-[11px] font-mono text-muted-foreground hover:text-foreground"
              title="Expand tactical scenario dossiers"
            >
              <span>DOSSIERS</span>
              <ChevronDown className="size-3 ml-1" />
            </Button>
          </div>
        </div>
      ) : (
        /* Full Technical SOC Command Centerpiece */
        <div className="border border-rule-soft bg-card p-4 sm:p-5 flex flex-col gap-4 rounded-md relative">
          {/* Header row with tactical designation and metadata */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-rule-soft pb-4">
            <div className="flex items-center gap-3.5">
              <PhalanxProductMark className="size-8 rounded" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-sans text-xs sm:text-sm font-bold tracking-wider text-ink uppercase">
                    PHALANX AUTONOMOUS BLUE-TEAM SWARM
                  </h2>
                  <span className="rounded border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
                    A2A PROTOCOL MESH
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-mono text-muted-foreground">
                  <span>19 DEFENDERS</span>
                  <span>·</span>
                  <span>A2A MESH COORDINATION</span>
                  <span>·</span>
                  <span>RUNTIME AGENT CARDS</span>
                  <span>·</span>
                  <span>AUTONOMOUS AIR-GAP ISOLATION</span>
                </div>
              </div>
            </div>

            {/* Global Controls & Mode */}
            <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
              <div className="flex items-center gap-1.5 rounded border border-rule-soft bg-wash px-2.5 py-1 text-[11px] font-mono">
                <StatusDot tone={state.mode === "live" ? "positive" : "info"} pulse={state.mode === "live"} size="xs" />
                <span className="text-ink text-[10px]">
                  {state.mode === "live" ? `LIVE · ${state.commanderModel.toUpperCase()}` : "DETERMINISTIC REPLAY"}
                </span>
                <Link
                  to="/settings"
                  className="ml-1 text-[10px] text-primary hover:underline"
                >
                  CONFIG
                </Link>
              </div>

              <Button
                size="xs"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() => void handleReset()}
                className="h-7 px-2.5 text-[11px] font-mono border-rule-soft hover:border-destructive/40 hover:text-destructive"
                title="Reset simulation to clean baseline"
              >
                {busyAction === "reset" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RotateCcw className="size-3" />
                )}
                <span className="ml-1">RESET</span>
              </Button>

              <Button
                size="xs"
                variant="ghost"
                onClick={() => setUserCollapsed(true)}
                className="h-7 px-2 text-[11px] font-mono text-muted-foreground hover:text-foreground"
                title="Collapse to compact strip"
              >
                <ChevronUp className="size-3.5" />
                <span className="ml-1">COMPACT</span>
              </Button>
            </div>
          </div>

          {/* Live Execution Status Bar (Displays prominently during active runs) */}
          {isRunning ? (
            <div className="rounded border border-warning/40 bg-warning/[0.06] p-2.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-warning tracking-wide uppercase">
                  <Activity className="size-3.5 text-warning animate-pulse" />
                  SWARM ENGAGED · {incidents.length} ACTIVE INCIDENT{incidents.length > 1 ? "S" : ""}
                </span>
                <span className="text-rule-soft">|</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  CONTAINMENT PHASE: <strong className="text-ink font-semibold">{currentPhase}</strong>
                </span>
              </div>

              <div className="flex items-center gap-3 font-mono text-[11px]">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="size-3" />
                  <span>ELAPSED: <strong className="text-ink font-bold">{elapsedFormatted}</strong></span>
                </div>
                <span className="rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] text-primary font-semibold">
                  {state.posture.agentsEngaged} SPECIALISTS DISPATCHED
                </span>
              </div>
            </div>
          ) : null}

          {/* Error or Notice Toast */}
          {notice ? (
            <div className="flex items-center gap-2 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning font-mono">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{notice}</span>
            </div>
          ) : null}

          {/* Tactical Operational Attack Scenario Dossiers */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                OPERATIONAL ATTACK DOSSIERS · MULTI-AGENT SCENARIOS
              </span>
              <span className="font-mono text-[10px] text-muted-foreground/70 uppercase">
                SELECT VECTOR TO DISPATCH AUTONOMOUS BLUE-TEAM DEFENSE
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* Scenario 1: OP-1041 Zero-Day */}
              <div
                className={cn(
                  "flex flex-col justify-between rounded border p-4 transition-all relative overflow-hidden",
                  isZeroDayActive
                    ? "border-destructive/70 bg-destructive/[0.08]"
                    : "border-rule-soft bg-card/60 hover:border-rule",
                )}
              >
                <div className="flex flex-col gap-2.5">
                  {/* Header with tactical designation & severity */}
                  <div className="flex items-center justify-between gap-2 border-b border-rule-soft pb-2">
                    <span className="font-mono text-[10px] font-bold text-destructive tracking-wider uppercase">
                      OP-1041 · ZERO-DAY INGRESS
                    </span>
                    <span className="rounded border border-destructive/40 bg-destructive/20 text-destructive text-[9px] font-bold px-1.5 py-0.5 font-mono">
                      SEV-1 CRITICAL
                    </span>
                  </div>

                  <h3 className="text-xs font-bold text-ink tracking-tight font-sans">
                    Ingress Zero-Day & Exfiltration
                  </h3>

                  {/* MITRE ATT&CK codes & Target Host tags */}
                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                    <span className="rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-destructive font-semibold">
                      TGT: edge-gw-01
                    </span>
                    <span className="rounded border border-rule-soft bg-wash px-1.5 py-0.5 text-muted-foreground">
                      T1190 · T1552 · T1041
                    </span>
                  </div>

                  <p className="text-[11px] leading-relaxed text-muted-foreground font-sans">
                    Pre-auth HTTP desync on edge TLS terminator, DMZ deployment credential pivot, bulk S3 customer export harvesting, and 47s C2 beaconing.
                  </p>

                  {/* Tactical Flow Visualizer */}
                  <div className="rounded border border-rule-soft bg-wash/60 p-2 font-mono text-[9px] text-muted-foreground flex flex-col gap-1">
                    <span className="uppercase text-[8.5px] tracking-wider text-muted-foreground/70">
                      TACTICAL DEFENSE FLOW:
                    </span>
                    <div className="flex items-center gap-1 text-foreground flex-wrap">
                      <span className="text-primary font-bold">ATLAS (Cmd)</span>
                      <ArrowRight className="size-2.5 text-muted-foreground/60" />
                      <span className="text-accent-indigo">CINDER + SPECTRE</span>
                      <ArrowRight className="size-2.5 text-muted-foreground/60" />
                      <span className="text-positive font-bold">AEGIS (Isolate Host)</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-rule-soft">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyAction !== null}
                    onClick={() => void launch("zero-day-edge", () => phalanxApi.runScenario("zero-day-edge"), isZeroDayRan)}
                    className={cn(
                      "w-full h-7.5 text-[11px] font-mono border-rule-soft justify-center gap-1.5 transition-all",
                      isZeroDayActive && "border-destructive/70 bg-destructive/20 text-destructive hover:bg-destructive/25",
                      !isZeroDayActive && !isZeroDayRan && "bg-wash hover:bg-rule-soft text-foreground hover:border-primary/50",
                      isZeroDayRan && !isZeroDayActive && "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {busyAction === "zero-day-edge" ? (
                      <>
                        <Loader2 className="size-3 animate-spin" />
                        <span>DISPATCHING SWARM...</span>
                      </>
                    ) : isZeroDayActive ? (
                      <>
                        <StatusDot tone="warning" pulse size="xs" />
                        <span>ACTIVE IN SWARM · RESPONDING</span>
                      </>
                    ) : isZeroDayRan ? (
                      <>
                        <RotateCcw className="size-3" />
                        <span>RE-RUN OP-1041</span>
                      </>
                    ) : (
                      <>
                        <Play className="size-3" />
                        <span>EXECUTE OP-1041</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Scenario 2: OP-1042 Identity Front */}
              <div
                className={cn(
                  "flex flex-col justify-between rounded border p-4 transition-all relative overflow-hidden",
                  isIdentityActive
                    ? "border-warning/70 bg-warning/[0.08]"
                    : "border-rule-soft bg-card/60 hover:border-rule",
                )}
              >
                <div className="flex flex-col gap-2.5">
                  {/* Header with tactical designation & severity */}
                  <div className="flex items-center justify-between gap-2 border-b border-rule-soft pb-2">
                    <span className="font-mono text-[10px] font-bold text-warning tracking-wider uppercase">
                      OP-1042 · IDENTITY CONSENT
                    </span>
                    <span className="rounded border border-warning/40 bg-warning/20 text-warning text-[9px] font-bold px-1.5 py-0.5 font-mono">
                      SEV-2 HIGH
                    </span>
                  </div>

                  <h3 className="text-xs font-bold text-ink tracking-tight font-sans">
                    Corporate Identity Consent Abuse
                  </h3>

                  {/* MITRE ATT&CK codes & Target Host tags */}
                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                    <span className="rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-warning font-semibold">
                      TGT: corp-idp-01
                    </span>
                    <span className="rounded border border-rule-soft bg-wash px-1.5 py-0.5 text-muted-foreground">
                      T1098.005 · T1114.002
                    </span>
                  </div>

                  <p className="text-[11px] leading-relaxed text-muted-foreground font-sans">
                    Unregistered OAuth application tricked two finance users into granting mail-read consent, initiating automated corporate mailbox harvesting.
                  </p>

                  {/* Tactical Flow Visualizer */}
                  <div className="rounded border border-rule-soft bg-wash/60 p-2 font-mono text-[9px] text-muted-foreground flex flex-col gap-1">
                    <span className="uppercase text-[8.5px] tracking-wider text-muted-foreground/70">
                      TACTICAL DEFENSE FLOW:
                    </span>
                    <div className="flex items-center gap-1 text-foreground flex-wrap">
                      <span className="text-primary font-bold">VESPER (Cmd)</span>
                      <ArrowRight className="size-2.5 text-muted-foreground/60" />
                      <span className="text-accent-indigo">KEYSTONE + ARCHIVIST</span>
                      <ArrowRight className="size-2.5 text-muted-foreground/60" />
                      <span className="text-positive font-bold">SENTRY (Revoke App)</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-rule-soft">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyAction !== null}
                    onClick={() => void launch("identity-front", () => phalanxApi.runScenario("identity-front"), isIdentityRan)}
                    className={cn(
                      "w-full h-7.5 text-[11px] font-mono border-rule-soft justify-center gap-1.5 transition-all",
                      isIdentityActive && "border-warning/70 bg-warning/20 text-warning hover:bg-warning/25",
                      !isIdentityActive && !isIdentityRan && "bg-wash hover:bg-rule-soft text-foreground hover:border-primary/50",
                      isIdentityRan && !isIdentityActive && "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {busyAction === "identity-front" ? (
                      <>
                        <Loader2 className="size-3 animate-spin" />
                        <span>DISPATCHING SWARM...</span>
                      </>
                    ) : isIdentityActive ? (
                      <>
                        <StatusDot tone="warning" pulse size="xs" />
                        <span>ACTIVE IN SWARM · RESPONDING</span>
                      </>
                    ) : isIdentityRan ? (
                      <>
                        <RotateCcw className="size-3" />
                        <span>RE-RUN OP-1042</span>
                      </>
                    ) : (
                      <>
                        <Play className="size-3" />
                        <span>EXECUTE OP-1042</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Scenario 3: CAMPAIGN Multi-Front */}
              <div
                className={cn(
                  "flex flex-col justify-between rounded border p-4 transition-all relative overflow-hidden",
                  isCampaignActive
                    ? "border-primary/70 bg-primary/[0.08]"
                    : isCampaignRan
                      ? "border-positive/40 bg-positive/[0.03]"
                      : "border-rule-soft bg-card/60 hover:border-rule",
                )}
              >
                <div className="flex flex-col gap-2.5">
                  {/* Header with tactical designation & severity */}
                  <div className="flex items-center justify-between gap-2 border-b border-rule-soft pb-2">
                    <span className="font-mono text-[10px] font-bold text-primary tracking-wider uppercase">
                      CAMPAIGN · SALT MERIDIAN
                    </span>
                    <span className="rounded border border-primary/40 bg-primary/20 text-primary text-[9px] font-bold px-1.5 py-0.5 font-mono">
                      MULTI-FRONT CAMPAIGN
                    </span>
                  </div>

                  <h3 className="text-xs font-bold text-ink tracking-tight font-sans">
                    Coordinated Multi-Front Campaign
                  </h3>

                  {/* MITRE ATT&CK codes & Target Host tags */}
                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                    <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-primary font-semibold">
                      TGTS: edge-gw-01 + corp-idp-01
                    </span>
                    <span className="rounded border border-rule-soft bg-wash px-1.5 py-0.5 text-muted-foreground">
                      T1190 · T1098.005 · T1071.001
                    </span>
                  </div>

                  <p className="text-[11px] leading-relaxed text-muted-foreground font-sans">
                    Simultaneous dual-vector breach. Incident commanders cross-correlate indicators in real time while ORRERY arbitrates responder capacity.
                  </p>

                  {/* Tactical Flow Visualizer */}
                  <div className="rounded border border-rule-soft bg-wash/60 p-2 font-mono text-[9px] text-muted-foreground flex flex-col gap-1">
                    <span className="uppercase text-[8.5px] tracking-wider text-muted-foreground/70">
                      TACTICAL DEFENSE FLOW:
                    </span>
                    <div className="flex items-center gap-1 text-foreground flex-wrap">
                      <span className="text-primary font-bold">ATLAS + VESPER</span>
                      <ArrowRight className="size-2.5 text-muted-foreground/60" />
                      <span className="text-warning font-bold">ORRERY (Arbitration)</span>
                      <ArrowRight className="size-2.5 text-muted-foreground/60" />
                      <span className="text-positive font-bold">8 Swarm Specialists</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-rule-soft">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyAction !== null}
                    onClick={() => void launch("campaign", () => phalanxApi.runCampaign(), isZeroDayRan || isIdentityRan)}
                    className={cn(
                      "w-full h-7.5 text-[11px] font-mono border-rule-soft justify-center gap-1.5 transition-all",
                      isCampaignActive && "border-primary/70 bg-primary/20 text-primary hover:bg-primary/25",
                      !isCampaignActive && !isCampaignRan && "bg-wash hover:bg-rule-soft text-foreground hover:border-primary/50",
                      isCampaignRan && !isCampaignActive && "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {busyAction === "campaign" ? (
                      <>
                        <Loader2 className="size-3 animate-spin" />
                        <span>DISPATCHING CAMPAIGN...</span>
                      </>
                    ) : isCampaignActive ? (
                      <>
                        <StatusDot tone="warning" pulse size="xs" />
                        <span>ACTIVE CAMPAIGN · ARBITRATING</span>
                      </>
                    ) : isCampaignRan ? (
                      <>
                        <RotateCcw className="size-3" />
                        <span>RE-RUN CAMPAIGN</span>
                      </>
                    ) : (
                      <>
                        <Play className="size-3" />
                        <span>EXECUTE CAMPAIGN</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
