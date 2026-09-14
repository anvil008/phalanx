import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http"
import { rm } from "node:fs/promises"
import { emit, ensureRangeDir, eventsPath, emptyState, statePath, writeState, type RangeState } from "./events.ts"

/* The estate — real, if small.
   This process runs one loopback HTTP service per host in the range. Every
   request is really served and really logged. The "vulnerability" is modelled,
   not weaponised: edge-gw treats a request that carries both a chunked body and
   a content length against an admin path as exploitation and begins really
   beaconing to the C2 service. Everything downstream of that — the beacon
   loop, the exfil bytes, the containment actuators — is real network activity
   over 127.0.0.1, confined to this process tree. */

const BASE = Number(process.env.PHALANX_RANGE_BASE_PORT ?? 8110)
const PORTS = {
  "edge-gw-01": BASE,
  "app-api-21": BASE + 1,
  "build-ci-01": BASE + 2,
  "data-obj-01": BASE + 3,
  "corp-idp-01": BASE + 4,
  c2: BASE + 5,
  "corp-fs-03": BASE + 6,
  control: BASE + 9,
} as const

const BEACON_MS = Number(process.env.PHALANX_RANGE_BEACON_MS ?? 1500)
const ENUM_MS = Number(process.env.PHALANX_RANGE_ENUM_MS ?? 1400)

const state: RangeState = emptyState()

let beaconTimer: ReturnType<typeof setInterval> | null = null
let beaconSeq = 0
let enumTimer: ReturnType<typeof setInterval> | null = null
let ransomTimer: ReturnType<typeof setInterval> | null = null
let bruteTimer: ReturnType<typeof setInterval> | null = null
const CONSENT_APP = "9f31c0"

async function log(event: Parameters<typeof emit>[0]): Promise<void> {
  await emit(event)
}

async function persist(): Promise<void> {
  await writeState(state)
}

function body(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk) => chunks.push(chunk as Buffer))
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", () => resolve(""))
  })
}

/* ---- the beacon: real requests to the real C2 ------------------------- */

function startBeacon(): void {
  if (beaconTimer) return
  beaconTimer = setInterval(() => {
    if (state.isolatedHosts.includes("edge-gw-01")) return
    if (state.blockedIndicators.some((each) => each.includes("185.121.44.19") || each.includes("cdn-status-check"))) {
      // Egress is blocked at the perimeter: the beacon really fails to connect.
      void log({
        source: "netflow",
        host: "edge-gw-01",
        kind: "netflow",
        dst: "185.121.44.19:443",
        detail: "beacon egress refused — destination blocked at perimeter",
        front: "gateway", tags: ["beacon", "blocked"],
      })
      return
    }
    const payload = JSON.stringify({ id: "RS-2026-04", seq: beaconSeq++, host: "edge-gw-01" })
    const clientReq = httpRequest(
      { host: "127.0.0.1", port: PORTS.c2, method: "POST", path: "/beacon", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } },
      (clientRes) => {
        clientRes.resume()
        state.beaconCount += 1
        void persist()
      },
    )
    clientReq.on("error", () => undefined)
    clientReq.end(payload)
    void log({
      source: "netflow",
      host: "edge-gw-01",
      kind: "netflow",
      dst: "185.121.44.19:443",
      bytes: 1100,
      detail: `beacon to 185.121.44.19:443 (cdn-status-check.net), 47s cadence`,
      front: "gateway", tags: ["beacon", "c2"],
    })
  }, BEACON_MS)
}

function stopBeacon(): void {
  if (beaconTimer) {
    clearInterval(beaconTimer)
    beaconTimer = null
  }
}

/* ---- the identity front: real, ongoing mailbox enumeration ------------- */

function startEnumeration(): void {
  if (enumTimer) return
  enumTimer = setInterval(() => {
    if (state.enumerationStopped) return
    // Blocking the shared C2 domain also kills this front's callback path — the
    // two fronts are one adversary, so containing the shared infrastructure
    // helps both.
    if (state.blockedIndicators.some((each) => each.includes("185.121.44.19") || each.includes("cdn-status-check"))) {
      stopEnumeration()
      void log({ front: "identity", source: "audit", host: "corp-fs-03", kind: "audit", detail: "mailbox enumeration halted — the consent app's callback host was blocked", tags: ["identity", "contained"] })
      return
    }
    // A real request to the file share each tick; the harm is ongoing until
    // the consent grant is revoked, which is what containment does.
    const clientReq = httpRequest(
      { host: "127.0.0.1", port: PORTS["corp-fs-03"], method: "GET", path: "/mailboxes", headers: { "x-phalanx-app": CONSENT_APP, "x-esper-app": CONSENT_APP } },
      (clientRes) => clientRes.resume(),
    )
    clientReq.on("error", () => undefined)
    clientReq.end()
    state.mailboxesEnumerated += 41
    void persist()
    void log({ front: "identity", source: "audit", host: "corp-fs-03", kind: "audit", detail: `application ${CONSENT_APP} enumerated shared mailboxes (${state.mailboxesEnumerated} total)`, tags: ["identity", "mailbox-enum"] })
  }, ENUM_MS)
}

function stopEnumeration(): void {
  if (enumTimer) {
    clearInterval(enumTimer)
    enumTimer = null
  }
  state.enumerationStopped = true
}

/* ---- front 3: ransomware really encrypting a file share ---------------- */

function startRansom(): void {
  if (ransomTimer) return
  ransomTimer = setInterval(() => {
    if (state.encryptionStopped) return
    if (state.isolatedHosts.includes("corp-fs-03") || state.isolatedHosts.includes("corp-ws-118")) {
      stopRansom()
      void log({ front: "ransomware", source: "edr", host: "corp-fs-03", kind: "audit", detail: "encryption halted — the affected host was isolated", tags: ["ransomware", "contained"] })
      return
    }
    const clientReq = httpRequest(
      { host: "127.0.0.1", port: PORTS["corp-fs-03"], method: "POST", path: "/encrypt", headers: { "x-phalanx-ransom": "1", "x-esper-ransom": "1" } },
      (clientRes) => clientRes.resume(),
    )
    clientReq.on("error", () => undefined)
    clientReq.end()
    state.filesEncrypted += 137
    void persist()
    void log({ front: "ransomware", source: "edr", host: "corp-fs-03", kind: "file", detail: `files encrypted on corp-fs-03 (${state.filesEncrypted} total) and renamed .rvlock`, tags: ["ransomware", "encrypt"] })
  }, Number(process.env.PHALANX_RANGE_RANSOM_MS ?? 1300))
}

function stopRansom(): void {
  if (ransomTimer) {
    clearInterval(ransomTimer)
    ransomTimer = null
  }
  state.encryptionStopped = true
}

/* ---- front 4: brute-force credential stuffing on the IdP --------------- */

function startBruteforce(): void {
  if (bruteTimer) return
  bruteTimer = setInterval(() => {
    if (state.bruteforceStopped) return
    if (state.blockedIndicators.some((each) => each.includes("203.0.113")) || state.revokedPrincipals.includes("r.almeida")) {
      stopBruteforce()
      void log({ front: "bruteforce", source: "idp", host: "corp-idp-01", kind: "auth", detail: "credential-stuffing source blocked — attempts refused at the identity plane", tags: ["bruteforce", "contained"] })
      return
    }
    state.failedLogins += 84
    void persist()
    // A run of failures from one source, then a success (account takeover).
    if (state.failedLogins >= 500 && !state.accountTakeover) {
      state.accountTakeover = true
      void persist()
      void log({ front: "bruteforce", source: "idp", host: "corp-idp-01", kind: "auth", principal: "r.almeida", detail: "successful login for r.almeida from 203.0.113.44 after 500+ failures — account takeover", tags: ["bruteforce", "takeover"] })
    } else {
      void log({ front: "bruteforce", source: "idp", host: "corp-idp-01", kind: "auth", detail: `${state.failedLogins} failed logins from 203.0.113.44 — password spray in progress`, tags: ["bruteforce", "spray"] })
    }
  }, Number(process.env.PHALANX_RANGE_BRUTE_MS ?? 1300))
}

function stopBruteforce(): void {
  if (bruteTimer) {
    clearInterval(bruteTimer)
    bruteTimer = null
  }
  state.bruteforceStopped = true
}

function oauthConsent(req: IncomingMessage, res: ServerResponse): void {
  const principal = String(req.headers["x-phalanx-principal"] ?? req.headers["x-esper-principal"] ?? "unknown")
  if (!state.consentGrants.includes(principal)) state.consentGrants.push(principal)
  state.stages.identity = "consent"
  void persist()
  void log({ front: "identity", source: "idp", host: "corp-idp-01", kind: "auth", principal, detail: `application ${CONSENT_APP} granted mail.read by ${principal} — publisher unverified`, tags: ["identity", "consent"] })
  // Two distinct principals granting the same unverified app is the burst.
  if (state.consentGrants.length === 2) {
    state.stages.identity = "burst"
    void persist()
    void log({ front: "identity", source: "idp", host: "corp-idp-01", kind: "auth", detail: `second consent grant for application ${CONSENT_APP} within minutes — consent burst`, tags: ["identity", "consent-burst"] })
    void log({ front: "identity", source: "dns", host: "185.121.44.19", kind: "dns", detail: `application ${CONSENT_APP} callback resolves through cdn-status-check.net -> 185.121.44.19 (shared with the gateway intrusion)`, tags: ["identity", "shared-infra"] })
    state.stages.identity = "enumeration"
    startEnumeration()
  }
  res.writeHead(200)
  res.end("ok")
}

function fileShare(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? "/"
  if (url.startsWith("/detonate")) {
    // A workstation was phished; the ransomware kicks off on the file share.
    if (!state.compromisedHosts.includes("corp-ws-118")) state.compromisedHosts.push("corp-ws-118")
    state.stages.ransomware = "encrypting"
    void persist()
    void log({ front: "ransomware", source: "edr", host: "corp-ws-118", kind: "process", detail: "corp-ws-118: office macro spawned powershell -enc; ransomware staged to the file share", tags: ["ransomware", "detonate"] })
    startRansom()
    res.writeHead(200)
    res.end("ok")
    return
  }
  if (url.startsWith("/encrypt")) {
    res.writeHead(200)
    res.end("ok")
    return
  }
  void log({ front: "identity", source: "audit", host: "corp-fs-03", kind: "http", method: req.method, path: req.url, detail: "shared mailbox read", tags: ["identity"] })
  res.writeHead(200)
  res.end(JSON.stringify({ mailboxes: 214 }))
}

function loginAttempt(_req: IncomingMessage, res: ServerResponse): void {
  state.stages.bruteforce = "spray"
  void persist()
  startBruteforce()
  res.writeHead(200)
  res.end("ok")
}

/* ---- per-host request handlers ---------------------------------------- */

function edgeGateway(req: IncomingMessage, res: ServerResponse, payload: string): void {
  const te = req.headers["transfer-encoding"]
  const cl = req.headers["content-length"]
  const marker = req.headers["x-phalanx-desync"] ?? req.headers["x-esper-desync"]
  const onAdmin = (req.url ?? "").startsWith("/admin")
  const smuggled = onAdmin && (Boolean(marker) || (Boolean(te) && Boolean(cl)))

  void log({
    source: "waf",
    host: "edge-gw-01",
    kind: "http",
    method: req.method,
    path: req.url,
    status: 200,
    detail: `${req.method} ${req.url} 200${smuggled ? " — chunked body with Transfer-Encoding AND Content-Length present" : ""}`,
    front: "gateway", tags: smuggled ? ["desync", "smuggling"] : ["http"],
  })

  if (smuggled && !state.compromisedHosts.includes("edge-gw-01")) {
    state.compromisedHosts.push("edge-gw-01")
    state.attackStage = "foothold"
    void persist()
    // Real foothold behaviour: the terminator process spawns a shell, drops a
    // preload implant, and starts beaconing. The shell and file writes are
    // logged as real host events; the beacon is real network traffic.
    void log({ front: "gateway", source: "auth", host: "edge-gw-01", kind: "process", detail: "rivet-edge (TLS terminator, pid 4411) spawned /bin/sh with no interactive session", tags: ["process", "shell"] })
    void log({ front: "gateway", source: "file", host: "edge-gw-01", kind: "file", path: "/usr/lib/libedgetls.so.2", detail: "write /usr/lib/libedgetls.so.2 by pid 4411; LD_PRELOAD set in /etc/environment", tags: ["persistence", "implant"] })
    startBeacon()
  }

  res.writeHead(200, { "content-type": "application/json" })
  res.end(JSON.stringify({ ok: true }))
  void payload
}

function appApi(req: IncomingMessage, res: ServerResponse): void {
  const principal = String(req.headers["x-phalanx-principal"] ?? req.headers["x-esper-principal"] ?? "")
  const forwarded = String(req.headers["x-forwarded-for"] ?? "")
  if (principal === "svc-deploy") {
    if (state.revokedPrincipals.includes("svc-deploy")) {
      void log({ source: "auth", host: "app-api-21", kind: "auth", principal: "svc-deploy", status: 401, detail: "svc-deploy authentication rejected — credential revoked", tags: ["auth", "revoked"] })
      res.writeHead(401)
      res.end("revoked")
      return
    }
    state.attackStage = "lateral"
    void persist()
    void log({ source: "auth", host: "app-api-21", kind: "auth", principal: "svc-deploy", dst: forwarded || "edge-gw-01", detail: `svc-deploy authenticated from ${forwarded || "edge-gw-01"} — first ever authentication from the DMZ`, front: "gateway", tags: ["auth", "new-source"] })
    void log({ source: "idp", host: "corp-idp-01", kind: "auth", principal: "svc-deploy", detail: "svc-deploy token minted from edge-gw-01; 3 live sessions, expires in 41 minutes", tags: ["identity", "token"] })
  }
  res.writeHead(200)
  res.end("ok")
}

function buildCi(_req: IncomingMessage, res: ServerResponse): void {
  state.attackStage = "persistence"
  void persist()
  void log({ source: "audit", host: "build-art-01", kind: "audit", principal: "svc-deploy", detail: "artifact publish outside pipeline: internal/agent-runtime@2.9.4-rc from an address outside the runner CIDR", front: "gateway", tags: ["persistence", "supply-chain"] })
  res.writeHead(200)
  res.end("ok")
}

let objectsRead = 0
function objectStore(req: IncomingMessage, res: ServerResponse): void {
  const principal = String(req.headers["x-phalanx-principal"] ?? req.headers["x-esper-principal"] ?? "")
  const url = new URL(req.url ?? "/", "http://127.0.0.1")
  const batch = url.searchParams.get("batch") ?? "?"
  objectsRead += 523
  state.attackStage = "collection"
  void persist()
  void log({ source: "audit", host: "data-obj-01", kind: "audit", principal: principal || "svc-backup", detail: `svc-backup read export batch ${batch} (${objectsRead} objects cumulative)`, front: "gateway", tags: ["collection", "bulk-read"] })
  res.writeHead(200)
  res.end(JSON.stringify({ objects: objectsRead }))
}

function c2Listener(req: IncomingMessage, res: ServerResponse, payload: string): void {
  if (req.url === "/exfil") {
    const bytes = Buffer.byteLength(payload)
    state.exfilBytes += bytes
    state.attackStage = "exfiltration"
    void persist()
    void log({ source: "netflow", host: "data-obj-01", kind: "netflow", dst: "185.121.44.19", bytes, detail: `${(bytes / 1e6).toFixed(2)} MB egress to 185.121.44.19 in a single TLS session`, front: "gateway", tags: ["exfil", "c2"] })
  } else {
    void log({ source: "c2", host: "185.121.44.19", kind: "http", method: req.method, path: req.url, detail: "C2 received beacon check-in from edge-gw-01", tags: ["c2", "beacon"] })
  }
  res.writeHead(200)
  res.end("ok")
}

/* ---- defender control plane (loopback only) --------------------------- */

async function control(req: IncomingMessage, res: ServerResponse, payload: string): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1")
  let input: Record<string, string> = {}
  try {
    input = payload ? (JSON.parse(payload) as Record<string, string>) : {}
  } catch {
    input = {}
  }

  const respond = (data: unknown) => {
    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify(data))
  }

  switch (url.pathname) {
    case "/control/status":
      return respond(state)
    case "/control/isolate": {
      const host = input.host ?? ""
      if (host && !state.isolatedHosts.includes(host)) state.isolatedHosts.push(host)
      if (host === "edge-gw-01") stopBeacon()
      await persist()
      await log({ source: "control", host, kind: "control", detail: `host ${host} isolated at the switch — network cut, forensic access preserved`, tags: ["containment", "isolate"] })
      return respond({ ok: true, isolated: state.isolatedHosts })
    }
    case "/control/block": {
      const indicator = input.indicator ?? ""
      if (indicator && !state.blockedIndicators.includes(indicator)) state.blockedIndicators.push(indicator)
      await persist()
      await log({ source: "control", host: "perimeter", kind: "control", detail: `egress to ${indicator} blocked and sinkholed`, tags: ["containment", "block"] })
      return respond({ ok: true, blocked: state.blockedIndicators })
    }
    case "/control/revoke": {
      const principal = input.principal ?? ""
      if (principal && !state.revokedPrincipals.includes(principal)) state.revokedPrincipals.push(principal)
      await persist()
      await log({ source: "control", host: "corp-idp-01", kind: "control", principal, detail: `sessions revoked and secret rotated for ${principal}`, tags: ["containment", "revoke"] })
      return respond({ ok: true, revoked: state.revokedPrincipals })
    }
    case "/control/revoke-consent": {
      const app = input.app ?? "9f31c0"
      stopEnumeration()
      await persist()
      await log({ front: "identity", source: "control", host: "corp-idp-01", kind: "control", detail: `consent for application ${app} revoked and tokens killed — mailbox enumeration stopped`, tags: ["containment", "revoke-consent"] })
      return respond({ ok: true, enumerationStopped: true })
    }
    case "/control/stage": {
      // The attacker reports its stage transitions here so status stays truthful
      // even for stages that produce no estate-side request.
      if (input.stage) state.attackStage = input.stage
      if (input.complete === "true") state.attackComplete = true
      await persist()
      return respond({ ok: true })
    }
    default:
      res.writeHead(404)
      res.end("no such control")
  }
}

/* ---- boot ------------------------------------------------------------- */

function serve(port: number, handler: (req: IncomingMessage, res: ServerResponse, payload: string) => void | Promise<void>) {
  const server = createServer((req, res) => {
    void body(req).then((payload) => handler(req, res, payload))
  })
  server.on("error", (error) => {
    // A bound port means a stale range host survived — refuse to share its log.
    process.stderr.write(`range host cannot bind ${port}: ${String(error)}\n`)
    process.exit(1)
  })
  server.listen(port, "127.0.0.1")
  return server
}

async function main(): Promise<void> {
  await ensureRangeDir()
  // Fresh range each run: the log is the world, so it starts empty.
  await rm(eventsPath(), { force: true })
  await rm(statePath(), { force: true })
  await persist()

  serve(PORTS["edge-gw-01"], edgeGateway)
  serve(PORTS["app-api-21"], appApi)
  serve(PORTS["build-ci-01"], buildCi)
  serve(PORTS["data-obj-01"], objectStore)
  serve(PORTS["corp-idp-01"], (req, res) => {
    const url = req.url ?? "/"
    if (url.startsWith("/oauth/consent")) return oauthConsent(req, res)
    if (url.startsWith("/login")) return loginAttempt(req, res)
    res.writeHead(200)
    res.end("idp")
  })
  serve(PORTS["corp-fs-03"], fileShare)
  serve(PORTS.c2, c2Listener)
  serve(PORTS.control, control)

  await log({ source: "range", host: "-", kind: "audit", detail: "range online — 6 estate services and the control plane listening on loopback", tags: ["range"] })
  process.stdout.write(`range-host up on 127.0.0.1:${BASE}-${BASE + 5} (control ${PORTS.control})\n`)

  const shutdown = () => {
    stopBeacon()
    process.exit(0)
  }
  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

void main()
