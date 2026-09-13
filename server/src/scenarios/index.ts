import type { IncidentSeverity } from "../model.ts"

export interface ScenarioDetection {
  afterMs: number
  source: string
  host: string
  rule: string
  detail: string
  severity: IncidentSeverity
}

export interface Scenario {
  id: string
  name: string
  summary: string
  code: string
  title: string
  severity: IncidentSeverity
  commanderId: string
  assets: string[]
  indicators: string[]
  detections: ScenarioDetection[]
  /** Milliseconds between the first detection and the commander taking command. */
  commandAfterMs: number
}

export const SCENARIOS: Scenario[] = [
  {
    id: "zero-day-edge",
    name: "Zero-day in the ingress gateway",
    code: "PLX-1041",
    title: "Pre-authentication compromise of edge-gw-01",
    summary:
      "The WAF logged a malformed chunked request to an administrative path on edge-gw-01, immediately followed by the gateway service account spawning a shell. Minutes later a deployment credential authenticated from the DMZ for the first time, and an export bucket was read in bulk. No CVE matches the request pattern.",
    severity: "sev1",
    commanderId: "ic-atlas",
    assets: ["edge-gw-01", "edge-gw-02", "app-api-21", "build-ci-01", "build-art-01", "data-obj-01"],
    indicators: ["185.121.44.19", "cdn-status-check.net", "libedgetls.so.2", "svc-deploy"],
    commandAfterMs: 4200,
    detections: [
      {
        afterMs: 0,
        source: "waf",
        host: "edge-gw-01",
        rule: "HTTP-DESYNC-HEURISTIC",
        detail: "POST /admin/_health carried both Transfer-Encoding: chunked and Content-Length",
        severity: "sev3",
      },
      {
        afterMs: 900,
        source: "edr",
        host: "edge-gw-01",
        rule: "SERVICE-ACCOUNT-SHELL",
        detail: "rivet-edge (TLS terminator) is the parent of /bin/sh with no interactive session",
        severity: "sev2",
      },
      {
        afterMs: 1800,
        source: "idp",
        host: "corp-idp-01",
        rule: "NEW-SOURCE-FOR-PRINCIPAL",
        detail: "svc-deploy authenticated from edge-gw-01 — first ever authentication from the DMZ",
        severity: "sev2",
      },
      {
        afterMs: 2700,
        source: "netflow",
        host: "edge-gw-01",
        rule: "PERIODIC-EGRESS",
        detail: "4,102 flows to 185.121.44.19:443 on a 47s cadence with low jitter",
        severity: "sev2",
      },
      {
        afterMs: 3400,
        source: "audit",
        host: "data-obj-01",
        rule: "BULK-OBJECT-READ",
        detail: "svc-backup listed and read 3,140 customer export objects in eleven minutes",
        severity: "sev1",
      },
    ],
  },
  {
    id: "identity-front",
    name: "Second front on the identity plane",
    code: "PLX-1042",
    title: "Consent-grant abuse in the corporate tenant",
    summary:
      "An OAuth application nobody registered was granted mail-read consent by two finance users within four minutes of each other, and immediately began enumerating shared mailboxes. It resolves to infrastructure adjacent to the gateway intrusion.",
    severity: "sev2",
    commanderId: "ic-vesper",
    assets: ["corp-idp-01", "corp-ws-204", "corp-fs-03"],
    indicators: ["cdn-status-check.net", "r.almeida", "app-id 9f31c0"],
    commandAfterMs: 3000,
    detections: [
      {
        afterMs: 0,
        source: "idp",
        host: "corp-idp-01",
        rule: "UNKNOWN-APP-CONSENT",
        detail: "Application 9f31c0 granted mail.read by r.almeida — publisher unverified",
        severity: "sev3",
      },
      {
        afterMs: 1100,
        source: "idp",
        host: "corp-idp-01",
        rule: "CONSENT-BURST",
        detail: "Second consent grant for the same application within four minutes",
        severity: "sev2",
      },
      {
        afterMs: 2100,
        source: "audit",
        host: "corp-fs-03",
        rule: "MAILBOX-ENUMERATION",
        detail: "Application 9f31c0 enumerated 214 shared mailboxes",
        severity: "sev2",
      },
    ],
  },
]

export const SCENARIO_BY_ID = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]))
