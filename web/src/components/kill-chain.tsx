import { useMemo } from "react"
import { cn } from "@foundry/ui/lib/utils"
import { Globe, Terminal, Layers, Network, UploadCloud, ShieldCheck } from "lucide-react"
import { SectionHeader } from "@/components/section-header"
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

    let containmentText = "Aegis automated isolation active"
    if (edgeIsolated) containmentText = "Aegis isolation active · edge-gw-01 isolated from production"
    else if (principalsRevoked) containmentText = "Keystone credential revocation active · OAuth tokens expired"
    else if (c2Blocked) containmentText = "Spectre egress sinkhole active · 185.121.44.19 blackholed"

    const stagesList: KillChainStage[] = [
      {
        id: "initial-access",
        step: "01",
        mitreId: "TA0001",
        name: "Initial Access",
        scope: "WAF and ingress gateways",
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
        scope: "Process and host EDR",
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
        scope: "Host and CI artifacts",
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
        scope: "East-west flow and IAM",
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
        scope: "C2 egress and S3 buckets",
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
        scope: "Automated response",
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

  const summary =
    detectedCount > 0
      ? { tone: "negative", text: `${detectedCount} active intercept${detectedCount > 1 ? "s" : ""}` }
      : remediatedCount > 0
        ? { tone: "positive", text: `${remediatedCount} stages neutralized` }
        : { tone: "muted", text: "Perimeter nominal" }

  return (
    <section className={cn("flex shrink-0 flex-col gap-3", className)}>
      <SectionHeader title="Kill chain">
        <span className="sev-tag" data-tone={summary.tone}>
          {summary.text}
        </span>
      </SectionHeader>

      {/* The automated barrier, as one line of fact rather than a banner */}
      {isContained ? (
        <p className="meta-mono flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule-soft pb-2">
          <span className="text-ink">Automated containment active</span>
          <span>{containmentDetails}</span>
        </p>
      ) : null}

      {/* The six MITRE ATT&CK stages, as one hairline grid */}
      <div className="grid grid-cols-1 gap-px border-y border-rule-soft bg-rule-soft sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {stages.map((stage) => {
          const isDetected = stage.status === "Detected"
          const isRemediated = stage.status === "Remediated/Blocked"
          const Icon = stage.Icon

          return (
            <div key={stage.id} className="flex flex-col gap-2 bg-page px-3.5 py-3" title={stage.description}>
              <span className="eyebrow">
                {stage.step} · {stage.mitreId}
              </span>

              <span className="flex items-center gap-2">
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="title-serif text-[0.9375rem]">{stage.name}</span>
              </span>

              <span className="meta-mono flex items-center gap-1.5">
                <span
                  className="inline-block size-1.5 shrink-0 rounded-full"
                  style={{
                    background: isDetected
                      ? "var(--negative)"
                      : isRemediated
                        ? "var(--positive)"
                        : "var(--muted-soft)",
                  }}
                />
                <span className={isDetected || isRemediated ? "text-ink" : undefined}>
                  {isDetected ? "Detected" : isRemediated ? "Blocked" : "Quiet"}
                </span>
              </span>

              <span className="meta-mono truncate" title={stage.evidence ?? stage.scope}>
                {stage.evidence ?? stage.scope}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
