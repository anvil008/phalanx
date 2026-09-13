import { useMemo } from "react"
import { Badge } from "@foundry/ui/components/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@foundry/ui/components/card"
import { cn } from "@foundry/ui/lib/utils"
import {
  Globe,
  Terminal,
  Layers,
  Network,
  UploadCloud,
  ShieldCheck,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Lock,
  Flame,
} from "lucide-react"
import type { Detection, IncidentTimelineEntry } from "@/lib/model"
import { usePhalanx, type PhalanxState } from "@/lib/store"

export type StageStatus = "Quiet" | "Detected" | "Remediated/Blocked"

export interface KillChainStage {
  id: string
  step: string
  mitreId: string
  name: string
  scope: string
  description: string
  status: StageStatus
  evidence?: string
  Icon: React.ComponentType<{ className?: string }>
}

interface KillChainProps {
  state?: PhalanxState
  className?: string
}

export function KillChain({ state: propState, className }: KillChainProps) {
  const hookState = usePhalanx()
  const state = propState ?? hookState

  const { stages, isContained, containmentDetails } = useMemo(() => {
    const detections = state.detections
    const incidents = [...state.incidents.values()]
    const hosts = [...state.hosts.values()]
    const range = state.rangeStatus
    const posture = state.posture

    // Helper checks
    const latestRule = (pattern: RegExp) => detections.find((d: Detection) => pattern.test(d.rule) || pattern.test(d.detail))
    const isAnyIncidentContained = incidents.some(
      (inc) => inc.status === "contained" || inc.status === "resolved" || ["contain", "eradicate", "recover", "review"].includes(inc.phase),
    )
    const isAllContained =
      incidents.length > 0 &&
      incidents.every((inc) => inc.status === "contained" || inc.status === "resolved" || inc.phase === "recover" || inc.phase === "review")

    const edgeIsolated = hosts.some((h) => h.name === "edge-gw-01" && h.status === "isolated") || (range?.isolatedHosts?.includes("edge-gw-01") ?? false)
    const principalsRevoked = (range?.revokedPrincipals?.length ?? 0) > 0 || incidents.some((inc) => inc.timeline.some((t: IncidentTimelineEntry) => /revok/i.test(t.text)))
    const c2Blocked = (range?.blockedIndicators?.includes("185.121.44.19") ?? false) || incidents.some((inc) => inc.timeline.some((t: IncidentTimelineEntry) => /block/i.test(t.text)))

    // 1. Initial Access (TA0001)
    const initAccessMatch = latestRule(/HTTP-DESYNC|UNKNOWN-APP-CONSENT|CONSENT-BURST|WAF|DESYNC|PASSWORD-SPRAY/i)
    const initAccessDetected =
      Boolean(initAccessMatch) ||
      Boolean(range?.stages?.["initial-access"]) ||
      (range?.consentGrants?.length ?? 0) > 0 ||
      (range?.failedLogins ?? 0) > 0
    const initAccessRemediated = initAccessDetected && (edgeIsolated || principalsRevoked || isAnyIncidentContained)

    let initAccessStatus: StageStatus = "Quiet"
    let initAccessEvidence: string | undefined
    if (initAccessRemediated) {
      initAccessStatus = "Remediated/Blocked"
      initAccessEvidence = edgeIsolated ? "edge-gw-01 isolated" : principalsRevoked ? "App consent revoked" : "Vector contained"
    } else if (initAccessDetected) {
      initAccessStatus = "Detected"
      initAccessEvidence = initAccessMatch?.rule ?? "Pre-auth entrypoint alert"
    }

    // 2. Execution (TA0002)
    const execMatch = latestRule(/SERVICE-ACCOUNT-SHELL|SHELL|EXEC|DETONATE|RANSOMWARE/i)
    const execDetected = Boolean(execMatch) || (range?.filesEncrypted ?? 0) > 0 || Boolean(range?.stages?.["execution"])
    const execRemediated = execDetected && (edgeIsolated || range?.encryptionStopped || isAnyIncidentContained)

    let execStatus: StageStatus = "Quiet"
    let execEvidence: string | undefined
    if (execRemediated) {
      execStatus = "Remediated/Blocked"
      execEvidence = range?.encryptionStopped ? "Ransomware stopped" : "Process killed & isolated"
    } else if (execDetected) {
      execStatus = "Detected"
      execEvidence = execMatch?.rule ?? "Service shell execution"
    }

    // 3. Persistence (TA0003)
    const persistMatch = latestRule(/PRELOAD|ARTIFACT|POISON|BUILD-CI|BUILD-ART|libedgetls/i)
    const persistInIndicators = incidents.some((inc) => inc.indicators.some((ind: string) => ind.includes("libedgetls")))
    const persistDetected =
      Boolean(persistMatch) ||
      persistInIndicators ||
      Boolean(range?.stages?.["persistence"]) ||
      incidents.some((inc) => inc.assets.some((a: string) => a.startsWith("build-")) && inc.phase !== "detect")
    const persistRemediated = persistDetected && (isAllContained || incidents.some((inc) => ["eradicate", "recover", "review"].includes(inc.phase)))

    let persistStatus: StageStatus = "Quiet"
    let persistEvidence: string | undefined
    if (persistRemediated) {
      persistStatus = "Remediated/Blocked"
      persistEvidence = "CI artifact quarantined"
    } else if (persistDetected) {
      persistStatus = "Detected"
      persistEvidence = persistInIndicators ? "libedgetls.so.2 (shim)" : persistMatch?.rule ?? "Artifact poison observed"
    }

    // 4. Lateral Movement (TA0008)
    const lateralMatch = latestRule(/NEW-SOURCE-FOR-PRINCIPAL|MAILBOX-ENUMERATION|LATERAL/i)
    const lateralDetected =
      Boolean(lateralMatch) ||
      Boolean(range?.stages?.["lateral-movement"]) ||
      (range?.mailboxesEnumerated ?? 0) > 0 ||
      (range?.compromisedHosts?.length ?? 0) > 1
    const lateralRemediated = lateralDetected && (principalsRevoked || range?.enumerationStopped || isAnyIncidentContained)

    let lateralStatus: StageStatus = "Quiet"
    let lateralEvidence: string | undefined
    if (lateralRemediated) {
      lateralStatus = "Remediated/Blocked"
      lateralEvidence = range?.enumerationStopped ? "Mail enumeration halted" : "Principal revoked"
    } else if (lateralDetected) {
      lateralStatus = "Detected"
      lateralEvidence = lateralMatch?.rule ?? "Credential pivot from DMZ"
    }

    // 5. Exfiltration (TA0010)
    const exfilMatch = latestRule(/PERIODIC-EGRESS|BULK-OBJECT-READ|EXFIL/i)
    const exfilDetected =
      Boolean(exfilMatch) ||
      Boolean(range?.stages?.["exfiltration"]) ||
      (range?.exfilBytes ?? 0) > 0 ||
      (range?.beaconCount ?? 0) > 0
    const exfilRemediated = exfilDetected && (c2Blocked || isAnyIncidentContained || edgeIsolated)

    let exfilStatus: StageStatus = "Quiet"
    let exfilEvidence: string | undefined
    if (exfilRemediated) {
      exfilStatus = "Remediated/Blocked"
      exfilEvidence = c2Blocked ? "185.121.44.19 sinkholed" : "C2 egress terminated"
    } else if (exfilDetected) {
      exfilStatus = "Detected"
      exfilEvidence = exfilMatch?.rule ?? "47s beacon / bulk read"
    }

    // 6. Containment (Active Defense - MITRE D3FEND D3-DEF)
    const hasContainmentAction =
      posture.containedToday > 0 ||
      incidents.some((inc) => inc.status === "contained" || inc.status === "resolved") ||
      (range?.isolatedHosts?.length ?? 0) > 0 ||
      (range?.blockedIndicators?.length ?? 0) > 0 ||
      (range?.revokedPrincipals?.length ?? 0) > 0
    const isActivelyEngaged =
      posture.openIncidents > 0 ||
      incidents.some((inc) => ["contain", "eradicate"].includes(inc.phase)) ||
      initAccessStatus === "Detected" ||
      execStatus === "Detected" ||
      lateralStatus === "Detected" ||
      exfilStatus === "Detected"

    let containmentStatus: StageStatus = "Quiet"
    let containmentEvidence: string | undefined
    if (hasContainmentAction) {
      containmentStatus = "Remediated/Blocked"
      containmentEvidence =
        posture.containedToday > 0
          ? `${posture.containedToday} incident(s) contained`
          : "Host isolated & policy locked"
    } else if (isActivelyEngaged) {
      containmentStatus = "Detected"
      containmentEvidence = `${posture.agentsEngaged} defender(s) isolating`
    }

    const isContainedFlag =
      hasContainmentAction ||
      initAccessRemediated ||
      execRemediated ||
      lateralRemediated ||
      exfilRemediated ||
      edgeIsolated ||
      principalsRevoked ||
      c2Blocked

    let containmentText = "AEGIS Automated Air-Gap Isolation Active"
    if (edgeIsolated) containmentText = "AEGIS Air-Gap Active · edge-gw-01 Isolated from Production"
    else if (principalsRevoked) containmentText = "KEYSTONE Credential Revocation Active · OAuth Tokens Expired"
    else if (c2Blocked) containmentText = "SPECTRE Egress Sinkhole Active · 185.121.44.19 Blackholed"

    const stagesList: KillChainStage[] = [
      {
        id: "initial-access",
        step: "01",
        mitreId: "TA0001",
        name: "Initial Access",
        scope: "WAF & INGRESS GATEWAYS",
        description: "Public-facing gateway exploit (HTTP desync) or corporate identity consent abuse.",
        status: initAccessStatus,
        evidence: initAccessEvidence,
        Icon: Globe,
      },
      {
        id: "execution",
        step: "02",
        mitreId: "TA0002",
        name: "Execution",
        scope: "PROCESS & HOST EDR",
        description: "Adversary commands, unauthorized service shells, or malicious script detonation.",
        status: execStatus,
        evidence: execEvidence,
        Icon: Terminal,
      },
      {
        id: "persistence",
        step: "03",
        mitreId: "TA0003",
        name: "Persistence",
        scope: "HOST & CI ARTIFACTS",
        description: "Foothold via LD_PRELOAD shims, poisoned CI artifacts, or scheduled triggers.",
        status: persistStatus,
        evidence: persistEvidence,
        Icon: Layers,
      },
      {
        id: "lateral-movement",
        step: "04",
        mitreId: "TA0008",
        name: "Lateral Movement",
        scope: "EAST-WEST FLOW & IAM",
        description: "Pivot across network zones using harvested service accounts or tenant tokens.",
        status: lateralStatus,
        evidence: lateralEvidence,
        Icon: Network,
      },
      {
        id: "exfiltration",
        step: "05",
        mitreId: "TA0010",
        name: "Exfiltration",
        scope: "C2 EGRESS & S3 BUCKETS",
        description: "Periodic 47s C2 beaconing and bulk customer export data extraction.",
        status: exfilStatus,
        evidence: exfilEvidence,
        Icon: UploadCloud,
      },
      {
        id: "containment",
        step: "06",
        mitreId: "D3-DEF",
        name: "Containment",
        scope: "AUTONOMOUS SOAR",
        description: "Autonomous host isolation, credential revocation, and C2 blackholing by Phalanx.",
        status: containmentStatus,
        evidence: containmentEvidence,
        Icon: ShieldCheck,
      },
    ]

    return {
      stages: stagesList,
      isContained: isContainedFlag,
      containmentDetails: containmentText,
    }
  }, [state])

  const detectedCount = stages.filter((s) => s.status === "Detected").length
  const remediatedCount = stages.filter((s) => s.status === "Remediated/Blocked").length

  return (
    <Card className={cn("shrink-0 border-border bg-card/85 backdrop-blur-md shadow-xl", className)}>
      <CardHeader className="border-b border-border/50 pb-3 pt-3.5 px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-control border border-border/80 bg-primary/10 text-primary shadow-[0_0_8px_rgba(76,201,217,0.25)]">
              <Shield className="size-4" />
            </div>
            <div>
              <CardTitle className="font-mono text-xs sm:text-sm font-bold tracking-wider text-foreground uppercase">
                MITRE ATT&CK INTRUSION LIFECYCLE & ACTIVE INTERCEPT
              </CardTitle>
              <CardDescription className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
                ADVERSARY STAGE TRACKING · AUTONOMOUS AGENT CONTAINMENT TELEMETRY
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {detectedCount > 0 ? (
              <Badge
                variant="destructive"
                className="gap-1.5 border-destructive/50 bg-destructive/20 font-mono text-[10px] font-bold text-destructive shadow-[0_0_10px_rgba(242,86,95,0.25)]"
              >
                <AlertTriangle className="size-3" />
                <span>{detectedCount} ACTIVE INTERCEPT{detectedCount > 1 ? "S" : ""}</span>
              </Badge>
            ) : remediatedCount > 0 ? (
              <Badge
                variant="outline"
                className="gap-1.5 border-positive/50 bg-positive/20 font-mono text-[10px] font-bold text-positive shadow-[0_0_10px_rgba(62,207,142,0.25)]"
              >
                <CheckCircle2 className="size-3" />
                <span>{remediatedCount} STAGES NEUTRALIZED</span>
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-1.5 border-border/70 bg-black/40 font-mono text-[10px] text-muted-foreground"
              >
                <Radio className="size-3 text-positive animate-pulse" />
                <span>PERIMETER NOMINAL · ALL QUIET</span>
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3.5 sm:p-4 flex flex-col gap-3.5">
        {/* Animated Automated Containment Barrier (Displays glowing firewall lock between stages) */}
        {isContained ? (
          <div className="animate-containment-firewall rounded-item border border-primary/70 bg-primary/[0.08] p-3 flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_10px_rgba(76,201,217,0.8)]">
                <Lock className="size-3.5" />
              </div>
              <div>
                <div className="flex items-center gap-2 font-mono text-xs font-bold text-primary uppercase tracking-wide">
                  <Flame className="size-3.5 text-warning animate-bounce" />
                  <span>AUTOMATED BLUE-TEAM CONTAINMENT BARRIER ACTIVE</span>
                </div>
                <div className="font-mono text-[11px] text-foreground/90 mt-0.5">
                  {containmentDetails}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 font-mono text-[10px]">
              <span className="rounded border border-positive/40 bg-positive/20 px-2 py-0.5 font-bold text-positive">
                D3FEND D3-DEF VERIFIED
              </span>
              <span className="rounded border border-border/80 bg-black/50 px-2 py-0.5 text-muted-foreground">
                0 REMAINING HOPS
              </span>
            </div>
          </div>
        ) : null}

        {/* 6 MITRE ATT&CK Stage Cards */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {stages.map((stage) => {
            const isDetected = stage.status === "Detected"
            const isRemediated = stage.status === "Remediated/Blocked"
            const Icon = stage.Icon

            return (
              <div
                key={stage.id}
                className={cn(
                  "relative flex flex-col justify-between rounded-item border p-3 transition-all",
                  isDetected && "border-destructive/70 bg-destructive/[0.1] shadow-[0_0_14px_rgba(242,86,95,0.2)]",
                  isRemediated && "border-positive/50 bg-positive/[0.06] shadow-[0_0_12px_rgba(62,207,142,0.15)]",
                  !isDetected && !isRemediated && "border-border/70 bg-card/50 hover:border-border hover:bg-card/75",
                )}
                title={stage.description}
              >
                {/* Header row: Step code and status badge */}
                <div className="flex items-center justify-between gap-1.5 border-b border-border/40 pb-1.5">
                  <span className="font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    {stage.step} · {stage.mitreId}
                  </span>

                  {isDetected ? (
                    <Badge
                      variant="destructive"
                      className="h-4 px-1.5 font-mono text-[9px] font-bold border-destructive/50 bg-destructive/30 text-destructive"
                    >
                      ACTIVE
                    </Badge>
                  ) : isRemediated ? (
                    <Badge
                      variant="outline"
                      className="h-4 px-1.5 font-mono text-[9px] font-bold border-positive/50 bg-positive/20 text-positive"
                    >
                      BLOCKED
                    </Badge>
                  ) : (
                    <span className="font-mono text-[9px] text-muted-foreground/60 uppercase">
                      QUIET
                    </span>
                  )}
                </div>

                {/* Stage title & Icon */}
                <div className="mt-2.5 flex items-center gap-2">
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      isDetected && "text-destructive",
                      isRemediated && "text-positive",
                      !isDetected && !isRemediated && "text-muted-foreground",
                    )}
                  />
                  <span className="font-mono text-xs font-bold text-foreground truncate">
                    {stage.name}
                  </span>
                </div>

                {/* Telemetry Evidence / Scope Chip */}
                <div className="mt-2.5 pt-2 border-t border-border/30">
                  {stage.evidence ? (
                    <div
                      className={cn(
                        "rounded border px-1.5 py-1 font-mono text-[10px] leading-tight truncate flex items-center gap-1",
                        isDetected && "border-destructive/40 bg-destructive/15 text-destructive font-semibold",
                        isRemediated && "border-positive/40 bg-positive/15 text-positive font-semibold",
                      )}
                      title={stage.evidence}
                    >
                      <span className="inline-block size-1.5 rounded-full bg-currentColor animate-pulse shrink-0" />
                      <span className="truncate">{stage.evidence}</span>
                    </div>
                  ) : (
                    <div className="font-mono text-[9px] text-muted-foreground/60 uppercase truncate">
                      {stage.scope}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
