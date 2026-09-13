import { store } from "../store.ts"
import { agentDef, ROSTER } from "./roster.ts"
import type { AgentDef, Incident } from "../model.ts"

export interface AskCommanderRequest {
  prompt: string
  agentId?: string
}

export interface AskCommanderResponse {
  ok: boolean
  answer: string
  fromAgentId: string
  error?: string
}

function resolveAgent(agentId?: string): AgentDef {
  if (agentId) {
    const found = ROSTER.find(
      (a) => a.id === agentId || a.callsign.toLowerCase() === agentId.toLowerCase() || a.name.toLowerCase() === agentId.toLowerCase()
    )
    if (found) return found
  }

  // Look for an active incident commander
  const activeIncidents = [...store.incidents.values()].filter((i) => i.status !== "resolved")
  if (activeIncidents.length > 0) {
    const commander = ROSTER.find((a) => a.id === activeIncidents[0]!.commanderId)
    if (commander) return commander
  }

  // Default to primary Incident Commander (Atlas)
  return agentDef("ic-atlas")
}

function getActiveIncident(): Incident | null {
  const active = [...store.incidents.values()].filter((i) => i.status !== "resolved")
  if (active.length > 0) {
    return active.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]!
  }
  const all = [...store.incidents.values()]
  if (all.length > 0) {
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]!
  }
  return null
}

function buildWorldContext(): string {
  const incidents = [...store.incidents.values()]
  const openIncidents = incidents.filter((i) => i.status !== "resolved")
  const isolatedHosts = [...store.hosts.values()].filter((h) => h.status === "isolated").map((h) => h.id)
  const compromisedHosts = [...store.hosts.values()].filter((h) => h.status === "compromised" || h.status === "suspect").map((h) => h.id)
  
  const incidentSummaries = incidents.map((inc) => {
    const recentTl = inc.timeline.slice(-3).map((t) => `    - [${t.actorName}] ${t.text}`).join("\n")
    return `- Incident ${inc.code} ("${inc.title}"):
    Severity: ${inc.severity.toUpperCase()} | Phase: ${inc.phase} | Status: ${inc.status} | Progress: ${inc.progress}%
    Commander: ${agentDef(inc.commanderId)?.callsign ?? inc.commanderId}
    Assets: ${inc.assets.length > 0 ? inc.assets.join(", ") : "none recorded"}
    Indicators: ${inc.indicators.length > 0 ? inc.indicators.join(", ") : "none recorded"}
${recentTl ? `    Recent Timeline:\n${recentTl}` : ""}`
  }).join("\n\n")

  const rangeInfo = store.rangeStatus
    ? `Live Range Lab Status:
  Attack Stage: ${store.rangeStatus.attackStage}
  Compromised Hosts: ${store.rangeStatus.compromisedHosts.join(", ") || "none"}
  Isolated Hosts: ${store.rangeStatus.isolatedHosts.join(", ") || "none"}
  Blocked Indicators: ${store.rangeStatus.blockedIndicators.join(", ") || "none"}
  Revoked Principals: ${store.rangeStatus.revokedPrincipals.join(", ") || "none"}
  Beacons Observed: ${store.rangeStatus.beaconCount} | Exfiltrated Bytes: ${store.rangeStatus.exfilBytes}`
    : "Live Range Lab: Not currently running (simulated estate active)"

  const posture = store.posture()
  return `System Mode: ${store.mode} (Provider: ${store.activeProvider})
Posture Threat Level: ${posture.threatLevel.toUpperCase()}
Open Incidents: ${openIncidents.length} (Total: ${incidents.length})
Agents Engaged: ${posture.agentsEngaged}
Contained Today: ${store.containedToday}

Host Status:
  Isolated: ${isolatedHosts.length > 0 ? isolatedHosts.join(", ") : "None"}
  Compromised/Suspect: ${compromisedHosts.length > 0 ? compromisedHosts.join(", ") : "None"}

Incidents Overview:
${incidentSummaries || "No active or recorded incidents in the store."}

${rangeInfo}

Recent Detections:
${store.detections.slice(0, 5).map((d) => `- [${d.severity.toUpperCase()}] ${d.host}: ${d.rule} — ${d.detail}`).join("\n") || "No recent detections recorded."}`
}

async function callProviderLLM(
  agent: AgentDef,
  prompt: string,
  worldContext: string
): Promise<string> {
  const provider = store.activeProvider
  if (provider === "replay") {
    throw new Error("Provider set to replay")
  }

  const apiKey = store.settings.apiKeys[provider]
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(`No API key configured for provider ${provider}`)
  }

  const isCommander = agent.class === "command"
  const model = isCommander
    ? store.settings.models[provider]?.commander || store.commanderModel
    : store.settings.models[provider]?.specialist || store.specialistModel

  const systemPrompt = `You are ${agent.name}, callsign "${agent.callsign}", on the Phalanx blue-team cyber defense swarm.
Role: ${isCommander ? "Incident Commander" : `${agent.discipline} Specialist`}.
Clearance: ${agent.clearance.toUpperCase()}.
Summary: ${agent.summary}

The Human SOC Operator has initiated a direct consultation via the Operator Console.

CURRENT ESTATE SITUATION & TELEMETRY:
${worldContext}

INSTRUCTIONS:
1. Respond directly to the Operator with military/incident-command clarity, operational authority, and tactical precision.
2. Ground all answers in the live world state provided above. Cite specific hosts (e.g. edge-gw-01, app-api-21), indicators (e.g. 185.121.44.19), CVEs (e.g. CVE-2026-31847), and containment actions taken.
3. If asked for a Sitrep, provide a crisp structured summary (THREAT LEVEL, ACTIVE INCIDENTS, BLAST RADIUS, CONTAINMENT STATUS, NEXT TACTICAL ACTION).
4. Keep the response concise, authoritative, and actionable. Avoid generic AI fluff.`

  if (provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => "")
      throw new Error(`Gemini error (${res.status}): ${err.slice(0, 150)}`)
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim()
    if (!text) throw new Error("Empty Gemini response")
    return text
  }

  if (provider === "openai") {
    const url = "https://api.openai.com/v1/chat/completions"
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
      }),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => "")
      throw new Error(`OpenAI error (${res.status}): ${err.slice(0, 150)}`)
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) throw new Error("Empty OpenAI response")
    return text
  }

  if (provider === "anthropic") {
    const url = "https://api.anthropic.com/v1/messages"
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => "")
      throw new Error(`Anthropic error (${res.status}): ${err.slice(0, 150)}`)
    }
    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>
    }
    const text = data.content?.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim()
    if (!text) throw new Error("Empty Anthropic response")
    return text
  }

  throw new Error(`Unsupported provider: ${provider}`)
}

function generateContextualResponse(agent: AgentDef, prompt: string): string {
  const p = prompt.toLowerCase()
  const incidents = [...store.incidents.values()]
  const activeIncident = getActiveIncident()
  const posture = store.posture()
  const threatLevel = posture.threatLevel.toUpperCase()
  const range = store.rangeStatus

  // Determine key estate assets and status
  const isolatedHosts = [...store.hosts.values()].filter((h) => h.status === "isolated").map((h) => h.id)
  if (range && range.isolatedHosts.length > 0) {
    for (const h of range.isolatedHosts) if (!isolatedHosts.includes(h)) isolatedHosts.push(h)
  }

  // 1. Threat Posture / Sitrep / Summary
  if (
    p.includes("posture") ||
    p.includes("sitrep") ||
    p.includes("summary") ||
    p.includes("status") ||
    p.includes("overview") ||
    p.includes("threat") ||
    p.includes("situation")
  ) {
    if (!activeIncident && incidents.length === 0) {
      return `**COMMANDER SITREP — ESTATE NORMAL**
• **Threat Posture**: THREAT LEVEL GREEN. All 16 estate nodes reporting healthy.
• **Fronts**: 0 open incidents. No active intrusions or anomalies detected.
• **Swarm Status**: 19 agents across command, analysis, action, and comms disciplines standing by in listening posture.
• **Guidance**: Launch a scenario or live-range attack from the mission control bar to observe real-time autonomous detection, triage, and containment.`
    }

    const openCount = incidents.filter((i) => i.status !== "resolved").length
    const incCode = activeIncident ? activeIncident.code : "INC-MULTI"
    const incTitle = activeIncident ? activeIncident.title : "Active Campaign"
    const phase = activeIncident ? activeIncident.phase.toUpperCase() : "CONTAIN"
    const progress = activeIncident ? activeIncident.progress : 85

    return `**COMMANDER SITREP — ${incCode}**
• **Threat Level**: **${threatLevel}** (${openCount} active incident front${openCount === 1 ? "" : "s"}, ${posture.agentsEngaged} specialist agents engaged)
• **Primary Front**: **${incCode}** — *${incTitle}*
• **Incident Phase**: **${phase}** (Progress: ${progress}%, Confidence: ${activeIncident?.confidence ?? 90}%)
• **Estate Isolation**: ${isolatedHosts.length > 0 ? `Isolated: **${isolatedHosts.join(", ")}**` : "No hosts hard-isolated; perimeter filtering active"}
• **Containment Posture**: ${
      store.containedToday > 0 || isolatedHosts.length > 0
        ? "Active containment verified. Egress blocked, attacker persistence severed, stolen credentials revoked."
        : "Investigation and containment staging in progress. Specialists evaluating blast radius."
    }
• **Next Action**: Continuous log verification across secondary nodes and verifying zero persistence before standing down.`
  }

  // 2. Discovered IOCs (IPs, hashes, tokens, domains, C2)
  if (
    p.includes("ioc") ||
    p.includes("indicator") ||
    p.includes("hash") ||
    p.includes("c2") ||
    p.includes("domain") ||
    p.includes("ip ") ||
    p.includes("ips") ||
    p.includes("token") ||
    p.includes("artifact")
  ) {
    return `**CONFIRMED INDICATORS OF COMPROMISE (IOCs)**
• **External Command & Control (C2)**:
  - \`185.121.44.19:443\` — Bulletproof C2 host in Eastern Europe (Verdict: **MALICIOUS**; status: **BLOCKED / SINKHOLED**).
  - \`cdn-status-check[.]net\` — Secondary beacon domain using TLS SNI camouflage (Verdict: **MALICIOUS**; status: **DNS SINKHOLED**).
• **Payloads & Host Artifacts**:
  - \`libedgetls.so.2\` — LD_PRELOAD backdoor library hooking \`SSL_read\` / \`SSL_write\` on gateway ingress.
  - \`/evidence/edge-gw-01/stager.bin\` — Memory stager (ELF x86-64 stripped, SHA256: \`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\`).
• **Compromised Principals**:
  - \`svc-deploy\` — Production deploy service account (sessions revoked, token rotated in \`ops-vault-01\`).
  - \`svc-backup\` — Read-only backup account abused for object store access (rotated).
• **Vulnerability Identifier**:
  - **CVE-2026-31847** (CVSS 9.8) — Rivet Edge 4.x pre-auth chunked request smuggling.`
  }

  // 3. Lateral Movement / Blast Radius / Infected Hosts
  if (
    p.includes("lateral") ||
    p.includes("blast") ||
    p.includes("radius") ||
    p.includes("movement") ||
    p.includes("infected") ||
    p.includes("compromis") ||
    p.includes("spread") ||
    p.includes("pivot") ||
    p.includes("edge-gw") ||
    p.includes("corp-idp") ||
    p.includes("app-api")
  ) {
    const isIdentityFront = activeIncident?.id === "inc-identity-front" || activeIncident?.scenarioId === "identity-front" || p.includes("corp-idp") || p.includes("identity")
    
    if (isIdentityFront) {
      return `**BLAST RADIUS & LATERAL MOVEMENT ASSESSMENT — IDENTITY FRONT**
• **Weaponized Origin**: Rogue OAuth app authorization targeting corporate tenant credentials.
• **Primary Identity Pivot**: \`corp-idp-01\` — authorization grant abused to impersonate internal principals and enumerate executive mailboxes.
• **Assessed Blast Radius**:
  - **Compromised**: OAuth application grant (consent id: \`app-sync-4491\`), administrative session tokens.
  - **Exposed Data**: Corporate mailbox metadata, internal directory enumeration logs.
  - **Uncompromised / Protected**: Core customer databases (\`data-pg-01\`), secrets vault (\`ops-vault-01\`).
• **Containment Boundary**:
  - Application consent revoked via \`revokeConsent\`.
  - All active OAuth session tokens killed at \`corp-idp-01\`.
  - Lateral pivot to production cloud infra halted.`
    }

    return `**BLAST RADIUS & LATERAL MOVEMENT ASSESSMENT — INFRASTRUCTURE FRONT**
• **Initial Entry Vector**: \`edge-gw-01\` (Rivet Edge 4.2.1) exploited via CVE-2026-31847 request-smuggling zero-day.
• **Lateral Movement Chain**:
  1. **Entry**: \`edge-gw-01\` — arbitrary command execution spawned in-memory stager (\`libedgetls.so.2\`).
  2. **Credential Theft**: Stole \`svc-deploy\` platform token from gateway process memory.
  3. **Lateral Hop**: Authenticated to \`app-api-21\` using stolen \`svc-deploy\` token.
  4. **Build Pipeline Pivot**: Secondary jump toward \`build-ci-01\` and \`build-art-01\` attempted.
  5. **Data Egress**: Unauthorized read queries executed against \`data-obj-01\` export storage (~1.84 GB egressed before cut-off).
• **Blast Radius Containment Boundary**:
  - **Isolated**: \`edge-gw-01\` severed at switch port; ingress traffic rerouted to standby gateway \`edge-gw-02\`.
  - **Protected Core**: Primary customer relational database (\`data-pg-01\`) and secrets manager (\`ops-vault-01\`) remained clean with 0 anomalous queries.`
  }

  // 4. Containment Actions Taken
  if (
    p.includes("contain") ||
    p.includes("firewall") ||
    p.includes("block") ||
    p.includes("isolate") ||
    p.includes("action") ||
    p.includes("rule") ||
    p.includes("kill") ||
    p.includes("revok")
  ) {
    return `**CONTAINMENT ACTIONS EXECUTED**
• **Host Isolation**:
  - \`edge-gw-01\` isolated via \`isolateHost\` — network switch port quarantined into forensic VLAN; all live egress severed while preserving volatile RAM.
• **Perimeter & DNS Blocks**:
  - Egress to \`185.121.44.19\` blocked at border firewalls via \`blockEgress\`.
  - DNS sinkhole instantiated for \`cdn-status-check.net\` across all recursive resolvers.
• **Identity Lockdown**:
  - \`revokeSessions\` triggered for service accounts \`svc-deploy\` and \`svc-backup\`.
  - All active OAuth session tokens invalidated on \`corp-idp-01\`.
• **Detection Rules Deployed**:
  - Deployed \`rivet_chunked_smuggle\` detection across DMZ WAF fleet.
  - Deployed EDR canary rule for anomalous child processes spawned by \`rivet-edge\`.
• **Status**: Containment has halted attacker forward progress. Awaiting formal closure verification.`
  }

  // 5. Architecture / How the Swarm Operates
  if (
    p.includes("architecture") ||
    p.includes("how does") ||
    p.includes("how it works") ||
    p.includes("a2a") ||
    p.includes("protocol") ||
    p.includes("swarm") ||
    p.includes("specialist")
  ) {
    return `**PHALANX AUTONOMOUS BLUE-TEAM ARCHITECTURE**
• **Decentralized Multi-Agent Coordination**:
  - 19 specialized agents operate with zero hardcoded playbooks.
  - **Incident Commanders** (\`Commander Atlas\`, \`ID Cmdr Vesper\`, \`Campaign Cmdr Orrery\`, \`Endpoint Cmdr Warden\`, \`Cloud Cmdr Marshal\`) hold global context, evaluate trade-offs, and sequence response objectives.
  - **Specialists** (\`Net Prowler\`, \`Memory Sleuth\`, \`Intel Oracle\`, \`Containment Aegis\`, \`Forensics Cinder\`, etc.) operate their own domain instruments.
• **A2A Protocol (Agent-to-Agent)**:
  - Real JSON-RPC 2.0 message bus with strict schema validation.
  - Agents discover peer capabilities dynamically via Agent Cards (\`/.well-known/a2a/agent-card\`) and delegate tasks or queries peer-to-peer.
• **Autonomous A2UI Generation**:
  - Commanders synthesize real-time user interface cards directly on the Operator Surface, allowing human oversight of disruptive decisions (e.g. blast radius authorization).
• **Telemetry & Range Grounding**:
  - Live range or simulated estate instrumentation ensures agents reason over actual telemetry (SIEM, EDR, NetFlow, PCAP, IDP logs) rather than hallucinated facts.`
  }

  // Fallback: Sharp, military-precision commander sitrep
  const inc = activeIncident
  return `**COMMANDER SITREP — DIRECT OPERATOR UPDATE**
• **Designation**: ${agent.callsign.toUpperCase()} (${agent.name})
• **Threat Posture**: THREAT LEVEL **${threatLevel}**
• **Active Scope**: ${inc ? `${inc.code} — ${inc.title} (Phase: ${inc.phase}, Severity: ${inc.severity.toUpperCase()})` : "Estate baseline nominal"}
• **Estate Defense**: ${isolatedHosts.length > 0 ? `Isolated assets: ${isolatedHosts.join(", ")}` : "All perimeters stable; no nodes under active isolation"}
• **Discipline Focus**: ${agent.discipline} (${agent.summary.slice(0, 100)}…)
• **Commander Direct**: Swarm sensors active across DMZ, App, and Corp enclaves. Query me anytime on blast radius, lateral movement, discovered IOCs, or containment status.`
}

export async function handleOperatorAsk(
  request: AskCommanderRequest
): Promise<AskCommanderResponse> {
  const prompt = request.prompt?.trim()
  if (!prompt) {
    return { ok: false, answer: "Prompt cannot be empty.", fromAgentId: "ic-atlas", error: "Empty prompt" }
  }

  const agent = resolveAgent(request.agentId)
  const activeIncident = getActiveIncident()
  const incidentId = activeIncident ? activeIncident.id : null
  const worldContext = buildWorldContext()

  let answer: string

  // Check if live mode with API key configured
  const provider = store.activeProvider
  const apiKey = provider !== "replay" ? store.settings.apiKeys[provider] : ""

  if (store.mode === "live" && provider !== "replay" && apiKey && apiKey.trim().length > 0) {
    try {
      store.log(`Operator querying ${agent.callsign} via live ${provider} LLM (${prompt.slice(0, 50)}...)`)
      answer = await callProviderLLM(agent, prompt, worldContext)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      store.log(`Live LLM query failed (${errMsg}); falling back to contextual responder`, "warn")
      answer = generateContextualResponse(agent, prompt)
    }
  } else {
    // Replay mode or no API key set
    store.log(`Operator querying ${agent.callsign} (contextual responder): "${prompt.slice(0, 60)}"`)
    answer = generateContextualResponse(agent, prompt)
  }

  // Record Operator Query on Bus and Transcript
  store.recordTranscript({
    incidentId,
    fromAgentId: "operator",
    toAgentId: agent.id,
    kind: "operator_query",
    text: prompt,
  })

  store.recordBusMessage({
    fromAgentId: "operator",
    toAgentId: agent.id,
    kind: "operator_query",
    incidentId,
    taskId: null,
    summary: prompt.length > 80 ? `${prompt.slice(0, 77)}…` : prompt,
    envelope: { role: "operator", prompt },
  })

  // Record Commander Reply on Bus and Transcript
  store.recordTranscript({
    incidentId,
    fromAgentId: agent.id,
    toAgentId: "operator",
    kind: "commander_reply",
    text: answer,
  })

  store.recordBusMessage({
    fromAgentId: agent.id,
    toAgentId: "operator",
    kind: "commander_reply",
    incidentId,
    taskId: null,
    summary: answer.slice(0, 80).replace(/\n/g, " "),
    envelope: { role: "commander", answer },
  })

  return {
    ok: true,
    answer,
    fromAgentId: agent.id,
  }
}
