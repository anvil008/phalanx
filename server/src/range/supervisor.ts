import { spawn, type ChildProcess } from "node:child_process"
import { request as httpRequest } from "node:http"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import type { IncidentSeverity } from "../model.ts"
import { emptyState, readEvents, readState, type RangeEvent, type RangeState } from "./events.ts"

/* Range supervisor.
   Owns the lab's process lifecycle and turns its real logs into signal. It
   spawns the estate host and the attacker as separate node processes, waits
   for the estate to answer, then polls the event log and the state file:
   real events become detections, and the state file drives host status. It
   knows nothing about incidents or commanders — it hands detections to a
   callback and lets the runner decide what to do with them. */

const here = dirname(fileURLToPath(import.meta.url))
const BASE = Number(process.env.PHALANX_RANGE_BASE_PORT ?? 8110)
const CONTROL_PORT = BASE + 9

export interface DetectionSignal {
  source: string
  host: string
  rule: string
  severity: IncidentSeverity
  detail: string
  front: string
}

/* Real events → detections. Each rule fires once, the first time its
   signature appears in the log the attack is writing. */
const RULES: { tag: string; source: string; rule: string; severity: IncidentSeverity; front: string }[] = [
  { tag: "smuggling", source: "waf", rule: "HTTP-DESYNC-HEURISTIC", severity: "sev3", front: "gateway" },
  { tag: "shell", source: "edr", rule: "SERVICE-ACCOUNT-SHELL", severity: "sev2", front: "gateway" },
  { tag: "new-source", source: "idp", rule: "NEW-SOURCE-FOR-PRINCIPAL", severity: "sev2", front: "gateway" },
  { tag: "beacon", source: "netflow", rule: "PERIODIC-EGRESS", severity: "sev2", front: "gateway" },
  { tag: "supply-chain", source: "audit", rule: "ARTIFACT-PUBLISH-OFF-PIPELINE", severity: "sev2", front: "gateway" },
  { tag: "bulk-read", source: "audit", rule: "BULK-OBJECT-READ", severity: "sev1", front: "gateway" },
  { tag: "exfil", source: "netflow", rule: "DATA-EXFILTRATION", severity: "sev1", front: "gateway" },
  { tag: "consent", source: "idp", rule: "UNKNOWN-APP-CONSENT", severity: "sev3", front: "identity" },
  { tag: "consent-burst", source: "idp", rule: "CONSENT-BURST", severity: "sev2", front: "identity" },
  { tag: "mailbox-enum", source: "audit", rule: "MAILBOX-ENUMERATION", severity: "sev2", front: "identity" },
  { tag: "shared-infra", source: "dns", rule: "SHARED-INFRASTRUCTURE", severity: "sev2", front: "identity" },
  { tag: "detonate", source: "edr", rule: "RANSOMWARE-DETONATION", severity: "sev1", front: "ransomware" },
  { tag: "encrypt", source: "edr", rule: "MASS-FILE-ENCRYPTION", severity: "sev1", front: "ransomware" },
  { tag: "spray", source: "idp", rule: "PASSWORD-SPRAY", severity: "sev3", front: "bruteforce" },
  { tag: "takeover", source: "idp", rule: "ACCOUNT-TAKEOVER", severity: "sev2", front: "bruteforce" },
]

export interface SupervisorCallbacks {
  onDetection: (detection: DetectionSignal) => void
  onState: (state: RangeState) => void
  onLog: (text: string, level?: "info" | "warn" | "error") => void
}

function controlStatus(): Promise<boolean> {
  const payload = "{}"
  return new Promise((resolve) => {
    const req = httpRequest(
      { host: "127.0.0.1", port: CONTROL_PORT, method: "POST", path: "/control/status", headers: { "content-length": payload.length }, timeout: 500 },
      (res) => {
        res.resume()
        resolve((res.statusCode ?? 0) === 200)
      },
    )
    req.on("error", () => resolve(false))
    req.on("timeout", () => {
      req.destroy()
      resolve(false)
    })
    req.end(payload)
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class RangeSupervisor {
  private host: ChildProcess | null = null
  private attacker: ChildProcess | null = null
  private attackers: ChildProcess[] = []
  private poller: ReturnType<typeof setInterval> | null = null
  private firedRules = new Set<string>()
  private stopped = false
  state: RangeState = emptyState()
  private readonly callbacks: SupervisorCallbacks
  private readonly vectors: string[]

  constructor(callbacks: SupervisorCallbacks, vectors: string[] = ["gateway"]) {
    this.callbacks = callbacks
    this.vectors = vectors
  }

  private childEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PHALANX_RANGE_BASE_PORT: String(BASE),
      PHALANX_RANGE_BEACON_MS: process.env.PHALANX_RANGE_BEACON_MS ?? "1500",
      PHALANX_RANGE_STEP_MS: process.env.PHALANX_RANGE_STEP_MS ?? "2600",
    }
  }

  private spawnChild(file: string, extraEnv: NodeJS.ProcessEnv = {}): ChildProcess {
    const child = spawn(process.execPath, ["--experimental-strip-types", join(here, file)], {
      env: { ...this.childEnv(), ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    })
    child.stdout?.on("data", (chunk) => this.callbacks.onLog(`range: ${String(chunk).trim()}`))
    child.stderr?.on("data", (chunk) => this.callbacks.onLog(`range[${file}]: ${String(chunk).trim()}`, "warn"))
    return child
  }

  async start(): Promise<boolean> {
    this.host = this.spawnChild("host.ts")
    this.host.on("exit", (code) => {
      if (!this.stopped && code) this.callbacks.onLog(`range host exited early (code ${code}) — a stale range may still be running`, "error")
    })
    // Wait for the estate to answer its control port before attacking it.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (await controlStatus()) break
      await delay(150)
      if (attempt === 39) {
        this.callbacks.onLog("range host did not come up", "error")
        await this.stop()
        return false
      }
    }
    this.callbacks.onLog(`range online — launching ${this.vectors.length > 1 ? "concurrent attacks" : "the attack script"}`)
    for (const vector of this.vectors) {
      const child = this.spawnChild("attack.ts", { PHALANX_RANGE_VECTOR: vector })
      if (!this.attacker) this.attacker = child
      this.attackers.push(child)
    }
    this.beginPolling()
    return true
  }

  private beginPolling(): void {
    this.poller = setInterval(() => {
      void this.tick()
    }, 700)
  }

  private async tick(): Promise<void> {
    if (this.stopped) return
    const [events, state] = await Promise.all([readEvents(), readState()])
    this.scan(events)
    if (state) {
      this.state = state
      this.callbacks.onState(state)
    }
  }

  private scan(events: RangeEvent[]): void {
    for (const rule of RULES) {
      if (this.firedRules.has(rule.rule)) continue
      const hit = events.find((event) => event.tags.includes(rule.tag))
      if (!hit) continue
      this.firedRules.add(rule.rule)
      this.callbacks.onDetection({
        source: rule.source,
        host: hit.host,
        rule: rule.rule,
        severity: rule.severity,
        detail: hit.detail,
        front: rule.front,
      })
    }
  }

  /** Synchronous best-effort kill for process exit handlers. */
  killSync(): void {
    this.stopped = true
    if (this.poller) {
      clearInterval(this.poller)
      this.poller = null
    }
    for (const child of [...this.attackers, this.host]) {
      if (child && !child.killed) child.kill("SIGKILL")
    }
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.poller) {
      clearInterval(this.poller)
      this.poller = null
    }
    for (const child of [...this.attackers, this.host]) {
      if (child && !child.killed) child.kill("SIGTERM")
    }
    this.attackers = []
    this.attacker = null
    this.host = null
    // Give the estate a moment to release its loopback ports.
    await delay(200)
  }
}
