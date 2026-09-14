import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/* The range's telemetry contract.
   Every component of the lab — the estate services, the attacker, the beacon —
   appends real, structured events to one newline-delimited log on disk. There
   is no in-memory shortcut: an agent's tool reads the same bytes the attack
   wrote, so "what the SIEM shows" is literally what happened. */

export type EventKind =
  | "http"        // a real request served by a range service
  | "process"     // a real child process spawned on a host
  | "netflow"     // a real socket a host opened
  | "dns"         // a real name resolution the attacker performed
  | "auth"        // an identity-plane event
  | "file"        // a real file written on a host
  | "audit"       // an application audit line
  | "control"     // a defender action applied to the range

export interface RangeEvent {
  ts: string
  seq: number
  source: string
  host: string
  kind: EventKind
  detail: string
  principal?: string
  method?: string
  path?: string
  status?: number
  dst?: string
  bytes?: number
  /** Which attack front produced this event: "gateway" | "identity". */
  front?: string
  tags: string[]
}

export function rangeDir(): string {
  return process.env.PHALANX_RANGE_DIR ?? join(homedir(), ".phalanx-range")
}

export function eventsPath(): string {
  return join(rangeDir(), "events.jsonl")
}

export function statePath(): string {
  return join(rangeDir(), "state.json")
}

let seq = 0

export async function ensureRangeDir(): Promise<void> {
  await mkdir(rangeDir(), { recursive: true })
}

/** Append one event. The write is real and durable — this is the log. */
export async function emit(event: Omit<RangeEvent, "ts" | "seq" | "tags"> & { tags?: string[] }): Promise<void> {
  const record: RangeEvent = {
    ts: new Date().toISOString(),
    seq: seq++,
    tags: [],
    ...event,
  }
  await appendFile(eventsPath(), `${JSON.stringify(record)}\n`, "utf8")
}

export async function readEvents(): Promise<RangeEvent[]> {
  if (!existsSync(eventsPath())) return []
  const raw = await readFile(eventsPath(), "utf8")
  const rows: RangeEvent[] = []
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue
    try {
      rows.push(JSON.parse(line) as RangeEvent)
    } catch {
      // A half-written trailing line during a live tail is expected; skip it.
    }
  }
  return rows.sort((a, b) => a.seq - b.seq)
}

export interface RangeState {
  startedAt: string
  /** Per-front stage, keyed by front id. */
  stages: Record<string, string>
  attackStage: string
  compromisedHosts: string[]
  beaconCount: number
  exfilBytes: number
  /** Identity front. */
  consentGrants: string[]
  mailboxesEnumerated: number
  enumerationStopped: boolean
  filesEncrypted: number
  encryptionStopped: boolean
  failedLogins: number
  accountTakeover: boolean
  bruteforceStopped: boolean
  isolatedHosts: string[]
  blockedIndicators: string[]
  revokedPrincipals: string[]
  attackComplete: boolean
}

export function emptyState(): RangeState {
  return {
    startedAt: new Date().toISOString(),
    stages: {},
    attackStage: "idle",
    compromisedHosts: [],
    beaconCount: 0,
    exfilBytes: 0,
    consentGrants: [],
    mailboxesEnumerated: 0,
    enumerationStopped: false,
    filesEncrypted: 0,
    encryptionStopped: false,
    failedLogins: 0,
    accountTakeover: false,
    bruteforceStopped: false,
    isolatedHosts: [],
    blockedIndicators: [],
    revokedPrincipals: [],
    attackComplete: false,
  }
}

export async function readState(): Promise<RangeState | null> {
  if (!existsSync(statePath())) return null
  try {
    return JSON.parse(await readFile(statePath(), "utf8")) as RangeState
  } catch {
    return null
  }
}

export async function writeState(state: RangeState): Promise<void> {
  await writeFile(statePath(), JSON.stringify(state, null, 2), "utf8")
}
