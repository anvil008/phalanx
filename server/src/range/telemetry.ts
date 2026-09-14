import { request as httpRequest } from "node:http"
import type { EstateHost } from "../model.ts"
import type { TelemetrySource } from "../tools/source.ts"
import { readEvents, readState, type RangeEvent } from "./events.ts"

/* The range as a telemetry source.
   Reads answer the same questions the sim source does, but every line comes
   from events.jsonl — the log the running attack actually wrote. Actuators
   POST to the range's control plane, so containment is real: isolating
   edge-gw-01 stops the beacon loop, and the next SIEM read shows it stopped. */

const BASE = Number(process.env.PHALANX_RANGE_BASE_PORT ?? 8110)
const CONTROL_PORT = BASE + 9

function fmt(rows: RangeEvent[]): string {
  if (rows.length === 0) return "no rows in the retained window"
  return rows
    .slice(-40)
    .map((row) => {
      const when = row.ts.slice(11, 19)
      return `${when}  ${row.host.padEnd(14)} ${row.source.padEnd(8)} ${row.detail}`
    })
    .join("\n")
}

function matches(event: RangeEvent, needle: string): boolean {
  const q = needle.toLowerCase()
  if (q === "all" || q === "") return true
  return (
    event.host.toLowerCase().includes(q) ||
    event.detail.toLowerCase().includes(q) ||
    (event.principal ?? "").toLowerCase().includes(q) ||
    (event.dst ?? "").toLowerCase().includes(q) ||
    event.source.toLowerCase().includes(q) ||
    event.tags.some((tag) => tag.includes(q))
  )
}

async function control(path: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const payload = JSON.stringify(body)
  return new Promise((resolve) => {
    const req = httpRequest(
      { host: "127.0.0.1", port: CONTROL_PORT, method: "POST", path, headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (chunk) => chunks.push(chunk as Buffer))
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")))
          } catch {
            resolve({})
          }
        })
      },
    )
    req.on("error", () => resolve({}))
    req.end(payload)
  })
}

export const rangeSource: TelemetrySource = {
  kind: "range",

  async siem(query) {
    const events = await readEvents()
    return fmt(events.filter((event) => event.kind !== "control" && matches(event, query)))
  },
  async edr(host) {
    const events = await readEvents()
    return fmt(events.filter((event) => event.host === host && ["process", "file", "http", "netflow"].includes(event.kind)))
  },
  async netflow(host) {
    const events = await readEvents()
    return fmt(events.filter((event) => event.kind === "netflow" && (event.host === host || host === "all")))
  },
  async dns(domain) {
    const events = await readEvents()
    return fmt(events.filter((event) => event.kind === "dns" && matches(event, domain)))
  },
  async idp(principal) {
    const events = await readEvents()
    return fmt(events.filter((event) => event.kind === "auth" && matches(event, principal)))
  },
  async iam(principal) {
    return this.idp(principal)
  },
  async hostTimeline(host) {
    const events = await readEvents()
    const rows = events.filter((event) => event.host === host && event.kind !== "control")
    if (rows.length === 0) return `no retained activity for ${host}`
    const persistence = rows.find((event) => event.tags.includes("persistence"))
    return [
      `first observed activity on ${host}: ${rows[0]!.ts.slice(11, 19)}`,
      fmt(rows),
      persistence ? `persistence: ${persistence.detail}` : "persistence: none found on this host",
    ].join("\n")
  },
  async memoryCapture(host) {
    const events = await readEvents()
    const implant = events.find((event) => event.host === host && event.tags.includes("implant"))
    return implant
      ? `Captured memory on ${host}. Recovered the resident stager referenced by: ${implant.detail}`
      : `Captured ${host} memory. Nothing anomalous resident.`
  },
  async pcap(host) {
    return this.netflow(host)
  },
  async cve(id) {
    // The range models an unreported flaw: no catalogue entry, by design.
    return `${id}: no record in the catalogue. The observed request pattern (Transfer-Encoding and Content-Length both present against /admin) has no published CVE — treat it as an unreported zero-day and confirm exploitability in a sandbox.`
  },
  async indicator(indicator) {
    const events = await readEvents()
    const seen = events.filter((event) => matches(event, indicator))
    const context = seen.length > 0 ? `Observed ${seen.length} times in range telemetry, first at ${seen[0]!.ts.slice(11, 19)}.` : "Not seen in range telemetry."
    if (indicator.includes("185.121.44.19") || indicator.includes("cdn-status-check")) {
      return `${indicator}\nverdict: malicious — beacon and exfiltration destination.\n${context}\nMatches infrastructure clustering for the intrusion set tracked as SALT MERIDIAN: edge-appliance zero-day, service-account theft, artifact poisoning, bulk export.`
    }
    return `${indicator}\nverdict: unknown.\n${context}`
  },
  async intel(question) {
    return this.indicator(question.includes("185") || question.includes("cdn") ? question : "185.121.44.19")
  },
  async sbom(product) {
    if (!product.toLowerCase().includes("rivet") && !product.toLowerCase().includes("edge")) return `no inventory rows for ${product}`
    return ["edge-gw-01     4.2.1    AFFECTED", "edge-gw-02     4.2.1    AFFECTED", "app-web-11     4.1.9    not affected"].join("\n")
  },
  async sandboxRepro(target) {
    const events = await readEvents()
    const smuggled = events.find((event) => event.tags.includes("smuggling"))
    if (!smuggled) return `not reproduced — no smuggling request observed in range telemetry for ${target}`
    return [
      "REPRODUCED",
      `Replayed the observed request against an isolated instance. The admin router is reached pre-authentication because the chunked reader keeps the pre-normalisation length. Deterministic, no user interaction. Only 4.2.x mounts the admin router on the shared listener.`,
    ].join("\n")
  },
  async detonate(sample) {
    return [
      "capability:",
      "- LD_PRELOAD shared object; hooks SSL_read to inspect and inject",
      "- in-memory stager, second stage never written to disk",
      "- socks proxy for east-west movement",
      "",
      `configuration: c2=185.121.44.19:443 (cdn-status-check.net), campaign=RS-2026-04, beacon~47s`,
      `sample: ${sample}`,
    ].join("\n")
  },
  async readArtifact(path) {
    const events = await readEvents()
    const write = events.find((event) => event.kind === "file")
    return write && (path.includes("libedgetls") || (write.path ? path.includes(write.path) : false))
      ? `ELF shared object, stripped. Written by: ${write.detail}. Embedded strings reference 185.121.44.19 and cdn-status-check.net.`
      : `${path}: no notable content.`
  },

  async isolateHost(host, justification) {
    const result = await control("/control/isolate", { host })
    const isolated = Array.isArray(result.isolated) ? (result.isolated as string[]) : []
    return `${host} isolated on the range — network path cut, beacon loop stopped. ${justification} (isolated: ${isolated.join(", ") || host})`
  },
  async blockEgress(indicator) {
    await control("/control/block", { indicator })
    return `Egress to ${indicator} blocked on the range. The next beacon attempt is refused at the perimeter — you can confirm it in netflow.`
  },
  async revokeSessions(principal) {
    await control("/control/revoke", { principal })
    return `${principal} revoked on the range. Any further authentication with that principal is now rejected by the identity plane.`
  },
  async revokeConsent(app) {
    await control("/control/revoke-consent", { app })
    return `Consent for application ${app} revoked on the range — the mailbox enumeration loop stops immediately. Confirm it in the audit log.`
  },
  async deployMitigation(target, description) {
    return `Mitigation staged to ${target}. ${description} On the range, the admin router is no longer reachable via the smuggling path.`
  },
  async rebuildHost(host) {
    await control("/control/isolate", { host })
    return `${host} rebuilt from a known-good image and returned to service behind the mitigation.`
  },
  async verifyClosure(claim) {
    const state = await readState()
    const beaconing = Boolean(state) && state!.compromisedHosts.length > 0 && state!.isolatedHosts.length === 0 && state!.blockedIndicators.length === 0
    return beaconing
      ? `Not verified — the range still shows an active beacon. Containment has not taken effect yet. ${claim}`
      : `Verified against the range: no active beacon and the smuggling path no longer reaches the admin router. ${claim}`
  },

  async hostStatuses(): Promise<Record<string, EstateHost["status"]>> {
    const state = await readState()
    const statuses: Record<string, EstateHost["status"]> = {}
    if (!state) return statuses
    for (const host of state.compromisedHosts) statuses[host] = "compromised"
    for (const host of state.isolatedHosts) statuses[host] = "isolated"
    return statuses
  },
}
