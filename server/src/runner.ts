import { a2aBroadcast, clearTasks } from "./a2a/transport.ts"
import { clearAllCards, publishCard } from "./a2ui/cards.ts"
import { agentDef, COMMANDERS, ROSTER } from "./agents/roster.ts"
import { commanderKickoff } from "./agents/prompts.ts"
import {
  replayCommand,
  replayRangeCommand,
  replayRangeGenericCommand,
  replayRangeIdentityCommand,
  type RangeResponseConfig,
} from "./agents/replay.ts"
import { runAgentSession } from "./agents/runtime.ts"
import type { Incident } from "./model.ts"
import { SCENARIO_BY_ID, SCENARIOS, type Scenario } from "./scenarios/index.ts"
import { store, WorldResetError } from "./store.ts"
import { setSource } from "./tools/source.ts"
import { simSource } from "./tools/sim-source.ts"
import { rangeSource } from "./range/telemetry.ts"
import { RangeSupervisor, type DetectionSignal } from "./range/supervisor.ts"
import { eventsPath, statePath } from "./range/events.ts"
import { rm } from "node:fs/promises"
import * as impl from "./tools/impl.ts"

/* Run control.
   Owns the wall clock: injects the estate's signal on a schedule, hands each
   incident to a commander, and keeps the mission-control baseline current so
   the page is never empty before the agents have anything to say. */

const running = new Set<string>()

/** The live range, when one is running. Only one range exists at a time. */
let supervisor: RangeSupervisor | null = null

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function isRunning(): boolean {
  return running.size > 0
}

export function activeScenarios(): string[] {
  return [...running]
}

/* ---- mission-control baseline ------------------------------------------ */

const THREAT_TONE = { green: "positive", amber: "warning", red: "critical", black: "critical" } as const

export function refreshMissionControl(): void {
  const posture = store.posture()
  const open = [...store.incidents.values()].filter((incident) => incident.status !== "resolved")
  const engaged = [...store.runtime.values()].filter((each) => each.incidentIds.length > 0)

  publishCard({
    surfaceId: "mission-control",
    cardId: "posture",
    title: "Estate posture",
    kicker: "Continuous",
    tone: THREAT_TONE[posture.threatLevel],
    weight: 200,
    blocks: [
      {
        type: "metrics",
        metrics: [
          { label: "Threat level", value: posture.threatLevel.toUpperCase(), tone: THREAT_TONE[posture.threatLevel] },
          { label: "Open incidents", value: String(posture.openIncidents), tone: posture.openIncidents > 0 ? "warning" : "positive" },
          { label: "Agents engaged", value: `${posture.agentsEngaged}/${ROSTER.length}` },
          { label: "Bus traffic", value: `${posture.busMessagesPerMin}/min` },
        ],
      },
      ...(open.length > 0
        ? ([
            {
              type: "agents" as const,
              agents: engaged.map((runtime) => ({
                id: runtime.id,
                name: agentDef(runtime.id).callsign,
                state: runtime.state,
              })),
            },
          ] as const)
        : ([{ type: "text" as const, text: "Nothing open. The swarm is on standby and the estate is quiet.", tone: "positive" as const }] as const)),
    ],
  })

  publishCard({
    surfaceId: "mission-control",
    cardId: "estate",
    title: "Estate",
    kicker: "Continuous",
    tone: "neutral",
    weight: 40,
    blocks: [
      {
        type: "keyvalue",
        rows: [...store.hosts.values()]
          .filter((host) => host.status !== "healthy")
          .map((host) => ({
            label: host.name,
            value: `${host.status} · ${host.role}`,
            tone: host.status === "compromised" ? ("critical" as const) : host.status === "isolated" ? ("warning" as const) : ("positive" as const),
          })),
      },
    ],
  })
}

/* ---- incident lifecycle ------------------------------------------------- */

async function emitDetections(scenario: Scenario, tick: number): Promise<string[]> {
  const lines: string[] = []
  let previous = 0
  for (const detection of scenario.detections) {
    await sleep(Math.max(0, ((detection.afterMs - previous) / 4200) * tick * 3))
    previous = detection.afterMs
    const record = store.recordDetection({
      source: detection.source,
      host: detection.host,
      rule: detection.rule,
      severity: detection.severity,
      detail: detection.detail,
      incidentId: null,
    })
    lines.push(`${record.source}/${record.rule} on ${record.host}: ${record.detail}`)
  }
  return lines
}

function peerContext(commanderId: string) {
  return COMMANDERS.filter((peer) => peer.id !== commanderId).map((peer) => ({
    id: peer.id,
    name: peer.name,
    incidents: [...store.incidents.values()]
      .filter((incident) => incident.commanderId === peer.id && incident.status !== "resolved")
      .map((incident) => `${incident.code} (${incident.title})`),
  }))
}

export interface RunRefusal {
  ok: false
  reason: string
}

/**
 * Why a scenario cannot start right now, or null if it can. Running the same
 * scenario twice used to be allowed and quietly produced a second incident
 * with the same code, which then drew as two identically-labelled clusters.
 */
export function refuseReason(scenarioId: string): string | null {
  const scenario = SCENARIO_BY_ID.get(scenarioId)
  if (!scenario) return `No scenario named ${scenarioId}.`
  if (running.has(scenarioId)) return `${scenario.name} is already running.`
  const existing = [...store.incidents.values()].find(
    (incident) => incident.scenarioId === scenarioId && incident.status !== "resolved",
  )
  if (existing) {
    return `${existing.code} is still open under ${agentDef(existing.commanderId).callsign}. Reset the world to run it again.`
  }
  const closed = [...store.incidents.values()].find((incident) => incident.scenarioId === scenarioId)
  if (closed) {
    return `${closed.code} has already run in this world. Reset to run it again.`
  }
  return null
}

export async function runScenario(scenarioId: string): Promise<Incident | null> {
  const scenario = SCENARIO_BY_ID.get(scenarioId)
  if (!scenario) throw new Error(`unknown scenario ${scenarioId}`)
  if (refuseReason(scenarioId) !== null) return null
  running.add(scenarioId)
  const generation = store.generation

  const tick = Number(process.env.PHALANX_TICK_MS ?? process.env.ESPER_TICK_MS ?? 1500)
  store.log(`Scenario ${scenario.name} starting.`)

  try {
    const detectionLines = await emitDetections(scenario, tick)

    const incident = store.openIncident({
      code: scenario.code,
      title: scenario.title,
      summary: scenario.summary,
      severity: scenario.severity,
      commanderId: scenario.commanderId,
      scenarioId: scenario.id,
      assets: scenario.assets,
      indicators: scenario.indicators,
    })
    for (const detection of store.detections.filter((each) => scenario.assets.includes(each.host) || each.host === "corp-idp-01")) {
      detection.incidentId = incident.id
    }
    refreshMissionControl()

    if (store.mode === "live") {
      await runAgentSession({
        agentId: scenario.commanderId,
        incidentId: incident.id,
        prompt: commanderKickoff({
          incidentCode: incident.code,
          title: incident.title,
          severity: incident.severity,
          detections: detectionLines,
          peerCommanders: peerContext(scenario.commanderId),
        }),
        maxTurns: 48,
      })
    } else {
      await replayCommand(incident.id, scenario.commanderId)
    }

    refreshMissionControl()
    store.log(`Scenario ${scenario.name} complete.`)
    return incident
  } catch (error) {
    if (error instanceof WorldResetError || store.generation !== generation) {
      store.log(`Scenario ${scenario.name} abandoned — world was reset.`, "warn")
      return null
    }
    const detail = error instanceof Error ? error.message : String(error)
    store.log(`Scenario ${scenario.name} failed: ${detail}`, "error")
    return null
  } finally {
    running.delete(scenarioId)
  }
}

/* ---- the multi-front campaign ------------------------------------------ */

/**
 * Two commanders on two fronts that turn out to be one adversary. This is the
 * case the single-incident view cannot show: agents shared across incidents,
 * and commanders negotiating with each other rather than with the operator.
 */
export function refuseCampaignReason(): string | null {
  if (running.has("campaign")) return "The campaign is already running."
  const blocked = ["zero-day-edge", "identity-front"].map(refuseReason).filter((each): each is string => each !== null)
  return blocked.length > 0 ? blocked[0]! : null
}

export async function runCampaign(): Promise<void> {
  if (refuseCampaignReason() !== null) return
  running.add("campaign")
  const generation = store.generation
  try {
    const first = runScenario("zero-day-edge")
    await sleep(Number(process.env.PHALANX_TICK_MS ?? process.env.ESPER_TICK_MS ?? 1500) * 6)
    const second = runScenario("identity-front")

    // Give both commanders time to have something worth trading.
    await sleep(Number(process.env.PHALANX_TICK_MS ?? process.env.ESPER_TICK_MS ?? 1500) * 8)
    await coordinateCommanders()

    await Promise.all([first, second])
    refreshMissionControl()
  } catch (error) {
    if (!(error instanceof WorldResetError) && store.generation === generation) throw error
    store.log("Campaign abandoned — world was reset.", "warn")
  } finally {
    running.delete("campaign")
  }
}

export async function coordinateCommanders(): Promise<void> {
  const generation = store.generation
  const open = [...store.incidents.values()].filter((incident) => incident.status !== "resolved")
  if (open.length < 2) return
  const [left, right] = open
  if (!left || !right || left.commanderId === right.commanderId) return

  const shared = left.indicators.filter((indicator) => right.indicators.includes(indicator))
  if (shared.length === 0) return

  store.setAgentState(right.commanderId, { state: "consulting", activity: `Raising a shared indicator with ${agentDef(left.commanderId).callsign}` })

  await impl.sendToAgent(
    { agentId: right.commanderId, incidentId: right.id },
    {
      to: left.commanderId,
      kind: "escalation",
      objective: `${shared[0]} appears in both of our incidents. Are we fighting the same adversary?`,
      context: `${right.code}: ${right.title}. The consent-grant application resolves through ${shared[0]}, which your gateway host is also beaconing to.`,
    },
  )

  // The strategic commander takes the campaign view, pulls both pictures, and
  // links the two. This is the only three-way exchange in the demo, and it is
  // the one the single-incident view structurally cannot show.
  store.enrollAgent("ic-orrery", left.id)
  store.enrollAgent("ic-orrery", right.id)
  store.setAgentState("ic-orrery", { state: "consulting", activity: "Pulling both commanders' pictures", focusIncidentId: left.id })

  await Promise.all([
    impl.sendToAgent(
      { agentId: "ic-orrery", incidentId: left.id },
      {
        to: left.commanderId,
        kind: "escalation",
        objective: "Give me your current picture — I am taking the campaign view across both fronts.",
        context: `${right.code} shares ${shared.join(", ")} with you.`,
      },
    ),
    impl.sendToAgent(
      { agentId: "ic-orrery", incidentId: right.id },
      {
        to: right.commanderId,
        kind: "escalation",
        objective: "Give me your current picture — I am taking the campaign view across both fronts.",
        context: `${left.code} shares ${shared.join(", ")} with you.`,
      },
    ),
  ])

  store.setAgentState("ic-orrery", { state: "working", activity: "Correlating two incidents into one campaign", focusIncidentId: left.id })

  impl.linkIncidents({ agentId: "ic-orrery", incidentId: left.id }, right.id, `Shared infrastructure: ${shared.join(", ")}`)
  impl.record({ agentId: "ic-orrery", incidentId: left.id }, `Linked to ${right.code}. One adversary, two fronts — treat containment on either front as partial until both are closed.`, "warning")
  impl.record({ agentId: "ic-orrery", incidentId: right.id }, `Linked to ${left.code} on shared infrastructure ${shared.join(", ")}.`, "warning")

  publishCard({
    surfaceId: "mission-control",
    cardId: "campaign",
    title: "Two incidents, one adversary",
    kicker: "Campaign · campaign view",
    tone: "critical",
    weight: 150,
    blocks: [
      {
        type: "text",
        text: `${left.code} and ${right.code} share ${shared.join(", ")}. They are not independent, and containing either one alone leaves the adversary a way back in.`,
        variant: "lead",
      },
      {
        type: "keyvalue",
        rows: [
          { label: left.code, value: `${agentDef(left.commanderId).callsign} — ${left.title}`, tone: "critical" },
          { label: right.code, value: `${agentDef(right.commanderId).callsign} — ${right.title}`, tone: "warning" },
          { label: "Shared", value: shared.join(", "), tone: "critical" },
        ],
      },
      {
        type: "text",
        text: "Arbitration: Commander holds priority on shared specialists until the gateway front is contained, because that front has an active egress channel and this one does not. ID Cmdr continues on the tenant with Identity and Comms only.",
      },
    ],
  })

  a2aBroadcast({
    from: "ic-orrery",
    incidentId: null,
    summary: `Campaign declared — ${left.code} and ${right.code} are one adversary`,
    text: "Both fronts now report indicators to the campaign channel. Do not close either incident without the other commander's agreement.",
  })

  if (store.generation !== generation) return
  store.setAgentState("ic-orrery", { state: "standby", activity: "Holding the campaign picture" })
  store.setAgentState(right.commanderId, { state: "working", activity: "Working the tenant front" })
  refreshMissionControl()
}

/**
 * Back to the start. Everything the run produced is dropped — incidents,
 * timelines, bus history, detections, A2A tasks, A2UI surfaces and their card
 * registries, estate damage, and per-agent counters — and the generation bump
 * unwinds anything still in flight. Clients are sent a whole new snapshot
 * because no incremental event can say "forget what you were shown".
 */
/* ---- the live range ----------------------------------------------------
   Runs the real attack against the real estate and points the agents' tools
   at the real telemetry it produces. Detections are derived from the log the
   attack is writing, not scripted — the incident opens because the SIEM
   genuinely saw the intrusion. */

interface RangeFront {
  front: string
  commanderId: string
  code: string
  title: string
  summary: string
  severity: Incident["severity"]
  assets: string[]
  indicators: string[]
  respond: (incidentId: string, commanderId: string) => Promise<void>
}

/**
 * Shared engine for one or more concurrent real attacks. Each front opens its
 * own incident under its own commander the first time a genuinely alerting
 * signal for it appears in the log, then runs its response against the live
 * telemetry. When more than one front is live and they share infrastructure,
 * the commanders correlate them into one campaign.
 */
async function runRangeCore(fronts: RangeFront[], vectors: string[], correlatePairs: [string, string][] = []): Promise<void> {
  if (running.has("range") || supervisor) return
  await resetWorld()
  running.add("range")
  const generation = store.generation
  setSource(rangeSource)
  store.log(`Range starting — ${vectors.length > 1 ? "launching concurrent attacks" : "launching the attack"}.`)

  const incidentByFront = new Map<string, Incident>()
  const buffers = new Map<string, DetectionSignal[]>()
  const responses: Promise<void>[] = []
  const correlatedPairs = new Set<string>()

  const configFor = (front: string) => fronts.find((each) => each.front === front)

  const openFront = (front: string) => {
    if (store.generation !== generation || incidentByFront.has(front)) return
    const config = configFor(front)
    if (!config) return
    const incident = store.openIncident({
      code: config.code,
      title: config.title,
      summary: config.summary,
      severity: config.severity,
      commanderId: config.commanderId,
      scenarioId: "range",
      assets: config.assets,
      indicators: config.indicators,
    })
    incidentByFront.set(front, incident)
    for (const buffered of buffers.get(front) ?? []) store.recordDetection({ ...buffered, incidentId: incident.id })
    refreshMissionControl()
    responses.push(
      config.respond(incident.id, config.commanderId).catch((error) => {
        if (!(error instanceof WorldResetError) && store.generation === generation) {
          store.log(`${config.commanderId} range response failed: ${error instanceof Error ? error.message : String(error)}`, "error")
        }
      }),
    )
    // Correlate declared pairs once both of their incidents are live.
    for (const [a, b] of correlatePairs) {
      const key = `${a}:${b}`
      if (correlatedPairs.has(key)) continue
      const left = incidentByFront.get(a)
      const right = incidentByFront.get(b)
      if (left && right) {
        correlatedPairs.add(key)
        responses.push(
          rangeCorrelate(left.id, right.id).catch((error) => {
            if (!(error instanceof WorldResetError) && store.generation === generation) {
              store.log(`rangeCorrelate failed: ${error instanceof Error ? error.message : String(error)}`, "warn")
            }
          }),
        )
      }
    }
  }

  supervisor = new RangeSupervisor(
    {
      onLog: (text, level) => store.log(text, level),
      onState: (state) => {
        if (store.generation !== generation) return
        store.setRangeStatus(state)
        for (const host of state.compromisedHosts) store.setHostStatus(host, "compromised")
        for (const host of state.isolatedHosts) store.setHostStatus(host, "isolated")
        store.recomputePosture()
      },
      onDetection: (detection) => {
        if (store.generation !== generation) return
        const incident = incidentByFront.get(detection.front)
        if (incident) {
          store.recordDetection({ ...detection, incidentId: incident.id })
          return
        }
        const buffer = buffers.get(detection.front) ?? []
        buffer.push(detection)
        buffers.set(detection.front, buffer)
        store.recordDetection({ ...detection, incidentId: null })
        if (detection.severity === "sev1" || detection.severity === "sev2") openFront(detection.front)
      },
    },
    vectors,
  )

  try {
    const up = await supervisor.start()
    if (!up) {
      store.log("Range failed to start; reverting to the built-in estate.", "error")
      setSource(simSource)
      return
    }
    // Make sure every front opens even on a slow start.
    for (let i = 0; i < 40 && incidentByFront.size < fronts.length && store.generation === generation; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
    for (const front of fronts) openFront(front.front)
    await Promise.all(responses)
    refreshMissionControl()
  } catch (error) {
    if (!(error instanceof WorldResetError) && store.generation === generation) {
      store.log(`Range run failed: ${error instanceof Error ? error.message : String(error)}`, "error")
    }
  } finally {
    running.delete("range")
    if (supervisor) {
      await supervisor.stop()
      supervisor = null
    }
  }
}

function gatewayFront(): RangeFront {
  return {
    front: "gateway",
    commanderId: "ic-atlas",
    code: "PLX-RNG1",
    title: "Live-range intrusion of edge-gw-01",
    summary:
      "A real attack script is running against an isolated estate on this host. The gateway logged a chunked request to an administrative path, the gateway service account spawned a shell, and a stolen deployment credential began moving east. Everything the responders read is that attack's own telemetry.",
    severity: "sev1",
    assets: ["edge-gw-01", "app-api-21", "build-ci-01", "data-obj-01"],
    indicators: ["185.121.44.19", "cdn-status-check.net", "svc-deploy"],
    respond: async (incidentId, commanderId) => {
      if (store.mode === "live") {
        await runAgentSession({
          agentId: commanderId,
          incidentId,
          prompt: commanderKickoff({
            incidentCode: "PLX-RNG1",
            title: "Live-range intrusion of edge-gw-01",
            severity: "sev1",
            detections: store.detections.filter((d) => d.incidentId === incidentId).map((d) => `${d.source}/${d.rule} on ${d.host}: ${d.detail}`),
            peerCommanders: peerContext(commanderId),
          }),
          maxTurns: 48,
        })
      } else {
        await replayRangeCommand(incidentId, commanderId)
      }
    },
  }
}

function identityFront(): RangeFront {
  return {
    front: "identity",
    commanderId: "ic-vesper",
    code: "PLX-RNG2",
    title: "Consent-grant abuse in the corporate tenant",
    summary:
      "A second real attack is running in parallel: an unverified OAuth application was granted mailbox access by two finance users within minutes, and it is enumerating shared mailboxes now. Its callback resolves through the same infrastructure as the gateway intrusion.",
    severity: "sev2",
    assets: ["corp-idp-01", "corp-fs-03"],
    indicators: ["cdn-status-check.net", "185.121.44.19", "app-9f31c0"],
    respond: async (incidentId, commanderId) => {
      if (store.mode === "live") {
        await runAgentSession({
          agentId: commanderId,
          incidentId,
          prompt: commanderKickoff({
            incidentCode: "PLX-RNG2",
            title: "Consent-grant abuse in the corporate tenant",
            severity: "sev2",
            detections: store.detections.filter((d) => d.incidentId === incidentId).map((d) => `${d.source}/${d.rule} on ${d.host}: ${d.detail}`),
            peerCommanders: peerContext(commanderId),
          }),
          maxTurns: 40,
        })
      } else {
        await replayRangeIdentityCommand(incidentId, commanderId)
      }
    },
  }
}

function ransomwareFront(): RangeFront {
  return {
    front: "ransomware",
    commanderId: "ic-warden",
    code: "PLX-RNG3",
    title: "Ransomware encrypting the corporate file share",
    summary:
      "A third real attack, unrelated to the others: a phished workstation detonated ransomware that is encrypting corp-fs-03 in real time. Stopping it is a race — isolating the host cuts the encryption loop.",
    severity: "sev1",
    assets: ["corp-ws-118", "corp-fs-03"],
    indicators: ["203.0.113.7", "corp-fs-03", ".rvlock"],
    respond: async (incidentId, commanderId) => {
      const config: RangeResponseConfig = {
        harmLabel: "Files encrypted",
        harmValue: () => store.rangeStatus?.filesEncrypted ?? 0,
        stopped: () => store.rangeStatus?.encryptionStopped ?? false,
        specialists: [
          { to: "forensics-cinder", objective: "Confirm what is encrypting corp-fs-03 and where it came from.", context: "A workstation macro detonated ransomware against the file share." },
          { to: "hunt-drift", objective: "Is any other host encrypting? Sweep the estate.", context: "Ransomware writing .rvlock on corp-fs-03." },
        ],
        containObjective: "Authorised — isolate corp-fs-03 now to stop the encryption. This is ransomware in progress.",
        containedText: "Contained. corp-fs-03 isolated on the range and the encryption stopped — verified against live state.",
        runningText: "Isolation issued; encryption winding down. Verifying against live state.",
      }
      if (store.mode === "live") {
        await runAgentSession({ agentId: commanderId, incidentId, prompt: commanderKickoff({ incidentCode: "PLX-RNG3", title: "Ransomware on corp-fs-03", severity: "sev1", detections: store.detections.filter((d) => d.incidentId === incidentId).map((d) => `${d.source}/${d.rule} on ${d.host}: ${d.detail}`), peerCommanders: peerContext(commanderId) }), maxTurns: 40 })
      } else {
        await replayRangeGenericCommand(incidentId, commanderId, config)
      }
    },
  }
}

function bruteforceFront(): RangeFront {
  return {
    front: "bruteforce",
    commanderId: "ic-marshal",
    code: "PLX-RNG4",
    title: "Credential stuffing against the identity provider",
    summary:
      "A fourth real attack, opportunistic and independent: a password-spray run from a single source against corp-idp-01, heading for account takeover. Blocking the source and resetting the account ends it.",
    severity: "sev2",
    assets: ["corp-idp-01"],
    indicators: ["203.0.113.44", "r.almeida"],
    respond: async (incidentId, commanderId) => {
      const config: RangeResponseConfig = {
        harmLabel: "Failed logins",
        harmValue: () => store.rangeStatus?.failedLogins ?? 0,
        stopped: () => store.rangeStatus?.bruteforceStopped ?? false,
        specialists: [
          { to: "identity-keystone", objective: "Characterise the credential-stuffing run and whether any account was taken over.", context: "Password spray from 203.0.113.44 against corp-idp-01." },
          { to: "intel-oracle", objective: "Is 203.0.113.44 known infrastructure?", context: "Source of the credential-stuffing run." },
        ],
        containObjective: "Authorised — block 203.0.113.44 and reset r.almeida to end the credential-stuffing.",
        containedText: "Contained. Source blocked and the account reset on the range — the attempts are refused now, verified against live state.",
        runningText: "Block issued; attempts winding down. Verifying against live state.",
      }
      if (store.mode === "live") {
        await runAgentSession({ agentId: commanderId, incidentId, prompt: commanderKickoff({ incidentCode: "PLX-RNG4", title: "Credential stuffing on corp-idp-01", severity: "sev2", detections: store.detections.filter((d) => d.incidentId === incidentId).map((d) => `${d.source}/${d.rule} on ${d.host}: ${d.detail}`), peerCommanders: peerContext(commanderId) }), maxTurns: 40 })
      } else {
        await replayRangeGenericCommand(incidentId, commanderId, config)
      }
    },
  }
}

/** Link two range incidents into one campaign and let the campaign commander
    (Campaign) publish the correlation. Used for the two fronts that share
    SALT MERIDIAN infrastructure. */
async function rangeCorrelate(leftId: string, rightId: string): Promise<void> {
  try {
    const left = store.incidents.get(leftId)
    const right = store.incidents.get(rightId)
    if (!left || !right) return
    const shared = left.indicators.filter((i) => right.indicators.includes(i))
    store.enrollAgent("ic-orrery", left.id)
    store.enrollAgent("ic-orrery", right.id)
    store.setAgentState("ic-orrery", { state: "consulting", activity: "Pulling both commanders' pictures", focusIncidentId: left.id })
    await impl.sendToAgent({ agentId: right.commanderId, incidentId: right.id }, { to: left.commanderId, kind: "escalation", objective: `${shared[0] ?? "shared infrastructure"} appears in both of our incidents. Same adversary?`, context: `${right.code} shares ${shared.join(", ")} with you.` })
    await impl.sendToAgent({ agentId: "ic-orrery", incidentId: left.id }, { to: left.commanderId, kind: "escalation", objective: "Give me your picture — taking the campaign view.", context: `${right.code} shares ${shared.join(", ")}.` })
    impl.linkIncidents({ agentId: "ic-orrery", incidentId: left.id }, right.id, `Shared infrastructure: ${shared.join(", ")}`)
    publishCard({
      surfaceId: "mission-control",
      cardId: "campaign",
      title: "Two of these are one adversary",
      kicker: "Campaign · correlation",
      tone: "critical",
      weight: 150,
      blocks: [
        { type: "text", text: `${left.code} and ${right.code} share ${shared.join(", ")} — the same SALT MERIDIAN infrastructure. The other live incidents are independent, opportunistic attacks.`, variant: "lead" },
        { type: "keyvalue", rows: [
          { label: left.code, value: `${agentDef(left.commanderId).callsign} — ${left.title}`, tone: "critical" },
          { label: right.code, value: `${agentDef(right.commanderId).callsign} — ${right.title}`, tone: "warning" },
        ] },
      ],
    })
    store.setAgentState("ic-orrery", { state: "standby", activity: "Holding the campaign picture" })
    refreshMissionControl()
  } catch (error) {
    if (error instanceof WorldResetError) return
    throw error
  }
}

export async function runRange(): Promise<void> {
  await runRangeCore([gatewayFront()], ["gateway"])
}

export async function runRangeCampaign(): Promise<void> {
  await runRangeCore([gatewayFront(), identityFront()], ["gateway", "identity"], [["gateway", "identity"]])
}

export async function runRangeMultiFront(): Promise<void> {
  await runRangeCore(
    [gatewayFront(), identityFront(), ransomwareFront(), bruteforceFront()],
    ["gateway", "identity", "ransomware", "bruteforce"],
    [["gateway", "identity"]],
  )
}

export async function stopRange(): Promise<void> {
  const current = supervisor
  supervisor = null
  running.delete("range")
  if (current) await current.stop()
  // The log is the world; clear it so the Live Range page is empty after a
  // reset rather than showing the last run's telemetry until the next boot.
  await Promise.all([rm(eventsPath(), { force: true }), rm(statePath(), { force: true })])
  store.setRangeStatus(null)
  // Source management stays with the synchronous callers (resetWorld / the
  // stop endpoint) so this async teardown can never clobber a source a range
  // run has just set.
}

/** Synchronous teardown for process-exit handlers so range children never
    orphan when the server is killed. */
export function killRangeSync(): void {
  if (supervisor) supervisor.killSync()
  supervisor = null
}

export async function resetWorld(): Promise<void> {
  await stopRange()
  setSource(simSource)
  running.clear()
  store.resetAll()
  clearTasks()
  clearAllCards()
  store.ensureSurface("mission-control")
  refreshMissionControl()
  store.recomputePosture()
  store.broadcastSnapshot()
  store.log("World reset — all run data cleared.")
}

export function listScenarios() {
  return SCENARIOS.map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    code: scenario.code,
    summary: scenario.summary,
    severity: scenario.severity,
    commanderId: scenario.commanderId,
    running: running.has(scenario.id),
    refusal: refuseReason(scenario.id),
  }))
}
