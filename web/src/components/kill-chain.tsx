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

  const stages: KillChainStage[] = useMemo(() => {
    const detections = state.detections
    const incidents = [...state.incidents.values()]
    const hosts = [...state.hosts.values()]
    const range = state.rangeStatus
    const posture = state.posture

    // Helper checks
    const latestRule = (pattern: RegExp) => detections.find((d: Detection) => pattern.test(d.rule) || pattern.test(d.detail))
    const isAnyIncidentContained = incidents.some(
      (inc) => inc.status === "contained" || inc.status === "resolved" || ["contain", "eradicate", "recover", "review"].includes(inc.phase)
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

    // 6. Containment (Active Defense)
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

    return [
      {
        id: "initial-access",
        step: "01",
        mitreId: "TA0001",
        name: "Initial Access",
        scope: "WAF & Ingress Gateways",
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
        scope: "Process & Host EDR",
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
        scope: "Host & CI Artifacts",
        description: "Maintaining foothold via LD_PRELOAD shims, poisoned CI artifacts, or backdoors.",
        status: persistStatus,
        evidence: persistEvidence,
        Icon: Layers,
      },
      {
        id: "lateral-movement",
        step: "04",
        mitreId: "TA0008",
        name: "Lateral Movement",
        scope: "East-West NetFlow & IAM",
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
        scope: "C2 Egress & S3 Buckets",
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
        scope: "Automated Blue SOAR",
        description: "Autonomous host isolation, credential revocation, and C2 blackholing by Phalanx.",
        status: containmentStatus,
        evidence: containmentEvidence,
        Icon: ShieldCheck,
      },
    ]
  }, [state])

  const detectedCount = stages.filter((s) => s.status === "Detected").length
  const remediatedCount = stages.filter((s) => s.status === "Remediated/Blocked").length

  return (
    <Card className={cn("shrink-0 border-border/80 bg-card/60 backdrop-blur-sm", className)}>
      <CardHeader className="border-b border-border/40 pb-3 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-6 items-center justify-center rounded-control border border-border/80 bg-accent/30 text-foreground">
              <Shield className="size-3.5" />
            </div>
            <div>
              <CardTitle className="text-xs font-semibold tracking-wide text-foreground">
                MITRE ATT&CK Intrusion Lifecycle
              </CardTitle>
              <CardDescription className="text-[11px] text-muted-foreground">
                Adversary stage tracking & autonomous blue-team intercept telemetry
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {detectedCount > 0 ? (
              <Badge
                variant="destructive"
                className="gap-1.5 border-destructive/40 bg-destructive/15 font-mono text-[10px] text-destructive"
              >
                <AlertTriangle className="size-3" />
                <span>{detectedCount} Active Stage{detectedCount > 1 ? "s" : ""}</span>
              </Badge>
            ) : remediatedCount > 0 ? (
              <Badge
                variant="outline"
                className="gap-1.5 border-positive/40 bg-positive/15 font-mono text-[10px] text-positive"
              >
                <CheckCircle2 className="size-3" />
                <span>{remediatedCount} Stage{remediatedCount > 1 ? "s" : ""} Neutralized</span>
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-1.5 border-border/60 bg-black/40 font-mono text-[10px] text-muted-foreground"
              >
                <Radio className="size-3 text-positive" />
                <span>Perimeter Nominal · All Quiet</span>
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {stages.map((stage) => {
            const isDetected = stage.status === "Detected"
            const isRemediated = stage.status === "Remediated/Blocked"
            const Icon = stage.Icon

            return (
              <div
                key={stage.id}
                className={cn(
                  "relative flex flex-col justify-between rounded-item border p-2.5 transition-colors",
                  isDetected && "border-destructive/60 bg-destructive/[0.08]",
                  isRemediated && "border-positive/40 bg-positive/[0.05]",
                  !isDetected && !isRemediated && "border-border/60 bg-card/40 hover:border-border/80"
                )}
                title={stage.description}
              >
                {/* Header row: Step code and status */}
                <div className="flex items-center justify-between gap-1.5">
                  <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                    {stage.step} · {stage.mitreId}
                  </span>

                  {isDetected ? (
                    <Badge
                      variant="destructive"
                      className="h-4 px-1.5 font-mono text-[9px] font-semibold border-destructive/40 bg-destructive/20 text-destructive"
                    >
                      Active
                    </Badge>
                  ) : isRemediated ? (
                    <Badge
                      variant="outline"
                      className="h-4 px-1.5 font-mono text-[9px] font-semibold border-positive/40 bg-positive/15 text-positive"
                    >
                      Blocked
                    </Badge>
                  ) : (
                    <span className="font-mono text-[9px] text-muted-foreground/60">
                      Quiet
                    </span>
                  )}
                </div>

                {/* Stage title */}
                <div className="mt-2 flex items-center gap-1.5">
                  <Icon
                    className={cn(
                      "size-3.5 shrink-0",
                      isDetected && "text-destructive",
                      isRemediated && "text-positive",
                      !isDetected && !isRemediated && "text-muted-foreground"
                    )}
                  />
                  <span className="font-medium text-xs text-foreground truncate">
                    {stage.name}
                  </span>
                </div>

                {/* Telemetry Indicator / Scope */}
                <div className="mt-2 pt-1.5 border-t border-border/30">
                  {stage.evidence ? (
                    <div
                      className={cn(
                        "font-mono text-[10px] leading-tight truncate",
                        isDetected && "text-destructive font-medium",
                        isRemediated && "text-positive"
                      )}
                      title={stage.evidence}
                    >
                      <span className="mr-1">●</span>
                      {stage.evidence}
                    </div>
                  ) : (
                    <div className="font-mono text-[10px] text-muted-foreground/60 truncate">
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

