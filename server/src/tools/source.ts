import type { EstateHost, IncidentSeverity } from "../model.ts"

/* Telemetry source.
   The agents' read tools and containment actuators go through this interface,
   so the same commander logic runs whether the world is the built-in
   simulation or the live range. `sim` returns the authored estate; `range`
   reads the real logs the attack wrote and drives the real control plane. */

export interface TelemetrySource {
  readonly kind: "sim" | "range"
  siem(query: string): Promise<string>
  edr(host: string): Promise<string>
  netflow(host: string): Promise<string>
  dns(domain: string): Promise<string>
  idp(principal: string): Promise<string>
  iam(principal: string): Promise<string>
  hostTimeline(host: string): Promise<string>
  memoryCapture(host: string): Promise<string>
  pcap(host: string): Promise<string>
  cve(id: string): Promise<string>
  indicator(indicator: string): Promise<string>
  intel(question: string): Promise<string>
  sbom(product: string): Promise<string>
  sandboxRepro(target: string): Promise<string>
  detonate(sample: string): Promise<string>
  readArtifact(path: string): Promise<string>

  /** Containment actuators. In `range` these take real effect. */
  isolateHost(host: string, justification: string): Promise<string>
  blockEgress(indicator: string): Promise<string>
  revokeSessions(principal: string): Promise<string>
  revokeConsent(app: string): Promise<string>
  deployMitigation(target: string, description: string): Promise<string>
  rebuildHost(host: string): Promise<string>
  verifyClosure(claim: string): Promise<string>

  /** Host status the mission-control estate panel reflects, when the source
      is authoritative for it (range is; sim leaves the store to drive it). */
  hostStatuses?(): Promise<Record<string, EstateHost["status"]>>
}

export interface RangeDetection {
  source: string
  host: string
  rule: string
  severity: IncidentSeverity
  detail: string
}

let active: TelemetrySource

export function setSource(source: TelemetrySource): void {
  active = source
}

export function getSource(): TelemetrySource {
  return active
}
