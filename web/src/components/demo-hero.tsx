import { useState } from "react"
import { Link } from "react-router-dom"
import { Badge } from "@foundry/ui/components/badge"
import { Button } from "@foundry/ui/components/button"
import { Card, CardContent } from "@foundry/ui/components/card"
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
  const isCollapsed = userCollapsed ?? isRunning

  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const isZeroDayRan = incidents.some((inc) => inc.scenarioId === "zero-day-edge")
  const isIdentityRan = incidents.some((inc) => inc.scenarioId === "identity-front")
  const isCampaignRan = isZeroDayRan && isIdentityRan

  const isZeroDayActive = isZeroDayRan && !incidents.find((i) => i.scenarioId === "zero-day-edge")?.closedAt
  const isIdentityActive = isIdentityRan && !incidents.find((i) => i.scenarioId === "identity-front")?.closedAt
  const isCampaignActive = isZeroDayActive || isIdentityActive

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
        /* Compact Operational Strip */
        <Card className="border-border/80 bg-card/70 py-2">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-0">
            <div className="flex items-center gap-2.5">
              <PhalanxProductMark className="size-6" />
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-foreground tracking-wide">
                  Phalanx Command Deck
                </span>
                {isRunning ? (
                  <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning text-[10px] font-mono h-4.5 py-0 px-1.5 gap-1">
                    <StatusDot tone="warning" pulse size="xs" />
                    <span>Engaged ({incidents.length} active)</span>
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-border/60 bg-black/30 text-muted-foreground text-[10px] font-mono h-4.5 py-0 px-1.5 gap-1">
                    <StatusDot tone="positive" size="xs" />
                    <span>Standby</span>
                  </Badge>
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
                    "font-mono text-[11px] h-6 px-2.5 border-border/80",
                    isZeroDayActive && "border-destructive/60 bg-destructive/10 text-destructive"
                  )}
                  title="Scenario 1: Ingress Zero-Day & Exfiltration (PLX-1041)"
                >
                  <Play className="size-2.5 mr-1" />
                  PLX-1041 {isZeroDayRan && !isZeroDayActive ? "(Re-run)" : ""}
                </Button>

                <Button
                  size="xs"
                  variant="outline"
                  disabled={busyAction !== null}
                  onClick={() => void launch("identity-front", () => phalanxApi.runScenario("identity-front"), isIdentityRan)}
                  className={cn(
                    "font-mono text-[11px] h-6 px-2.5 border-border/80",
                    isIdentityActive && "border-warning/60 bg-warning/10 text-warning"
                  )}
                  title="Scenario 2: Corporate Identity Consent Abuse (PLX-1042)"
                >
                  <Play className="size-2.5 mr-1" />
                  PLX-1042 {isIdentityRan && !isIdentityActive ? "(Re-run)" : ""}
                </Button>

                <Button
                  size="xs"
                  variant="outline"
                  disabled={busyAction !== null}
                  onClick={() => void launch("campaign", () => phalanxApi.runCampaign(), isZeroDayRan || isIdentityRan)}
                  className={cn(
                    "font-mono text-[11px] h-6 px-2.5 border-border/80",
                    isCampaignActive && "border-primary/60 bg-primary/10 text-primary"
                  )}
                  title="Scenario 3: Coordinated Multi-Front Campaign (Salt Meridian)"
                >
                  <Play className="size-2.5 mr-1" />
                  Campaign
                </Button>
              </div>

              {/* Engine mode indicator */}
              <div className="flex items-center gap-1.5 rounded border border-border/70 bg-black/30 px-2 py-0.5 text-[11px] font-mono">
                <StatusDot tone={state.mode === "live" ? "positive" : "info"} pulse={state.mode === "live"} size="xs" />
                <span className="text-muted-foreground hidden md:inline">
                  {state.mode === "live" ? "Live" : "Replay"}
                </span>
                <Link to="/settings" className="text-primary hover:underline ml-1 text-[10px]">
                  Settings
                </Link>
              </div>

              <Button
                size="xs"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() => void handleReset()}
                className="h-6 px-2 text-[11px] border-border/80 hover:border-destructive/40 hover:text-destructive"
                title="Reset simulation to clean state"
              >
                {busyAction === "reset" ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                <span className="ml-1">Reset</span>
              </Button>

              <Button
                size="xs"
                variant="ghost"
                onClick={() => setUserCollapsed(false)}
                className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                title="Expand scenario dossiers"
              >
                <span>Dossiers</span>
                <ChevronDown className="size-3 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Full Technical Scenario Deck */
        <Card className="border-border/80 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 sm:p-5">
            {/* Header row */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-border/50 pb-4">
              <div className="flex items-center gap-3">
                <PhalanxProductMark className="size-8" />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold tracking-wide text-foreground">
                      Phalanx Autonomous Cyber Defense Swarm
                    </h2>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      A2A Swarm Protocol
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Autonomous multi-agent intrusion triage, cross-correlation, and automated containment across 19 specialized roles.
                  </p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                <div className="flex items-center gap-1.5 rounded-control border border-border/80 bg-black/40 px-2.5 py-1 text-[11px] font-mono">
                  <StatusDot tone={state.mode === "live" ? "positive" : "info"} pulse={state.mode === "live"} size="xs" />
                  <span className="text-foreground">
                    {state.mode === "live" ? `Live (${state.commanderModel})` : "Deterministic Replay"}
                  </span>
                  <Link
                    to="/settings"
                    className="ml-1.5 text-[10px] text-primary hover:underline"
                  >
                    Configure
                  </Link>
                </div>

                <Button
                  size="xs"
                  variant="outline"
                  disabled={busyAction !== null}
                  onClick={() => void handleReset()}
                  className="h-7 px-2.5 text-[11px] border-border/80 hover:border-destructive/40 hover:text-destructive"
                  title="Reset environment to clean baseline"
                >
                  {busyAction === "reset" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3" />
                  )}
                  <span className="ml-1">Reset</span>
                </Button>

                {isRunning ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => setUserCollapsed(true)}
                    className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    title="Collapse to compact strip"
                  >
                    <ChevronUp className="size-3.5" />
                    <span className="ml-1">Compact</span>
                  </Button>
                ) : null}
              </div>
            </div>

            {/* Error or Notice Toast */}
            {notice ? (
              <div className="mt-3 flex items-center gap-2 rounded-item border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                <AlertTriangle className="size-4 shrink-0" />
                <span>{notice}</span>
              </div>
            ) : null}

            {/* Scenario Dossier Cards */}
            <div className="mt-4">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Operational Attack Scenarios
                </span>
                <span className="text-[11px] font-mono text-muted-foreground">
                  Select a vector to observe autonomous blue-team response
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Scenario 1: Zero-Day */}
                <div
                  className={cn(
                    "flex flex-col justify-between rounded-item border p-3.5 transition-colors bg-card/40",
                    isZeroDayActive
                      ? "border-destructive/60 bg-destructive/[0.04]"
                      : "border-border/70 hover:border-border/90 hover:bg-card/70"
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-bold text-destructive tracking-wide">
                        PLX-1041 · SEV-1 CRITICAL
                      </span>
                      <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                        <Clock className="size-3" />
                        ~45s
                      </span>
                    </div>

                    <h3 className="mt-1.5 text-xs font-semibold text-foreground">
                      Ingress Zero-Day & Exfiltration
                    </h3>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                      <span className="rounded border border-border/50 bg-black/40 px-1.5 py-0.5">
                        Cmd: ATLAS
                      </span>
                      <span className="rounded border border-border/50 bg-black/40 px-1.5 py-0.5">
                        Tgt: edge-gw-01
                      </span>
                    </div>

                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                      Pre-auth HTTP desync on edge TLS terminator, DMZ deployment credential pivot, bulk S3 export harvesting, and 47s C2 beaconing.
                    </p>
                  </div>

                  <div className="mt-3.5 pt-2.5 border-t border-border/40">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyAction !== null}
                      onClick={() => void launch("zero-day-edge", () => phalanxApi.runScenario("zero-day-edge"), isZeroDayRan)}
                      className={cn(
                        "w-full h-7 text-[11px] font-mono border-border/80 hover:border-border justify-center gap-1.5",
                        isZeroDayActive && "border-destructive/60 bg-destructive/15 text-destructive hover:bg-destructive/20",
                        !isZeroDayActive && !isZeroDayRan && "bg-secondary/70 hover:bg-secondary text-foreground",
                        isZeroDayRan && !isZeroDayActive && "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {busyAction === "zero-day-edge" ? (
                        <>
                          <Loader2 className="size-3 animate-spin" />
                          <span>Dispatching...</span>
                        </>
                      ) : isZeroDayActive ? (
                        <>
                          <StatusDot tone="warning" pulse size="xs" />
                          <span>Active in Swarm</span>
                        </>
                      ) : isZeroDayRan ? (
                        <>
                          <RotateCcw className="size-3" />
                          <span>Re-run Scenario 1</span>
                        </>
                      ) : (
                        <>
                          <Play className="size-3" />
                          <span>Execute Scenario 1</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Scenario 2: Identity Front */}
                <div
                  className={cn(
                    "flex flex-col justify-between rounded-item border p-3.5 transition-colors bg-card/40",
                    isIdentityActive
                      ? "border-warning/60 bg-warning/[0.04]"
                      : "border-border/70 hover:border-border/90 hover:bg-card/70"
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-bold text-warning tracking-wide">
                        PLX-1042 · SEV-2 HIGH
                      </span>
                      <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                        <Clock className="size-3" />
                        ~30s
                      </span>
                    </div>

                    <h3 className="mt-1.5 text-xs font-semibold text-foreground">
                      Corporate Identity Consent Abuse
                    </h3>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                      <span className="rounded border border-border/50 bg-black/40 px-1.5 py-0.5">
                        Cmd: VESPER
                      </span>
                      <span className="rounded border border-border/50 bg-black/40 px-1.5 py-0.5">
                        Tgt: corp-idp-01
                      </span>
                    </div>

                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                      Unregistered OAuth application tricked two finance users into granting mail-read consent, initiating automated mailbox harvesting.
                    </p>
                  </div>

                  <div className="mt-3.5 pt-2.5 border-t border-border/40">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyAction !== null}
                      onClick={() => void launch("identity-front", () => phalanxApi.runScenario("identity-front"), isIdentityRan)}
                      className={cn(
                        "w-full h-7 text-[11px] font-mono border-border/80 hover:border-border justify-center gap-1.5",
                        isIdentityActive && "border-warning/60 bg-warning/15 text-warning hover:bg-warning/20",
                        !isIdentityActive && !isIdentityRan && "bg-secondary/70 hover:bg-secondary text-foreground",
                        isIdentityRan && !isIdentityActive && "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {busyAction === "identity-front" ? (
                        <>
                          <Loader2 className="size-3 animate-spin" />
                          <span>Dispatching...</span>
                        </>
                      ) : isIdentityActive ? (
                        <>
                          <StatusDot tone="warning" pulse size="xs" />
                          <span>Active in Swarm</span>
                        </>
                      ) : isIdentityRan ? (
                        <>
                          <RotateCcw className="size-3" />
                          <span>Re-run Scenario 2</span>
                        </>
                      ) : (
                        <>
                          <Play className="size-3" />
                          <span>Execute Scenario 2</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Scenario 3: Coordinated Campaign */}
                <div
                  className={cn(
                    "flex flex-col justify-between rounded-item border p-3.5 transition-colors bg-card/40",
                    isCampaignActive
                      ? "border-primary/60 bg-primary/[0.04]"
                      : isCampaignRan
                        ? "border-positive/40 bg-positive/[0.03]"
                        : "border-border/70 hover:border-border/90 hover:bg-card/70"
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-bold text-primary tracking-wide">
                        SALT MERIDIAN · CAMPAIGN
                      </span>
                      <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                        <Clock className="size-3" />
                        ~60s
                      </span>
                    </div>

                    <h3 className="mt-1.5 text-xs font-semibold text-foreground">
                      Coordinated Multi-Front Campaign
                    </h3>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                      <span className="rounded border border-border/50 bg-black/40 px-1.5 py-0.5">
                        Cmds: ATLAS + VESPER
                      </span>
                      <span className="rounded border border-border/50 bg-black/40 px-1.5 py-0.5">
                        Arb: ORRERY
                      </span>
                    </div>

                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                      Simultaneous dual-vector breach. Incident commanders cross-correlate indicators in real time while ORRERY arbitrates responder capacity.
                    </p>
                  </div>

                  <div className="mt-3.5 pt-2.5 border-t border-border/40">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyAction !== null}
                      onClick={() => void launch("campaign", () => phalanxApi.runCampaign(), isZeroDayRan || isIdentityRan)}
                      className={cn(
                        "w-full h-7 text-[11px] font-mono border-border/80 hover:border-border justify-center gap-1.5",
                        isCampaignActive && "border-primary/60 bg-primary/15 text-primary hover:bg-primary/20",
                        !isCampaignActive && !isCampaignRan && "bg-secondary/70 hover:bg-secondary text-foreground",
                        isCampaignRan && !isCampaignActive && "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {busyAction === "campaign" ? (
                        <>
                          <Loader2 className="size-3 animate-spin" />
                          <span>Dispatching...</span>
                        </>
                      ) : isCampaignActive ? (
                        <>
                          <StatusDot tone="warning" pulse size="xs" />
                          <span>Active Campaign</span>
                        </>
                      ) : isCampaignRan ? (
                        <>
                          <RotateCcw className="size-3" />
                          <span>Re-run Campaign</span>
                        </>
                      ) : (
                        <>
                          <Play className="size-3" />
                          <span>Execute Campaign</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

