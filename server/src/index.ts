import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { existsSync, readFileSync, statSync } from "node:fs"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import { dispatch } from "./a2a/transport.ts"
import { PHALANX_CATALOG } from "./a2ui/types.ts"
import { registerLiveHandlers } from "./agents/runtime.ts"
import { pace, registerReplayHandlers } from "./agents/replay.ts"
import { ROSTER } from "./agents/roster.ts"
import type { PhalanxEvent } from "./model.ts"
import {
  coordinateCommanders,
  listScenarios,
  refreshMissionControl,
  refuseCampaignReason,
  refuseReason,
  resetWorld,
  runCampaign,
  killRangeSync,
  runRange,
  runRangeCampaign,
  runRangeMultiFront,
  runScenario,
  stopRange,
} from "./runner.ts"
import { store, WorldResetError } from "./store.ts"
import { setSource } from "./tools/source.ts"

function ignoreReset(error: unknown) {
  if (error instanceof WorldResetError || (error && typeof error === "object" && (error as Error).name === "WorldResetError")) return
  console.error("Task execution error:", error)
}
import { simSource } from "./tools/sim-source.ts"
import { readEvents, readState } from "./range/events.ts"
import { saveSettings, toPublicSettings, type PhalanxSettings } from "./config.ts"
import { testProviderKey } from "./agents/provider-runner.ts"
import { handleOperatorAsk } from "./agents/operator-ask.ts"

const here = dirname(fileURLToPath(import.meta.url))
const WEBDIST = join(here, "..", "webdist")
const PORT = Number(process.env.PHALANX_PORT ?? process.env.ESPER_PORT ?? 8095)

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  })
  res.end(payload)
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    return {}
  }
}

function baseUrl(req: IncomingMessage): string {
  const host = req.headers.host ?? `127.0.0.1:${PORT}`
  return `http://${host}`
}


function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string, headOnly = false): boolean {
  if (pathname.startsWith("/api/") || pathname.startsWith("/.well-known/")) return false
  if (!existsSync(WEBDIST)) return false
  const relative = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^(\.\.[/\\])+/, "")
  const candidate = join(WEBDIST, relative)
  if (candidate.startsWith(WEBDIST) && existsSync(candidate) && statSync(candidate).isFile()) {
    res.writeHead(200, { "content-type": MIME[extname(candidate)] ?? "application/octet-stream" })
    if (headOnly) res.end()
    else res.end(readFileSync(candidate))
    return true
  }
  const index = join(WEBDIST, "index.html")
  if (existsSync(index)) {
    res.writeHead(200, { "content-type": MIME[".html"] })
    if (headOnly) res.end()
    else res.end(readFileSync(index))
    return true
  }
  return false
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", baseUrl(req))
  store.baseUrl = baseUrl(req)
  const path = url.pathname
  const method = req.method ?? "GET"

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    })
    res.end()
    return
  }

  if (path === "/healthz") {
    json(res, 200, { ok: true, mode: store.mode, agents: ROSTER.length })
    return
  }

  /* ---- state and stream ------------------------------------------------ */

  if (path === "/api/state") {
    json(res, 200, store.snapshot(baseUrl(req)))
    return
  }

  if (path === "/api/stream") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      "access-control-allow-origin": "*",
    })
    const send = (event: PhalanxEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }
    send({ kind: "snapshot", at: new Date().toISOString(), snapshot: store.snapshot(baseUrl(req)) })
    const unsubscribe = store.subscribe(send)
    const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000)
    req.on("close", () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
    return
  }

  /* ---- run control ------------------------------------------------------ */

  if (path === "/api/scenarios" && method === "GET") {
    json(res, 200, { scenarios: listScenarios(), mode: store.mode })
    return
  }

  const runMatch = /^\/api\/scenarios\/([\w-]+)\/run$/.exec(path)
  if (runMatch && method === "POST") {
    const scenarioId = runMatch[1]!
    const refusal = refuseReason(scenarioId)
    if (refusal) {
      json(res, 409, { started: null, reason: refusal })
      return
    }
    void runScenario(scenarioId).catch(ignoreReset)
    json(res, 202, { started: scenarioId })
    return
  }

  if (path === "/api/campaign/run" && method === "POST") {
    const refusal = refuseCampaignReason()
    if (refusal) {
      json(res, 409, { started: null, reason: refusal })
      return
    }
    void runCampaign().catch(ignoreReset)
    json(res, 202, { started: "campaign" })
    return
  }

  if (path === "/api/coordinate" && method === "POST") {
    void coordinateCommanders().catch(ignoreReset)
    json(res, 202, { started: "coordination" })
    return
  }

  if (path === "/api/range/run" && method === "POST") {
    if (store.rangeStatus) {
      json(res, 409, { started: null, reason: "The range is already running. Reset to run it again." })
      return
    }
    void runRange().catch(ignoreReset)
    json(res, 202, { started: "range" })
    return
  }

  if (path === "/api/range/campaign/run" && method === "POST") {
    if (store.rangeStatus) {
      json(res, 409, { started: null, reason: "The range is already running. Reset to run it again." })
      return
    }
    void runRangeCampaign().catch(ignoreReset)
    json(res, 202, { started: "range-campaign" })
    return
  }

  if (path === "/api/range/multi/run" && method === "POST") {
    if (store.rangeStatus) {
      json(res, 409, { started: null, reason: "The range is already running. Reset to run it again." })
      return
    }
    void runRangeMultiFront().catch(ignoreReset)
    json(res, 202, { started: "range-multi" })
    return
  }

  if (path === "/api/range/stop" && method === "POST") {
    void stopRange().then(() => setSource(simSource)).catch(ignoreReset)
    json(res, 202, { stopped: "range" })
    return
  }

  if (path === "/api/range/status" && method === "GET") {
    const disk = await readState()
    json(res, 200, { status: store.rangeStatus, disk })
    return
  }

  if (path === "/api/range/events" && method === "GET") {
    const events = await readEvents()
    json(res, 200, { events: events.slice(-200) })
    return
  }

  if (path === "/api/reset" && method === "POST") {
    await resetWorld()
    json(res, 200, { ok: true })
    return
  }

  /* ---- settings --------------------------------------------------------- */

  if (path === "/api/settings" && method === "GET") {
    json(res, 200, toPublicSettings(store.settings))
    return
  }

  if (path === "/api/settings" && method === "POST") {
    const body = (await readBody(req)) as Partial<PhalanxSettings>
    if (body.mode === "live" || body.mode === "replay") {
      store.settings.mode = body.mode
      store.mode = body.mode
    }
    if (body.activeProvider && ["gemini", "anthropic", "openai", "replay"].includes(body.activeProvider)) {
      store.settings.activeProvider = body.activeProvider
      store.activeProvider = body.activeProvider
    }
    if (body.apiKeys) {
      if (typeof body.apiKeys.gemini === "string") store.settings.apiKeys.gemini = body.apiKeys.gemini.trim()
      if (typeof body.apiKeys.anthropic === "string") store.settings.apiKeys.anthropic = body.apiKeys.anthropic.trim()
      if (typeof body.apiKeys.openai === "string") store.settings.apiKeys.openai = body.apiKeys.openai.trim()
    }
    if (body.models) {
      if (body.models.gemini) store.settings.models.gemini = { ...store.settings.models.gemini, ...body.models.gemini }
      if (body.models.anthropic) store.settings.models.anthropic = { ...store.settings.models.anthropic, ...body.models.anthropic }
      if (body.models.openai) store.settings.models.openai = { ...store.settings.models.openai, ...body.models.openai }
    }
    saveSettings(store.settings)

    if (store.mode === "live") {
      registerLiveHandlers()
      store.log(`Live swarm active via ${store.activeProvider} (commander: ${store.commanderModel}, specialist: ${store.specialistModel})`)
    } else {
      registerReplayHandlers()
      store.log("Swarm switched to replay mode (deterministic director).")
    }
    store.broadcastSnapshot()
    json(res, 200, { ok: true, settings: toPublicSettings(store.settings) })
    return
  }

  if (path === "/api/settings/test-key" && method === "POST") {
    const body = (await readBody(req)) as { provider: "gemini" | "anthropic" | "openai"; apiKey?: string; model?: string }
    const key = body.apiKey || store.settings.apiKeys[body.provider] || ""
    const result = await testProviderKey({
      provider: body.provider,
      apiKey: key,
      model: body.model,
    })
    json(res, 200, result)
    return
  }

  /* ---- operator chat ---------------------------------------------------- */

  if (path === "/api/chat/ask" && method === "POST") {
    const body = (await readBody(req)) as { prompt?: string; agentId?: string }
    const result = await handleOperatorAsk({
      prompt: body.prompt ?? "",
      agentId: body.agentId,
    })
    json(res, result.ok ? 200 : 400, result)
    return
  }

  /* ---- read models ------------------------------------------------------ */

  if (path === "/api/incidents" && method === "GET") {
    json(res, 200, { incidents: [...store.incidents.values()] })
    return
  }

  const incidentMatch = /^\/api\/incidents\/([\w-]+)$/.exec(path)
  if (incidentMatch && method === "GET") {
    const incident = store.incidents.get(incidentMatch[1]!)
    if (!incident) {
      json(res, 404, { error: "no such incident" })
      return
    }
    json(res, 200, {
      incident,
      bus: store.bus.filter((message) => message.incidentId === incident.id),
      surface: store.surfaces.get(incident.surfaceId) ?? null,
    })
    return
  }

  if (path === "/api/agents" && method === "GET") {
    json(res, 200, {
      agents: ROSTER,
      runtime: [...store.runtime.values()],
      cards: ROSTER.map((def) => store.agentCard(def.id, baseUrl(req))),
    })
    return
  }

  /* ---- A2A -------------------------------------------------------------- */

  if (path === "/.well-known/a2a/agent-card") {
    json(res, 200, {
      protocolVersion: "0.3.0",
      name: "Phalanx Blue Team",
      description:
        "A swarm of autonomous incident-response agents. Each member publishes its own agent card under /api/a2a/agents/{id}/.well-known/agent-card.json.",
      url: `${baseUrl(req)}/api/a2a`,
      version: "1.0.0",
      provider: { organization: "Phalanx", url: baseUrl(req) },
      capabilities: { streaming: true, pushNotifications: false, extendedAgentCard: false },
      defaultInputModes: ["text/plain", "application/json"],
      defaultOutputModes: ["text/plain", "application/json"],
      skills: ROSTER.flatMap((def) => def.skills.map((skill) => ({ ...skill, id: `${def.id}/${skill.id}` }))),
      members: ROSTER.map((def) => `${baseUrl(req)}/api/a2a/agents/${def.id}/.well-known/agent-card.json`),
    })
    return
  }

  if (path === "/api/a2a/agents" && method === "GET") {
    json(res, 200, { cards: ROSTER.map((def) => store.agentCard(def.id, baseUrl(req))) })
    return
  }

  const cardMatch = /^\/api\/a2a\/agents\/([\w-]+)\/\.well-known\/agent-card\.json$/.exec(path)
  if (cardMatch) {
    const agentId = cardMatch[1]!
    if (!ROSTER.some((def) => def.id === agentId)) {
      json(res, 404, { error: "no such agent" })
      return
    }
    json(res, 200, store.agentCard(agentId, baseUrl(req)))
    return
  }

  const rpcMatch = /^\/api\/a2a\/agents\/([\w-]+)$/.exec(path)
  if (rpcMatch && method === "POST") {
    const body = (await readBody(req)) as Parameters<typeof dispatch>[1]
    const response = await dispatch(rpcMatch[1]!, body)
    json(res, 200, response)
    return
  }

  /* ---- A2UI ------------------------------------------------------------- */

  if (path === "/api/a2ui/catalog.json") {
    json(res, 200, PHALANX_CATALOG)
    return
  }

  const surfaceMatch = /^\/api\/a2ui\/surfaces\/(.+)$/.exec(path)
  if (surfaceMatch && method === "GET") {
    const surface = store.surfaces.get(decodeURIComponent(surfaceMatch[1]!))
    if (!surface) {
      json(res, 404, { error: "no such surface" })
      return
    }
    json(res, 200, surface)
    return
  }

  if (path === "/api/a2ui/action" && method === "POST") {
    const body = (await readBody(req)) as { actionId?: string; surfaceId?: string; payload?: Record<string, unknown> }
    store.log(`Operator action "${body.actionId}" on ${body.surfaceId}`)
    const incidentId = body.surfaceId?.startsWith("incident:") ? body.surfaceId.slice("incident:".length) : null
    if (incidentId && store.incidents.has(incidentId)) {
      const incident = store.incidents.get(incidentId)!
      store.appendTimeline(incidentId, {
        actor: incident.commanderId,
        text: `Operator responded to the card: ${body.actionId}.`,
        tone: "info",
      })
    }
    json(res, 202, { accepted: true })
    return
  }

  /* ---- static ----------------------------------------------------------- */
  const headOnly = method === "HEAD"
  if ((method === "GET" || headOnly) && serveStatic(req, res, path, headOnly)) return

  json(res, 404, { error: "not found", path })
})

// Best-effort: a previous phalanx server that was killed abruptly can leave its
// range child processes orphaned on the range ports. Sweep them on boot so a
// fresh start never collides with a stale, out-of-date estate.
try {
  const { execSync } = await import("node:child_process")
  execSync("pkill -9 -f 'range/host.ts' 2>/dev/null; pkill -9 -f 'range/attack.ts' 2>/dev/null; true", { stdio: "ignore" })
} catch {
  // pkill unavailable or nothing to kill — fine.
}

setSource(simSource)
if (store.mode === "live") {
  registerLiveHandlers()
  store.log(`Live mode — provider: ${store.activeProvider}, commanders on ${store.commanderModel}, specialists on ${store.specialistModel}.`)
} else {
  registerReplayHandlers()
  pace.factor = Math.max(0.25, Number(process.env.PHALANX_TICK_MS ?? process.env.ESPER_TICK_MS ?? 1500) / 600)
  store.log("Replay mode — deterministic director, no model calls.")
}
refreshMissionControl()

// Range children are our child processes; make sure they die with us rather
// than orphaning onto a range port and poisoning the next run. exit does not
// fire on signals, so handle those explicitly, then leave cleanly.
process.on("exit", () => killRangeSync())
process.on("SIGINT", () => {
  killRangeSync()
  process.exit(0)
})
process.on("SIGTERM", () => {
  killRangeSync()
  process.exit(0)
})
process.on("unhandledRejection", (reason) => {
  if (reason instanceof WorldResetError || (reason && typeof reason === "object" && (reason as Error).name === "WorldResetError")) {
    return
  }
  console.error("Unhandled promise rejection in phalanx-server:", reason)
})

server.listen(PORT, "0.0.0.0", () => {
  process.stdout.write(`phalanx listening on http://0.0.0.0:${PORT} (${store.mode} mode, provider: ${store.activeProvider}, ${ROSTER.length} agents)\n`)
})
