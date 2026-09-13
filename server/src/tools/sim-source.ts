import type { TelemetrySource } from "./source.ts"
import {
  CVE_CATALOG,
  detonate,
  dnsQuery,
  edrQuery,
  GROUND_TRUTH,
  idpQuery,
  intelLookup,
  netflowQuery,
  sandboxRepro,
  sbomScan,
  siemQuery,
  type TelemetryRow,
} from "./world.ts"

/* The built-in simulation as a telemetry source.
   This is the authored estate that ships in world.ts, wrapped to the common
   interface so it behaves identically to before — the zero-dependency demo is
   unchanged. The actuators return narrative results; the incident store owns
   host status in sim mode. */

function rows(list: TelemetryRow[]): string {
  if (list.length === 0) return "no rows"
  return list.map((row) => `${row.at}  ${row.host.padEnd(14)} ${row.source.padEnd(8)} ${row.detail}`).join("\n")
}

export const simSource: TelemetrySource = {
  kind: "sim",
  async siem(query) {
    return rows(siemQuery(query))
  },
  async edr(host) {
    return rows(edrQuery(host))
  },
  async netflow(host) {
    return rows(netflowQuery(host))
  },
  async dns(domain) {
    return rows(dnsQuery(domain))
  },
  async idp(principal) {
    return rows(idpQuery(principal))
  },
  async iam(principal) {
    return rows(idpQuery(principal))
  },
  async hostTimeline(host) {
    const evidence = [...edrQuery(host), ...siemQuery(host)].sort((a, b) => a.at.localeCompare(b.at))
    const first = evidence[0]
    return [
      `first observed activity: ${first?.at ?? "none in window"}`,
      rows(evidence),
      host === GROUND_TRUTH.entryHost
        ? `persistence: ${GROUND_TRUTH.implant}\nentry vector: ${GROUND_TRUTH.entryVector}`
        : "persistence: none found on this host",
    ].join("\n")
  },
  async memoryCapture(host) {
    return host === "app-api-21" || host === GROUND_TRUTH.entryHost
      ? `Captured 4.2 GB. Recovered an in-memory stager and a cleartext deploy token for svc-deploy. Sample written to /evidence/${host}/stager.bin`
      : `Captured ${host} memory. Nothing anomalous resident.`
  },
  async pcap(host) {
    return rows(netflowQuery(host))
  },
  async cve(id) {
    const record = CVE_CATALOG[id.toUpperCase()]
    if (!record) return `${id}: no record. If the behaviour is real and no identifier exists, treat it as an unreported zero-day and task vulnerability research.`
    return `${record.id} — ${record.product}\nCVSS ${record.cvss} · ${record.status}\npublished: ${record.published ?? "not published"}\n${record.summary}`
  },
  async indicator(indicator) {
    const verdict = intelLookup(indicator)
    return `${indicator}\nverdict: ${verdict.verdict}\n${verdict.detail}`
  },
  async intel(question) {
    const verdict = intelLookup(question)
    return verdict.verdict === "unknown"
      ? `No direct match. Nearest relevant context: ${intelLookup("185.121.44.19").detail}`
      : verdict.detail
  },
  async sbom(product) {
    const hits = sbomScan(product)
    if (hits.length === 0) return `no inventory rows for ${product}`
    return hits.map((hit) => `${hit.host.padEnd(14)} ${hit.version.padEnd(8)} ${hit.affected ? "AFFECTED" : "not affected"}`).join("\n")
  },
  async sandboxRepro(target) {
    const result = sandboxRepro(target)
    return `${result.reproduced ? "REPRODUCED" : "not reproduced"}\n${result.detail}`
  },
  async detonate(sample) {
    const result = detonate(sample)
    return `capability:\n- ${result.capability.join("\n- ")}\n\nconfiguration:\n${JSON.stringify(result.config, null, 2)}`
  },
  async readArtifact(path) {
    return path.includes("stager") || path.includes("libedgetls")
      ? `ELF shared object, stripped. Exports SSL_read/SSL_write hooks. Embedded strings reference ${GROUND_TRUTH.c2.join(", ")}.`
      : `${path}: no notable content.`
  },
  async isolateHost(host, justification) {
    return `${host} isolated at the switch. Forensic access preserved over the out-of-band path; the host can still be imaged. ${justification}`
  },
  async blockEgress(indicator) {
    return `Egress to ${indicator} blocked at the perimeter and sinkholed in DNS. Existing sessions to it were reset.`
  },
  async revokeSessions(principal) {
    return `${principal}: 3 live sessions killed, refresh tokens invalidated, secret rotated. Downstream services will re-authenticate within 60 seconds.`
  },
  async revokeConsent(app) {
    return `Consent grant for application ${app} revoked and its tokens killed. Mailbox enumeration stops; the two users must re-consent to legitimate apps.`
  },
  async deployMitigation(target, description) {
    return `Mitigation staged to ${target} and verified on a canary before fleet rollout. ${description}`
  },
  async rebuildHost(host) {
    return `${host} rebuilt from the last image predating first touch, mitigation applied before it rejoined the network.`
  },
  async verifyClosure(claim) {
    return `Verified. Re-ran the reproduction against the mitigated build and it no longer reaches the admin router. ${claim}`
  },
}
