import { registerHandler, a2aBroadcast, type HandlerContext, type HandlerResult } from "../a2a/transport.ts"
import { publishCard } from "../a2ui/cards.ts"
import { store, WorldResetError } from "../store.ts"
import * as impl from "../tools/impl.ts"
import type { ToolContext } from "../tools/impl.ts"
import { GROUND_TRUTH } from "../tools/world.ts"
import { agentDef, ROSTER } from "./roster.ts"

/* Deterministic director.
   Esper is meant to be demonstrable on a laptop with no credentials and no
   spend, and to produce the same run twice when someone is comparing a change.
   These handlers drive the same tools, the same A2A transport, and the same
   A2UI surfaces as the live sessions — only the reasoning is pre-decided. */

export const pace = { factor: 1 }

/**
 * Every wait in the director goes through here, so capturing the generation at
 * call time and re-checking it on wake is enough to unwind an entire in-flight
 * response when the operator resets the world.
 */
function sleep(ms: number): Promise<void> {
  const generation = store.generation
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (store.generation === generation) resolve()
      else reject(new WorldResetError())
    }, Math.max(40, ms * pace.factor))
  })
}

function ctx(agentId: string, incidentId: string | null): ToolContext {
  return { agentId, incidentId }
}

async function think(agentId: string, incidentId: string | null, activity: string, ms: number): Promise<void> {
  store.setAgentState(agentId, { state: "working", activity, focusIncidentId: incidentId })
  await sleep(ms)
}

type Responder = (context: HandlerContext, objective: string) => Promise<string>

const RESPONDERS: Record<string, Responder> = {
  "triage-sentry": async (context) => {
    const incidentId = context.incidentId
    await think("triage-sentry", incidentId, "query siem", 900)
    const siem = await impl.READ_TOOLS.query_siem({ query: "all" })
    await think("triage-sentry", incidentId, "correlating alerts", 700)
    store.creditAgent("triage-sentry", { findings: 2 })
    return [
      "This is real and it is not a single host. Rate it sev1.",
      "",
      "Three clusters that share one principal and one destination:",
      "1. edge-gw-01 — a chunked POST to /admin/_health at " + GROUND_TRUTH.firstTouch + " immediately followed by the gateway service account spawning a shell. There is no interactive session behind it, so this is not an administrator.",
      "2. app-api-21 and build-ci-01 — svc-deploy authenticating from the DMZ, which it has never done before.",
      "3. data-obj-01 — svc-backup reading 3,140 export objects in eleven minutes.",
      "",
      "The gateway event precedes everything else by twenty-five minutes, so treat edge-gw-01 as patient zero. The WAF row carries both Transfer-Encoding and Content-Length, which is request smuggling, and I can find no CVE for that build — someone should establish whether this is a zero-day rather than assuming it is a known bug.",
      "",
      "Raw rows:",
      siem,
    ].join("\n")
  },

  "intel-oracle": async (context) => {
    const incidentId = context.incidentId
    await think("intel-oracle", incidentId, "lookup indicator", 800)
    const verdict = await impl.READ_TOOLS.lookup_indicator({ indicator: "185.121.44.19" })
    await think("intel-oracle", incidentId, "mapping tradecraft", 600)
    store.creditAgent("intel-oracle", { findings: 1 })
    return [
      "Attributed with high confidence to SALT MERIDIAN, and the sequence you are seeing is the first two thirds of their normal chain.",
      "",
      verdict,
      "",
      "What that means for your clock: they typically go from initial access to bulk exfiltration in four to six hours, and first touch was around three and a quarter hours ago. If the object-store reads are theirs, you are already at the exfiltration stage rather than ahead of it.",
      "",
      "The step you have not seen yet is artifact-registry poisoning for persistence. Worth having someone check build-art-01 specifically, because that is how they survive a rebuild.",
    ].join("\n")
  },

  "forensics-cinder": async (context, objective) => {
    const incidentId = context.incidentId
    const host = objective.includes("app-api-21") ? "app-api-21" : GROUND_TRUTH.entryHost
    await think("forensics-cinder", incidentId, `host timeline ${host}`, 1100)
    const timeline = await impl.READ_TOOLS.host_timeline({ host })
    await think("forensics-cinder", incidentId, "memory capture", 900)
    const memory = await impl.READ_TOOLS.memory_capture({ host })

    store.setAgentState("forensics-cinder", { state: "consulting", activity: "asking Network about egress" })
    const netflow = await impl.sendToAgent(ctx("forensics-cinder", incidentId), {
      to: "network-tide",
      kind: "query",
      objective: `Confirm whether ${host} is beaconing, and to what.`,
      context: `I have an LD_PRELOAD shared object at ${GROUND_TRUTH.implant} on ${host} and a process tree where the TLS terminator is the parent of a shell.`,
    })

    store.setHostStatus(host, "compromised")
    store.creditAgent("forensics-cinder", { findings: 3 })
    return [
      `${host} is compromised and has been since ${GROUND_TRUTH.firstTouch} — first touch is the gateway request itself, not anything later.`,
      "",
      `Entry vector: ${GROUND_TRUTH.entryVector}.`,
      `Persistence: ${GROUND_TRUTH.implant}, loaded through /etc/environment. It survives a service restart but not a rebuild.`,
      "",
      "Timeline:",
      timeline,
      "",
      `Memory: ${memory}`,
      "",
      "Network confirms the egress side:",
      netflow.split("\n").slice(0, 4).join("\n"),
      "",
      "Unresolved: I cannot tell from the host alone whether the second stage was ever written to build-art-01. That needs registry audit, not disk forensics.",
    ].join("\n")
  },

  "network-tide": async (context, objective) => {
    const incidentId = context.incidentId
    await think("network-tide", incidentId, "query netflow", 800)
    const gw = await impl.READ_TOOLS.query_netflow({ host: "edge-gw-01" })
    const obj = await impl.READ_TOOLS.query_netflow({ host: "data-obj-01" })
    await think("network-tide", incidentId, "query dns", 500)
    const dns = await impl.READ_TOOLS.query_dns({ domain: "cdn-status-check.net" })
    store.creditAgent("network-tide", { findings: 2 })

    if (objective.toLowerCase().includes("beacon")) {
      return [
        "Yes — edge-gw-01 is beaconing to 185.121.44.19:443 on a 47-second cadence with about 6% jitter, 4,102 flows so far.",
        gw,
        "",
        "It resolves through cdn-status-check.net, registered nine days ago:",
        dns,
      ].join("\n")
    }

    return [
      "Data has already left. 1.84 GB egressed from data-obj-01 to 185.121.44.19 in a single TLS session over eleven minutes, ending about an hour and a half ago.",
      "",
      obj,
      "",
      "The path in was east-west, not direct: edge-gw-01 → app-api-21 → build-ci-01, all over SSH, all new for those hosts.",
      gw,
      "",
      "Blocking 185.121.44.19 and sinkholing cdn-status-check.net will kill the channel, but understand that it is a containment action after the fact for the data already gone — it protects what has not left yet.",
    ].join("\n")
  },

  "identity-keystone": async (context) => {
    const incidentId = context.incidentId
    await think("identity-keystone", incidentId, "query idp", 700)
    const deploy = await impl.READ_TOOLS.query_idp({ principal: "svc-deploy" })
    const backup = await impl.READ_TOOLS.query_idp({ principal: "svc-backup" })
    await think("identity-keystone", incidentId, "mapping effective privilege", 600)
    store.creditAgent("identity-keystone", { findings: 2 })
    return [
      "svc-deploy is stolen and still live. Three unexpired sessions, token expires in forty-one minutes, and it was minted from edge-gw-01 which has never authenticated from the DMZ before.",
      "",
      deploy,
      "",
      "It then chained into svc-backup, which is permitted by policy and has never been used that way:",
      backup,
      "",
      "Effective privilege of the pair: deploy to production, read every data store, publish to the artifact registry. That is the whole estate. Revoking svc-deploy alone leaves svc-backup usable, so both have to go together or you are only closing one door.",
      "",
      "Note for whoever owns the control plane: the role chain that allowed this is a standing configuration problem, not an incident artefact.",
    ].join("\n")
  },

  "vuln-lathe": async (context) => {
    const incidentId = context.incidentId
    await think("vuln-lathe", incidentId, "lookup cve", 600)
    const cve = await impl.READ_TOOLS.lookup_cve({ id: "CVE-2026-31847" })
    await think("vuln-lathe", incidentId, "sandbox repro", 1600)
    const repro = await impl.READ_TOOLS.sandbox_repro({ target: "Rivet Edge 4.2.1 chunked reader" })
    await think("vuln-lathe", incidentId, "sbom scan", 700)
    const scan = await impl.READ_TOOLS.sbom_scan({ product: "Rivet Edge" })

    store.setAgentState("vuln-lathe", { state: "consulting", activity: "handing signature to Detect" })
    await impl.sendToAgent(ctx("vuln-lathe", incidentId), {
      to: "detect-loom",
      kind: "task",
      objective: "Turn the vulnerable path into a deployed detection rule.",
      context:
        `${GROUND_TRUTH.vulnerablePath}. The observable is a request carrying both Transfer-Encoding: chunked and Content-Length where the chunked body decodes to a second request line targeting /admin/. That is not something a legitimate client produces.`,
    })
    store.creditAgent("vuln-lathe", { findings: 2 })

    return [
      "Confirmed zero-day. It is real, it is pre-authentication, and there is no vendor advisory — the identifier is reserved and unpublished.",
      "",
      cve,
      "",
      repro,
      "",
      "Exposure across the estate:",
      scan,
      "",
      "Only 4.2.x is reachable, so this is two hosts, not four. There is no patch to apply, so remediation has to be a configuration mitigation: unmount the admin router from the shared listener. I have handed the signature to Detect directly so detection does not wait on this report.",
    ].join("\n")
  },

  "malware-splice": async (context) => {
    const incidentId = context.incidentId
    await think("malware-splice", incidentId, "sandbox detonate", 1500)
    const detonation = await impl.READ_TOOLS.sandbox_detonate({ sample: GROUND_TRUTH.implant })
    store.creditAgent("malware-splice", { findings: 1 })
    return [
      "The implant is a credential-stealing TLS interception shim with a socks proxy bolted on — it is built to move, not just to persist.",
      "",
      detonation,
      "",
      "Two things worth acting on: the campaign identifier RS-2026-04 ties this to the same cluster Intel named, and the kill switch means the implant deactivates itself if /etc/.rv-lock exists. That is a cheap estate-wide inoculation while the real mitigation rolls.",
    ].join("\n")
  },

  "hunt-drift": async (context) => {
    const incidentId = context.incidentId
    await think("hunt-drift", incidentId, "sweeping estate", 1400)
    const sweep = await impl.READ_TOOLS.query_siem({ query: "all" })
    await think("hunt-drift", incidentId, "establishing dwell", 800)
    store.creditAgent("hunt-drift", { findings: 2 })
    return [
      "Four hosts touched, no more — but the fourth one matters more than the other three.",
      "",
      "edge-gw-01 (entry), app-api-21 (pivot), build-ci-01 (pivot), build-art-01 (artifact publish outside the pipeline at " +
        "the 132-minute mark). The registry write is the one that survives everything you are about to do: internal/agent-runtime@2.9.4-rc " +
        "was published by svc-deploy from an address outside the runner CIDR.",
      "",
      "Anything that pulls that artifact re-infects itself after rebuild. That has to be quarantined before recovery starts, not after.",
      "",
      "I swept edge-gw-02 with the same behavioural query and it is clean, despite running the same vulnerable build. It was exposed, not used.",
      "",
      "Evidence:",
      sweep,
    ].join("\n")
  },

  "detect-loom": async (context) => {
    const incidentId = context.incidentId
    await think("detect-loom", incidentId, "author rule", 1000)
    const authored = impl.authorRule(
      ctx("detect-loom", incidentId),
      "RIVET-SMUGGLE-ADMIN",
      "http.request has both Transfer-Encoding:chunked and Content-Length AND decoded chunk body matches /^[A-Z]+ \\/admin\\//",
    )
    await think("detect-loom", incidentId, "deploy rule", 700)
    const deployed = impl.deployRule(ctx("detect-loom", incidentId), "RIVET-SMUGGLE-ADMIN")
    store.creditAgent("detect-loom", { findings: 1 })
    return [
      "RIVET-SMUGGLE-ADMIN is live across the estate with no false positives in a thirty-day backtest.",
      "",
      authored,
      "",
      deployed,
      "",
      "I also shipped a second, looser rule on the beacon cadence — 47-second periodicity with sub-10% jitter to a destination first seen in the last fourteen days. It carries a real false-positive cost, so it alerts to review rather than to page.",
    ].join("\n")
  },

  "contain-bulwark": async (context, objective) => {
    const incidentId = context.incidentId
    const authorised = /authoris|authoriz|approved|proceed|execute/i.test(objective)
    if (!authorised) {
      await think("contain-bulwark", incidentId, "computing blast radius", 800)
      const request = impl.requestAuthorisation(
        ctx("contain-bulwark", incidentId),
        "Isolate edge-gw-01 and edge-gw-02, block 185.121.44.19 and cdn-status-check.net, revoke svc-deploy and svc-backup",
        "Both ingress gateways carry live customer traffic. Isolating both drops the public estate for roughly 90 seconds while traffic fails over to the secondary region. Revoking svc-deploy stops all deployments; revoking svc-backup stops tonight's backup window.",
      )
      store.setAgentState("contain-bulwark", { state: "blocked", activity: "awaiting authorisation" })
      return [
        "Ready to execute, holding for your authorisation. The blast radius is not free and you should see it before I move.",
        "",
        request,
        "",
        "One sequencing point: revoke the credentials before isolating the gateways. If I isolate first, the adversary loses the beacon but keeps a valid token, and their next move is from somewhere I am not watching.",
      ].join("\n")
    }

    if (/consent|9f31c0/i.test(objective)) {
      await think("contain-bulwark", incidentId, "revoking consent grant", 600)
      const revoked = await impl.revokeConsent(ctx("contain-bulwark", incidentId), "9f31c0")
      store.creditAgent("contain-bulwark", { findings: 1 })
      return ["Consent grant revoked on the range; the enumeration loop is cut.", "", revoked].join("\n")
    }

    if (/ransom|encrypt|corp-fs-03/i.test(objective)) {
      await think("contain-bulwark", incidentId, "isolating the file share", 700)
      const isolated = await impl.isolateHost(ctx("contain-bulwark", incidentId), "corp-fs-03", "Active mass-encryption in progress.")
      store.creditAgent("contain-bulwark", { findings: 1 })
      return ["Isolated corp-fs-03 — the encryption loop is cut. Snapshots preserved for recovery.", "", isolated].join("\n")
    }

    if (/brute|spray|203\.0\.113|takeover/i.test(objective)) {
      await think("contain-bulwark", incidentId, "blocking the source and resetting the account", 700)
      const blocked = await impl.blockEgress(ctx("contain-bulwark", incidentId), "203.0.113.44")
      const revoked = await impl.revokeSessions(ctx("contain-bulwark", incidentId), "r.almeida")
      store.creditAgent("contain-bulwark", { findings: 1 })
      return ["Blocked 203.0.113.44 and reset r.almeida — the credential-stuffing attempts are refused now.", "", blocked, revoked].join("\n")
    }
    await think("contain-bulwark", incidentId, "revoking sessions", 700)
    const revokeDeploy = await impl.revokeSessions(ctx("contain-bulwark", incidentId), "svc-deploy")
    const revokeBackup = await impl.revokeSessions(ctx("contain-bulwark", incidentId), "svc-backup")
    await think("contain-bulwark", incidentId, "blocking egress", 600)
    const blockIp = await impl.blockEgress(ctx("contain-bulwark", incidentId), "185.121.44.19")
    const blockDomain = await impl.blockEgress(ctx("contain-bulwark", incidentId), "cdn-status-check.net")
    await think("contain-bulwark", incidentId, "isolating hosts", 900)
    const isolateOne = await impl.isolateHost(ctx("contain-bulwark", incidentId), "edge-gw-01", "Confirmed implant and active C2.")
    const isolateTwo = await impl.isolateHost(ctx("contain-bulwark", incidentId), "edge-gw-02", "Same vulnerable build, exposed but unused.")
    store.creditAgent("contain-bulwark", { findings: 1 })

    a2aBroadcast({
      from: "contain-bulwark",
      incidentId,
      summary: "Containment executed — credentials revoked, C2 blocked, gateways isolated",
      text: "Containment complete in the order agreed. Anything still holding a svc-deploy token will fail within 60 seconds.",
    })

    return [
      "Contained, in the order I proposed. Credentials first, then the channel, then the hosts.",
      "",
      revokeDeploy,
      revokeBackup,
      blockIp,
      blockDomain,
      isolateOne,
      isolateTwo,
      "",
      "Public traffic failed over cleanly; the outage window was 71 seconds. Both gateways remain reachable out of band for imaging.",
    ].join("\n")
  },

  "remediate-forge": async (context) => {
    const incidentId = context.incidentId
    await think("remediate-forge", incidentId, "deploy mitigation", 1200)
    const mitigation = await impl.deployMitigation(
      ctx("remediate-forge", incidentId),
      "all Rivet Edge 4.2.x",
      "Unmount the admin router from the shared listener and reject any request presenting both Transfer-Encoding and Content-Length at the terminator.",
    )
    await think("remediate-forge", incidentId, "rebuild hosts", 1400)
    const rebuildOne = await impl.rebuildHost(ctx("remediate-forge", incidentId), "edge-gw-01")
    const rebuildTwo = await impl.rebuildHost(ctx("remediate-forge", incidentId), "edge-gw-02")
    await think("remediate-forge", incidentId, "verify closure", 800)
    const verified = await impl.verifyClosure(
      ctx("remediate-forge", incidentId),
      "The reproduction no longer reaches the admin router on the mitigated build.",
    )
    store.creditAgent("remediate-forge", { findings: 1 })
    return [
      "Door shut and proven shut. There is no patch, so this is a configuration mitigation, and I re-ran Vuln's reproduction against it rather than assuming.",
      "",
      mitigation,
      rebuildOne,
      rebuildTwo,
      "",
      verified,
      "",
      "Sequencing note that matters: I quarantined internal/agent-runtime@2.9.4-rc in the registry before rebuilding anything. Rebuilding first would have pulled the poisoned artifact straight back down, which is exactly the outcome Hunt warned about.",
    ].join("\n")
  },

  "comms-herald": async (context) => {
    const incidentId = context.incidentId
    const incident = incidentId ? store.incidents.get(incidentId) : null
    await think("comms-herald", incidentId, "draft brief", 900)
    const brief = impl.draftBrief(
      ctx("comms-herald", incidentId),
      "executive",
      "An unpatched flaw in our ingress gateway was exploited roughly three hours ago. The intruder took a deployment credential and used it to read customer export files; approximately 1.84 GB left the estate. We have revoked the credentials, cut the channel, and taken the gateways out of service behind a mitigation. Customer-facing systems stayed up apart from a 71-second failover. The vendor has no fix, so we are running our own mitigation and have told them what we found. The decision in front of you is customer notification timing, not whether to notify.",
    )
    store.creditAgent("comms-herald", { findings: 1 })
    return [
      "Brief is ready and deliberately separates what we know from what we think.",
      "",
      brief,
      "",
      `Confirmed: exploitation, credential theft, 1.84 GB egress from the export store, containment complete${incident ? ` on ${incident.code}` : ""}.`,
      "Not confirmed: whether the exported objects contained personal data at the record level. I have not written a single customer-facing word that assumes either answer, and I would not publish until Legal has scoped it.",
    ].join("\n")
  },

  "legal-canon": async (context) => {
    const incidentId = context.incidentId
    await think("legal-canon", incidentId, "assess obligations", 900)
    const assessment = impl.assessObligations(ctx("legal-canon", incidentId), "customer export objects, possible personal data")
    store.creditAgent("legal-canon", { findings: 1 })
    return [
      "Assume the clock is running, and note it started earlier than people will expect.",
      "",
      assessment,
      "",
      "The point of disagreement to settle now: awareness dates from Network's confirmed exfiltration finding, not from the original gateway alert and not from whenever we finish the investigation. Preserve the gateway disks and the object-store audit records before Remediate rebuilds anything — a rebuild that destroys evidence is a second, avoidable problem.",
    ].join("\n")
  },

  "scribe-ledger": async (context) => {
    const incidentId = context.incidentId
    await think("scribe-ledger", incidentId, "publish surface", 500)
    return "Record updated and the operator surface refreshed."
  },
}

function fallbackResponder(agentId: string): Responder {
  return async (context, objective) => {
    await think(agentId, context.incidentId, "working", 700)
    return `${agentDef(agentId).callsign}: acknowledged — "${objective}". Nothing in my instruments changes the current picture.`
  }
}

function replayHandler(agentId: string) {
  return async (context: HandlerContext): Promise<HandlerResult> => {
    const requester = context.fromAgentId ? agentDef(context.fromAgentId).callsign : "the operator"
    const objective = typeof context.data.objective === "string" ? context.data.objective : context.text

    store.setAgentState(agentId, {
      state: "briefing",
      activity: `Briefed by ${requester}`,
      focusIncidentId: context.incidentId,
    })
    if (context.incidentId) {
      store.enrollAgent(agentId, context.incidentId)
      store.setAssignmentState(context.incidentId, agentId, "working")
    }
    await sleep(300)

    const responder = RESPONDERS[agentId] ?? fallbackResponder(agentId)
    const text = await responder(context, objective)

    store.setAgentState(agentId, { state: "reporting", activity: `Reporting to ${requester}` })
    await sleep(200)
    if (context.incidentId) store.setAssignmentState(context.incidentId, agentId, "reporting")
    store.setAgentState(agentId, { state: "standby", activity: `Reported to ${requester}` })
    return { text }
  }
}

export function registerReplayHandlers(): void {
  for (const def of ROSTER) registerHandler(def.id, replayHandler(def.id))
  store.mode = "replay"
}

/* ---- the commander's own scripted plan --------------------------------- */

export async function replayCommand(incidentId: string, commanderId: string): Promise<void> {
  const incident = store.incidents.get(incidentId)
  if (!incident) return
  if (incident.scenarioId === "identity-front") return replayIdentityCommand(incident.id, commanderId)
  const c = ctx(commanderId, incidentId)
  const call = agentDef(commanderId).callsign

  const card = (spec: Parameters<typeof impl.publishOperatorCard>[1]) => impl.publishOperatorCard(c, spec)

  store.setAgentState(commanderId, { state: "working", activity: "Scoping the incident", focusIncidentId: incidentId })
  card({
    surface: "incident",
    cardId: "command-post",
    title: `${call} has command`,
    kicker: "Command post",
    tone: "critical",
    weight: 100,
    blocks: [
      { type: "text", text: `${incident.summary}`, variant: "lead" },
      {
        type: "keyvalue",
        rows: [
          { label: "Commander", value: agentDef(commanderId).name },
          { label: "Phase", value: "triage" },
          { label: "Confirmed", value: "nothing yet — three unexplained alert clusters", tone: "warning" },
        ],
      },
      { type: "text", text: "Opening question is whether these clusters are one intrusion or three coincidences. Tasking triage, intelligence and forensics in parallel so the answer arrives at once rather than in sequence." },
    ],
  })
  impl.record(c, "Assumed command. Tasking triage, intelligence and host forensics in parallel.", "info")
  await sleep(600)

  // Wave one — parallel, because these are independent questions.
  const [triage, intel, forensics] = await Promise.all([
    impl.sendToAgent(c, {
      to: "triage-sentry",
      objective: "Are these alert clusters one intrusion or several, and how bad is it?",
      context: "Three clusters in the last 3.5 hours: a gateway request anomaly, service-account authentication from the DMZ, and bulk object-store reads.",
    }),
    impl.sendToAgent(c, {
      to: "intel-oracle",
      objective: "Tell me who this is and what they do next.",
      context: "Indicators so far: 185.121.44.19 and cdn-status-check.net, seen from edge-gw-01.",
    }),
    impl.sendToAgent(c, {
      to: "forensics-cinder",
      objective: "Take edge-gw-01 apart. I need first touch, entry vector and persistence.",
      context: "WAF logged a chunked POST to /admin/_health followed by the gateway service account spawning a shell.",
    }),
  ])

  store.setAgentState(commanderId, { state: "working", activity: "Reading three reports" })
  await sleep(700)
  impl.setPhase(c, "investigate", 62, 28)
  impl.record(c, "One intrusion, not three. Patient zero is edge-gw-01 and the vector has no CVE — treating it as a zero-day until proven otherwise.", "warning")

  card({
    surface: "incident",
    cardId: "command-post",
    title: `${call} has command`,
    kicker: "Command post",
    tone: "critical",
    weight: 100,
    blocks: [
      { type: "text", text: "One intrusion, four hosts, and the clock is worse than the alert timestamps suggest.", variant: "lead" },
      {
        type: "keyvalue",
        rows: [
          { label: "Patient zero", value: "edge-gw-01 — pre-auth request smuggling, no matching CVE", tone: "critical" },
          { label: "First touch", value: `${GROUND_TRUTH.firstTouch} (≈3h15m ago)`, tone: "warning" },
          { label: "Actor", value: "SALT MERIDIAN — access to exfiltration in 4–6h", tone: "warning" },
          { label: "Phase", value: "investigate" },
        ],
      },
      { type: "text", text: "Changing the plan on Intel's timing: if their normal chain holds we are at the exfiltration stage, not ahead of it. Pulling vulnerability research, identity and network forward now rather than after forensics completes." },
      { type: "progress", label: "Response plan", value: 28, tone: "warning" },
    ],
  })

  card({
    surface: "mission-control",
    cardId: "zero-day-alert",
    title: "Suspected zero-day in the ingress gateway",
    kicker: `${call} · ${incident.code}`,
    tone: "critical",
    weight: 90,
    blocks: [
      { type: "text", text: "Pre-authentication request smuggling on Rivet Edge 4.2.1 with no vendor advisory. Two gateways exposed; one confirmed compromised.", variant: "lead" },
      { type: "badges", badges: [{ text: "sev1", tone: "critical" }, { text: "zero-day", tone: "critical" }, { text: "active C2", tone: "warning" }] },
    ],
  })
  await sleep(500)

  // Wave two — now that the shape is known, four independent lines at once.
  const [vuln, identity, network, hunt] = await Promise.all([
    impl.sendToAgent(c, {
      to: "vuln-lathe",
      objective: "Is this a real zero-day, is it reachable, and how much of the estate is exposed?",
      context: `Vector is a chunked POST to /admin/_health on Rivet Edge 4.2.1 that reaches the admin router pre-authentication. Forensics found ${GROUND_TRUTH.implant} on the host.`,
    }),
    impl.sendToAgent(c, {
      to: "identity-keystone",
      objective: "What did they take on the identity plane and what is still live?",
      context: "svc-deploy authenticated from edge-gw-01, which is in the DMZ and has never been a source for it.",
    }),
    impl.sendToAgent(c, {
      to: "network-tide",
      objective: "Did data leave, how much, and where did they move?",
      context: "data-obj-01 shows svc-backup reading 3,140 export objects in eleven minutes.",
    }),
    impl.sendToAgent(c, {
      to: "hunt-drift",
      objective: "Where else has this already happened? Sweep the estate for the same behaviour.",
      context: "Known technique: service-account reuse from an unexpected source, plus a 47-second beacon to 185.121.44.19.",
    }),
  ])

  store.setAgentState(commanderId, { state: "working", activity: "Weighing the containment decision" })
  await sleep(600)
  impl.setPhase(c, "contain", 84, 52)

  // Containment: ask, see the blast radius, then decide out loud.
  const proposal = await impl.sendToAgent(c, {
    to: "contain-bulwark",
    objective: "Propose containment for this incident and give me the blast radius before you touch anything.",
    context: "Confirmed: implant and live C2 on edge-gw-01, edge-gw-02 same build, svc-deploy and svc-backup both compromised and live, 1.84 GB already exfiltrated.",
  })

  card({
    surface: "incident",
    cardId: "containment-decision",
    title: "Containment decision",
    kicker: `${call} · authorisation`,
    tone: "warning",
    weight: 95,
    blocks: [
      { type: "text", text: "Contain will not act without me, and it is right not to. Here is the trade I am making.", variant: "lead" },
      {
        type: "keyvalue",
        rows: [
          { label: "Cost of acting", value: "≈90s public outage during gateway failover; deployments and tonight's backup window stop", tone: "warning" },
          { label: "Cost of waiting", value: "Adversary keeps a valid token with read access to every data store", tone: "critical" },
          { label: "Sequencing", value: "Credentials first, then the channel, then the hosts", tone: "info" },
        ],
      },
      { type: "text", text: "Authorising. A 90-second failover is recoverable and a live production credential in an adversary's hands is not. Contain's sequencing point stands — isolating first would blind us while leaving the token valid." },
      {
        type: "actions",
        actions: [
          { label: "Acknowledge", actionId: "ack-containment", tone: "positive" },
          { label: "Hold containment", actionId: "hold-containment", tone: "critical" },
        ],
      },
    ],
  })
  impl.record(c, "Authorised containment. Accepting a ~90s outage rather than leaving a live production credential compromised.", "warning")
  await sleep(900)

  const contained = await impl.sendToAgent(c, {
    to: "contain-bulwark",
    objective: "Authorised — execute containment in the sequence you proposed.",
    context: proposal.slice(0, 400),
  })

  impl.setPhase(c, "eradicate", 90, 74)
  await sleep(400)

  const [remediation, brief, legal] = await Promise.all([
    impl.sendToAgent(c, {
      to: "remediate-forge",
      objective: "There is no patch. Get a mitigation onto every 4.2.x gateway, then rebuild the two compromised hosts safely.",
      context: "Hunt found a poisoned artifact — internal/agent-runtime@2.9.4-rc, published outside the pipeline. Quarantine it before any rebuild.",
    }),
    impl.sendToAgent(c, {
      to: "comms-herald",
      objective: "Write the executive brief. Separate what is confirmed from what is assumed.",
      context: "Confirmed: exploitation, credential theft, 1.84 GB exfiltrated from the export store, containment complete. Not confirmed: whether those objects contain personal data.",
    }),
    impl.sendToAgent(c, {
      to: "legal-canon",
      objective: "When does the notification clock start, and what must be preserved before Remediate rebuilds?",
      context: "Customer export objects were read and 1.84 GB left the estate.",
    }),
  ])

  impl.setPhase(c, "recover", 94, 92)
  await sleep(500)

  card({
    surface: "incident",
    cardId: "command-post",
    title: `${call} has command`,
    kicker: "Command post",
    tone: "positive",
    weight: 100,
    blocks: [
      { type: "text", text: "Contained and eradicated. The remaining work is disclosure, not defence.", variant: "lead" },
      {
        type: "keyvalue",
        rows: [
          { label: "Contained", value: "Credentials revoked, C2 blocked, both gateways isolated and rebuilt", tone: "positive" },
          { label: "Closure", value: "Reproduction re-run against the mitigated build and no longer reaches the admin router", tone: "positive" },
          { label: "Residual", value: "1.84 GB already exfiltrated — cannot be undone", tone: "critical" },
          { label: "Regulatory", value: "72h clock started at the confirmed exfiltration finding, not the first alert", tone: "warning" },
        ],
      },
      { type: "list", items: [
        "The role chain that let svc-deploy assume svc-backup is a standing configuration problem, not an incident artefact.",
        "internal/agent-runtime@2.9.4-rc is quarantined; anything that already pulled it needs checking.",
        "Vendor has no advisory. Our mitigation is the only control until they ship one.",
      ], tone: "warning" },
      { type: "progress", label: "Response plan", value: 100, tone: "positive" },
    ],
  })

  card({
    surface: "mission-control",
    cardId: "zero-day-alert",
    title: "Zero-day contained",
    kicker: `${call} · ${incident.code}`,
    tone: "positive",
    weight: 90,
    blocks: [
      { type: "text", text: "Ingress gateway zero-day contained and mitigated. 1.84 GB was exfiltrated before containment; disclosure is now the open item.", variant: "lead" },
      { type: "metrics", metrics: [
        { label: "Time to contain", value: elapsed(incident.openedAt), tone: "positive" },
        { label: "Hosts touched", value: "4", tone: "warning" },
        { label: "Data lost", value: "1.84 GB", tone: "critical" },
      ] },
    ],
  })

  impl.record(c, "Closure verified by re-testing, not by absence of alerts. Standing down the team.", "positive")
  impl.setStatus(c, "resolved")
  impl.setPhase(c, "review", 97, 100)

  a2aBroadcast({
    from: commanderId,
    incidentId,
    summary: "Stand down — incident resolved, closure verified",
    text: `${incident.code} resolved. Thank you. Preserve your working notes; Campaign wants a campaign write-up.`,
  })

  for (const assignment of incident.assignments) store.releaseAgent(assignment.agentId, incidentId)
  store.releaseAgent(commanderId, incidentId)
  store.setAgentState(commanderId, { state: "standby", activity: "Stood down" })

  void triage
  void intel
  void forensics
  void vuln
  void identity
  void network
  void hunt
  void contained
  void remediation
  void brief
  void legal
}

function elapsed(from: string): string {
  const seconds = Math.max(1, Math.round((Date.now() - Date.parse(from)) / 1000))
  if (seconds < 90) return `${seconds}s`
  return `${Math.round(seconds / 60)}m`
}

/**
 * The second front. Shorter, and deliberately shaped differently: ID Cmdr
 * cannot contain its own incident without Commander, because the adversary's way
 * back in is on the other commander's side of the estate.
 */
async function replayIdentityCommand(incidentId: string, commanderId: string): Promise<void> {
  const incident = store.incidents.get(incidentId)
  if (!incident) return
  const c = ctx(commanderId, incidentId)
  const call = agentDef(commanderId).callsign
  const card = (spec: Parameters<typeof impl.publishOperatorCard>[1]) => impl.publishOperatorCard(c, spec)

  store.setAgentState(commanderId, { state: "working", activity: "Scoping the tenant front", focusIncidentId: incidentId })
  card({
    surface: "incident",
    cardId: "command-post",
    title: `${call} has command`,
    kicker: "Command post",
    tone: "warning",
    weight: 100,
    blocks: [
      { type: "text", text: incident.summary, variant: "lead" },
      {
        type: "keyvalue",
        rows: [
          { label: "Commander", value: agentDef(commanderId).name },
          { label: "Phase", value: "triage" },
          { label: "Working theory", value: "consent-grant phishing, not credential theft", tone: "info" },
        ],
      },
      { type: "text", text: "Two consents four minutes apart is a campaign, not a mistake. Taking identity and intelligence first; I do not need forensics until I know whether anything left the tenant." },
    ],
  })
  impl.record(c, "Assumed command of the tenant front. Identity and intelligence first.", "info")
  await sleep(500)

  const [identity, intel] = await Promise.all([
    impl.sendToAgent(c, {
      to: "identity-keystone",
      objective: "What can application 9f31c0 actually reach, and is the grant still live?",
      context: "Two finance users granted mail.read to an unverified publisher within four minutes.",
    }),
    impl.sendToAgent(c, {
      to: "intel-oracle",
      objective: "Does this application resolve to anything we already know?",
      context: "Consent-grant application 9f31c0, callback resolves through cdn-status-check.net.",
    }),
  ])

  impl.setPhase(c, "investigate", 70, 40)
  impl.record(c, "The callback resolves through cdn-status-check.net — the same infrastructure as the gateway incident. This is not a separate adversary.", "warning")
  await sleep(600)

  card({
    surface: "incident",
    cardId: "command-post",
    title: `${call} has command`,
    kicker: "Command post",
    tone: "critical",
    weight: 100,
    blocks: [
      { type: "text", text: "This is not an isolated phishing campaign. The callback shares infrastructure with the gateway intrusion.", variant: "lead" },
      {
        type: "keyvalue",
        rows: [
          { label: "Grant", value: "Application 9f31c0 — mail.read, two finance principals, still live", tone: "critical" },
          { label: "Shared", value: "cdn-status-check.net — also seen from edge-gw-01", tone: "critical" },
          { label: "Constraint", value: "Revoking here does not close the gateway path; that is Commander's front", tone: "warning" },
        ],
      },
      { type: "text", text: "Raising this with Commander rather than containing in isolation. Closing my half while their half stays open just moves the adversary." },
    ],
  })

  await sleep(500)
  const containment = await impl.sendToAgent(c, {
    to: "contain-bulwark",
    objective: "Revoke the consent grant for application 9f31c0 and kill its tokens.",
    context: "Authorised — two finance principals, mail.read only, no production impact. Blast radius is limited to the two users re-consenting to legitimate applications.",
  })

  impl.setPhase(c, "contain", 86, 72)
  await sleep(500)

  const brief = await impl.sendToAgent(c, {
    to: "comms-herald",
    objective: "Tell the two affected users what happened and what they must not do next.",
    context: "Their consent was harvested by an unverified application impersonating an internal tool. Mailbox contents were enumerated; we do not yet know what was read.",
  })

  impl.setPhase(c, "recover", 90, 96)
  card({
    surface: "incident",
    cardId: "command-post",
    title: `${call} has command`,
    kicker: "Command post",
    tone: "positive",
    weight: 100,
    blocks: [
      { type: "text", text: "Grant revoked and tokens killed. Holding the incident open until Commander closes the gateway front.", variant: "lead" },
      {
        type: "keyvalue",
        rows: [
          { label: "Contained", value: "Consent revoked, tokens invalidated, publisher blocked tenant-wide", tone: "positive" },
          { label: "Open", value: "214 mailboxes enumerated — content access unquantified", tone: "warning" },
          { label: "Dependency", value: "Do not close before PLX-1041; Campaign holds the campaign view", tone: "info" },
        ],
      },
      { type: "progress", label: "Response plan", value: 96, tone: "positive" },
    ],
  })
  impl.record(c, "Contained on this front. Deliberately not resolving until the gateway front closes — the adversary keeps a route otherwise.", "warning")
  impl.setStatus(c, "contained")

  for (const assignment of incident.assignments) store.releaseAgent(assignment.agentId, incidentId)
  store.setAgentState(commanderId, { state: "standby", activity: "Holding the tenant front" })

  void identity
  void intel
  void containment
  void brief
}

/* ---- the range response -------------------------------------------------
   A response written for the live range rather than a fixture. It reads the
   real detections, tasks specialists that read the real telemetry, then
   actually contains the range and waits on the real state until the beacon
   stops — resolution is gated on the beacon actually being dead, not on a
   timer. This is the observe → decide → act → verify loop against real data. */

function rangeSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function replayRangeCommand(incidentId: string, commanderId: string): Promise<void> {
  const incident = store.incidents.get(incidentId)
  if (!incident) return
  const c = ctx(commanderId, incidentId)
  const call = agentDef(commanderId).callsign
  const card = (spec: Parameters<typeof impl.publishOperatorCard>[1]) => impl.publishOperatorCard(c, spec)
  const beacons = () => store.rangeStatus?.beaconCount ?? 0
  const exfilMb = () => ((store.rangeStatus?.exfilBytes ?? 0) / 1e6).toFixed(2)

  store.setAgentState(commanderId, { state: "working", activity: "Scoping the live intrusion", focusIncidentId: incidentId })
  card({
    surface: "incident",
    cardId: "command-post",
    title: `${call} has command`,
    kicker: "Command post · live range",
    tone: "critical",
    weight: 100,
    blocks: [
      { type: "text", text: "This is a real attack running against an isolated estate on this host. Everything below is the attack's own telemetry.", variant: "lead" },
      { type: "metrics", metrics: [
        { label: "Beacons observed", value: String(beacons()), tone: "critical" },
        { label: "Exfiltrated", value: `${exfilMb()} MB`, tone: "warning" },
        { label: "Phase", value: "triage" },
      ] },
      { type: "text", text: "The gateway is actively beaconing to the C2 as I work. I am tasking triage, forensics, network and vulnerability research in parallel, then containing on my authority — dwell time is the cost." },
    ],
  })
  impl.record(c, "Assumed command of the live-range intrusion. Tasking specialists against the real telemetry.", "info")
  await rangeSleep(500)

  impl.setPhase(c, "investigate", 55, 30)
  const [triage, forensics, network, vuln] = await Promise.all([
    impl.sendToAgent(c, { to: "triage-sentry", objective: "Confirm scope and severity from the live SIEM.", context: "A real intrusion is in progress against edge-gw-01." }),
    impl.sendToAgent(c, { to: "forensics-cinder", objective: "Reconstruct edge-gw-01: first touch, entry vector, persistence.", context: "The gateway service account spawned a shell and dropped a preload implant." }),
    impl.sendToAgent(c, { to: "network-tide", objective: "Confirm the beacon and measure exfiltration from the live netflow.", context: "Periodic egress to 185.121.44.19 was detected." }),
    impl.sendToAgent(c, { to: "vuln-lathe", objective: "Is this a real zero-day and how exposed are we?", context: "The request pattern has no matching CVE." }),
  ])

  card({
    surface: "mission-control",
    cardId: "zero-day-alert",
    title: "Live zero-day on the ingress gateway",
    kicker: `${call} · ${incident.code}`,
    tone: "critical",
    weight: 90,
    blocks: [
      { type: "text", text: "A real attack is exploiting a pre-authentication request-smuggling flaw on edge-gw-01 and beaconing to a C2. Responders are reading the live telemetry now.", variant: "lead" },
      { type: "badges", badges: [{ text: "sev1", tone: "critical" }, { text: "live range", tone: "critical" }, { text: "active beacon", tone: "warning" }] },
    ],
  })

  impl.setPhase(c, "contain", 82, 55)
  card({
    surface: "incident",
    cardId: "containment-decision",
    title: "Containment decision",
    kicker: `${call} · authorisation`,
    tone: "warning",
    weight: 95,
    blocks: [
      { type: "text", text: `The beacon is live (${beacons()} check-ins and counting). I am authorising containment now rather than waiting.`, variant: "lead" },
      { type: "keyvalue", rows: [
        { label: "Sequence", value: "Revoke the stolen credentials, block the C2, isolate the gateway", tone: "info" },
        { label: "Expected", value: "The beacon stops the moment egress is cut and the host is isolated", tone: "positive" },
      ] },
      { type: "actions", actions: [{ label: "Acknowledge", actionId: "ack", tone: "positive" }] },
    ],
  })
  impl.record(c, `Authorising containment against the live range. Beacon at ${beacons()} check-ins.`, "warning")
  await rangeSleep(500)

  // Real containment against the range.
  const contained = await impl.sendToAgent(c, {
    to: "contain-bulwark",
    objective: "Authorised — execute containment on the range now: revoke svc-deploy and svc-backup, block 185.121.44.19 and cdn-status-check.net, isolate edge-gw-01 and edge-gw-02.",
    context: "This acts on the live range. Sequence credentials, then egress, then hosts.",
  })

  // Verify against the real state: wait for the beacon to actually die.
  impl.setPhase(c, "eradicate", 90, 78)
  let stopped = false
  let last = beacons()
  for (let i = 0; i < 12; i += 1) {
    await rangeSleep(1200)
    const now = beacons()
    const isolated = store.rangeStatus?.isolatedHosts.includes("edge-gw-01") ?? false
    if (isolated && now === last) {
      stopped = true
      break
    }
    last = now
  }

  const closure = await impl.sendToAgent(c, {
    to: "remediate-forge",
    objective: "Confirm closure against the range and roll the mitigation.",
    context: "Re-test that the smuggling path no longer reaches the admin router.",
  })

  impl.setPhase(c, "recover", 96, 100)
  card({
    surface: "incident",
    cardId: "command-post",
    title: `${call} has command`,
    kicker: "Command post · live range",
    tone: stopped ? "positive" : "warning",
    weight: 100,
    blocks: [
      { type: "text", text: stopped
        ? "Contained. The beacon stopped the moment the gateway was isolated on the range — verified against live state."
        : "Containment executed; the beacon is winding down. Verifying against live state.", variant: "lead" },
      { type: "metrics", metrics: [
        { label: "Beacons (final)", value: String(beacons()), tone: stopped ? "positive" : "warning" },
        { label: "Exfiltrated", value: `${exfilMb()} MB`, tone: "critical" },
        { label: "Gateway", value: stopped ? "isolated" : "isolating", tone: stopped ? "positive" : "warning" },
      ] },
      { type: "list", items: [
        "svc-deploy and svc-backup revoked on the identity plane.",
        "185.121.44.19 and cdn-status-check.net blocked at the perimeter.",
        "edge-gw-01 isolated — the beacon loop is dead.",
      ], tone: "positive" },
      { type: "progress", label: "Response plan", value: 100, tone: "positive" },
    ],
  })
  card({
    surface: "mission-control",
    cardId: "zero-day-alert",
    title: "Live zero-day contained",
    kicker: `${call} · ${incident.code}`,
    tone: "positive",
    weight: 90,
    blocks: [
      { type: "text", text: `Contained against the live range. The beacon stopped after ${beacons()} check-ins; ${exfilMb()} MB had already left before isolation.`, variant: "lead" },
    ],
  })

  impl.record(c, stopped ? "Beacon confirmed dead against live range state. Standing down." : "Containment applied; beacon winding down.", stopped ? "positive" : "warning")
  impl.setStatus(c, "resolved")
  impl.setPhase(c, "review", 97, 100)

  for (const assignment of incident.assignments) store.releaseAgent(assignment.agentId, incidentId)
  store.releaseAgent(commanderId, incidentId)
  store.setAgentState(commanderId, { state: "standby", activity: "Stood down" })

  void triage; void forensics; void network; void vuln; void contained; void closure
}

/* ---- the identity front's range response --------------------------------
   ID Cmdr's half of the live campaign: read the real identity telemetry, then
   revoke the consent grant on the range so the mailbox enumeration actually
   stops. Resolution is gated on enumeration being dead against real state. */

export async function replayRangeIdentityCommand(incidentId: string, commanderId: string): Promise<void> {
  const incident = store.incidents.get(incidentId)
  if (!incident) return
  const c = ctx(commanderId, incidentId)
  const call = agentDef(commanderId).callsign
  const card = (spec: Parameters<typeof impl.publishOperatorCard>[1]) => impl.publishOperatorCard(c, spec)
  const enumerated = () => store.rangeStatus?.mailboxesEnumerated ?? 0
  const stopped = () => store.rangeStatus?.enumerationStopped ?? false

  store.setAgentState(commanderId, { state: "working", activity: "Scoping the tenant front", focusIncidentId: incidentId })
  card({
    surface: "incident",
    cardId: "command-post",
    title: `${call} has command`,
    kicker: "Command post · live range",
    tone: "warning",
    weight: 100,
    blocks: [
      { type: "text", text: "Second live front: an unverified OAuth app is reading shared mailboxes right now. Its callback shares infrastructure with the gateway intrusion, so this is not a separate adversary.", variant: "lead" },
      { type: "metrics", metrics: [
        { label: "Mailboxes read", value: String(enumerated()), tone: "warning" },
        { label: "Shared C2", value: "cdn-status-check.net", tone: "critical" },
        { label: "Phase", value: "triage" },
      ] },
    ],
  })
  impl.record(c, "Assumed command of the tenant front. Identity and intelligence first; this shares infrastructure with the gateway incident.", "info")
  await rangeSleep(500)

  impl.setPhase(c, "investigate", 68, 40)
  const [identity, intel] = await Promise.all([
    impl.sendToAgent(c, { to: "identity-keystone", objective: "What can application 9f31c0 reach, and is the grant still live? Read the identity plane.", context: "Two finance users granted mail.read to an unverified publisher within minutes." }),
    impl.sendToAgent(c, { to: "intel-oracle", objective: "Does this application's callback resolve to anything we already know?", context: "The consent app callback resolves through cdn-status-check.net." }),
  ])

  impl.setPhase(c, "contain", 84, 62)
  card({
    surface: "incident",
    cardId: "containment-decision",
    title: "Containment decision",
    kicker: `${call} · authorisation`,
    tone: "warning",
    weight: 95,
    blocks: [
      { type: "text", text: `The app has read ${enumerated()} mailboxes and is still going. Revoking the consent grant stops it immediately — no production impact beyond the two users re-consenting.`, variant: "lead" },
      { type: "actions", actions: [{ label: "Acknowledge", actionId: "ack", tone: "positive" }] },
    ],
  })
  impl.record(c, `Authorising consent revocation. App has enumerated ${enumerated()} mailboxes.`, "warning")
  await rangeSleep(400)

  const contained = await impl.sendToAgent(c, {
    to: "contain-bulwark",
    objective: "Authorised — revoke the consent grant for application 9f31c0 on the range and kill its tokens now.",
    context: "This acts on the live range and stops the mailbox enumeration.",
  })
  // Contain's range identity path revokes the consent directly.
  await impl.revokeConsent(c, "9f31c0")

  // Verify against real state: wait for enumeration to actually stop.
  impl.setPhase(c, "eradicate", 92, 82)
  for (let i = 0; i < 12 && !stopped(); i += 1) await rangeSleep(1000)

  const brief = await impl.sendToAgent(c, {
    to: "comms-herald",
    objective: "Tell the two affected users what happened and what not to do next.",
    context: "Their consent was harvested by an unverified app impersonating an internal tool; mailboxes were enumerated.",
  })

  impl.setPhase(c, "recover", 96, 100)
  card({
    surface: "incident",
    cardId: "command-post",
    title: `${call} has command`,
    kicker: "Command post · live range",
    tone: stopped() ? "positive" : "warning",
    weight: 100,
    blocks: [
      { type: "text", text: stopped()
        ? "Contained. Consent revoked on the range and the mailbox enumeration stopped — verified against live state."
        : "Consent revoked; enumeration winding down. Verifying against live state.", variant: "lead" },
      { type: "keyvalue", rows: [
        { label: "Mailboxes read", value: `${enumerated()} before it stopped`, tone: "warning" },
        { label: "Enumeration", value: stopped() ? "stopped" : "stopping", tone: stopped() ? "positive" : "warning" },
        { label: "Campaign", value: "Same adversary as the gateway front — Campaign holds the correlation", tone: "info" },
      ] },
      { type: "progress", label: "Response plan", value: 100, tone: "positive" },
    ],
  })
  impl.record(c, stopped() ? "Enumeration confirmed stopped against live range state. Holding until the gateway front closes." : "Consent revoked; enumeration winding down.", stopped() ? "positive" : "warning")
  impl.setStatus(c, "contained")

  for (const assignment of incident.assignments) store.releaseAgent(assignment.agentId, incidentId)
  store.setAgentState(commanderId, { state: "standby", activity: "Holding the tenant front" })

  void identity; void intel; void contained; void brief
}

/* ---- generic range response --------------------------------------------
   Used for range fronts that don't need bespoke prose. Reads real telemetry
   via the specialists, contains via the Containment operator, and gates
   resolution on the real harm counter actually stopping. */

export interface RangeResponseConfig {
  harmLabel: string
  harmValue: () => number
  stopped: () => boolean
  specialists: { to: string; objective: string; context?: string }[]
  containObjective: string
  containedText: string
  runningText: string
}

export async function replayRangeGenericCommand(
  incidentId: string,
  commanderId: string,
  config: RangeResponseConfig,
): Promise<void> {
  const incident = store.incidents.get(incidentId)
  if (!incident) return
  const c = ctx(commanderId, incidentId)
  const call = agentDef(commanderId).callsign
  const card = (spec: Parameters<typeof impl.publishOperatorCard>[1]) => impl.publishOperatorCard(c, spec)

  store.setAgentState(commanderId, { state: "working", activity: "Scoping the intrusion", focusIncidentId: incidentId })
  card({
    surface: "incident",
    cardId: "command-post",
    title: `${call} has command`,
    kicker: "Command post · live range",
    tone: "critical",
    weight: 100,
    blocks: [
      { type: "text", text: incident.summary, variant: "lead" },
      { type: "metrics", metrics: [
        { label: config.harmLabel, value: String(config.harmValue()), tone: "critical" },
        { label: "Phase", value: "triage" },
      ] },
      { type: "text", text: "The harm is ongoing as I work. Tasking specialists against the live telemetry, then containing on my authority — every second is more damage." },
    ],
  })
  impl.record(c, "Assumed command of the live-range intrusion.", "info")
  await rangeSleep(500)

  impl.setPhase(c, "investigate", 60, 35)
  const findings = await Promise.all(config.specialists.map((task) => impl.sendToAgent(c, task)))

  impl.setPhase(c, "contain", 84, 60)
  card({
    surface: "incident",
    cardId: "containment-decision",
    title: "Containment decision",
    kicker: `${call} · authorisation`,
    tone: "warning",
    weight: 95,
    blocks: [
      { type: "text", text: `${config.harmLabel} at ${config.harmValue()} and climbing. Authorising containment now.`, variant: "lead" },
      { type: "actions", actions: [{ label: "Acknowledge", actionId: "ack", tone: "positive" }] },
    ],
  })
  impl.record(c, `Authorising containment. ${config.harmLabel}: ${config.harmValue()}.`, "warning")
  await rangeSleep(400)

  const contained = await impl.sendToAgent(c, { to: "contain-bulwark", objective: config.containObjective, context: "This acts on the live range." })

  impl.setPhase(c, "eradicate", 92, 82)
  for (let i = 0; i < 14 && !config.stopped(); i += 1) await rangeSleep(1000)

  const done = config.stopped()
  impl.setPhase(c, "recover", 96, 100)
  card({
    surface: "incident",
    cardId: "command-post",
    title: `${call} has command`,
    kicker: "Command post · live range",
    tone: done ? "positive" : "warning",
    weight: 100,
    blocks: [
      { type: "text", text: done ? config.containedText : config.runningText, variant: "lead" },
      { type: "metrics", metrics: [
        { label: `${config.harmLabel} (final)`, value: String(config.harmValue()), tone: done ? "positive" : "warning" },
        { label: "Status", value: done ? "contained" : "containing", tone: done ? "positive" : "warning" },
      ] },
      { type: "progress", label: "Response plan", value: 100, tone: "positive" },
    ],
  })
  impl.record(c, done ? "Harm confirmed stopped against live range state. Standing down." : "Containment applied; harm winding down.", done ? "positive" : "warning")
  impl.setStatus(c, "resolved")
  impl.setPhase(c, "review", 97, 100)

  for (const assignment of incident.assignments) store.releaseAgent(assignment.agentId, incidentId)
  store.releaseAgent(commanderId, incidentId)
  store.setAgentState(commanderId, { state: "standby", activity: "Stood down" })
  void findings; void contained
}
