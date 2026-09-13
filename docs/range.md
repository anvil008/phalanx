# The live range

The range is Phalanx's answer to "simulated, but with real data." Instead of the
built-in estate returning authored telemetry, an actual attack script runs
against an actual — if small — estate of instrumented services, writes real
logs, and the agents read those logs. Containment acts on the range for real:
isolate the gateway and the beacon you can see in the log actually stops.

There is no container runtime dependency. The whole lab is Node processes bound
to `127.0.0.1`, confined to a working directory (`~/.phalanx-range`, override with
`PHALANX_RANGE_DIR` or `ESPER_RANGE_DIR`). Nothing leaves the host.

## What runs

`server/src/range/`

- **`host.ts`** — the estate. One loopback HTTP service per host
  (edge-gw-01, app-api-21, build-ci-01, data-obj-01, corp-idp-01), a fake C2,
  and a control plane, on ports `8110`–`8115` and `8119`. Every request is
  really served and really logged. The gateway is instrumented with the
  modelled vulnerability: a request to the admin path carrying the desync
  marker is treated as a foothold, at which point the host really spawns a
  beacon loop that makes real requests to the C2.
- **`attack.ts`** — the attacker, a separate process. It makes real HTTP
  requests across the range in the order a real intrusion would — smuggle to
  the gateway, use the stolen deploy credential, pivot to the build plane,
  bulk-read the export bucket, exfiltrate to the C2 — with compressed but real
  pacing.
- **`events.ts`** — the telemetry contract. Every component appends structured
  events to one `events.jsonl`. That file is the world: a tool reads the same
  bytes the attack wrote.
- **`supervisor.ts`** — spawns the two processes, waits for the estate to
  answer, and turns the real log into signal. A small detector fires one
  detection per rule the first time its signature appears in the log — so the
  incident opens because the SIEM genuinely saw the intrusion, not on a timer.
- **`telemetry.ts`** — the range as a `TelemetrySource`: reads answer from
  `events.jsonl`, and the containment actuators POST to the control plane, so
  isolating a host really stops its beacon.

## The vulnerability is modelled, not weaponised

The "exploit" is a crafted-but-benign request the gateway is instrumented to
treat as a foothold. Node's HTTP stack normalises genuinely conflicting
framing (and its server rejects it), so the dual Transfer-Encoding/Content-Length
desync that defines the flaw is asserted with a marker header. The request is
real and served; the classification is the lab modelling what an unpatched
appliance would be fooled by. No memory-corruption primitive, no shipped
exploit, nothing that touches anything outside the range.

## Fronts

The range runs one or more **fronts** concurrently, each a separate attacker
process producing its own real telemetry:

- **gateway** — the pre-auth request-smuggling intrusion of the ingress
  gateway, ending in a live beacon and bulk exfiltration. Commanded by ATLAS.
- **identity** — consent-grant abuse in the corporate tenant: two finance users
  are tricked into granting an unverified OAuth app, which then really
  enumerates shared mailboxes on a loop until contained. Commanded by VESPER.

Both fronts beacon/callback through the same C2 (`cdn-status-check.net` /
`185.121.44.19`), so when they run together ORRERY correlates them into one
campaign and the commanders coordinate — the real-data version of the simulated
multi-front campaign. Containing the shared C2 helps both fronts at once:
blocking that domain stops the gateway beacon *and* halts the identity front's
mailbox enumeration.

The range runs up to four fronts:

- **gateway** (Commander) — pre-auth request smuggling → beacon → exfil.
- **identity** (ID Cmdr) — consent-grant abuse → live mailbox enumeration.
- **ransomware** (Endpoint) — a phished workstation encrypts the file share in
  real time; isolating the host cuts the encryption loop.
- **bruteforce** (Access) — credential stuffing → account takeover on the IdP;
  blocking the source and resetting the account ends it.

gateway and identity share SALT MERIDIAN infrastructure, so the Campaign
commander correlates them; ransomware and bruteforce are independent,
opportunistic attacks. Run buttons: **Live range** (gateway only),
**2-front range** (gateway + identity, correlated), **4-front range** (all four,
four commanders at once).

## Running it

Press **Live range → Run the attack** (or `POST /api/range/run`). The Live Range
page tails `events.jsonl`, shows the attack chain and beacon count, and links to
the incident the swarm opened. Containment lands in the same log you are
watching: `egress blocked` → `beacon egress refused` → `host isolated`, and the
beacon stops.

It is a data source, not a mode: whichever reasoning is configured drives it.
In `replay` a purpose-built response (`replayRangeCommand`) runs the
observe → decide → act → verify loop and only resolves once the beacon is
confirmed dead against real state. In `live` the real multi-provider LLM commander
(Gemini, Claude, or OpenAI) reads the same telemetry and decides for itself.

## Endpoints

```
POST /api/range/run           gateway front alone
POST /api/range/campaign/run  gateway + identity (correlated)
POST /api/range/multi/run     all four fronts concurrently
POST /api/range/stop     tear the range down
GET  /api/range/status   live status (attack stage, beacons, containment)
GET  /api/range/events   the raw event log (tailed by the Live Range page)
```

Reset (`POST /api/reset`, or the button) stops the range, kills its child
processes, restores the built-in estate as the source, and clears the world.

## Pacing

- `ESPER_RANGE_BEACON_MS` — beacon interval (default 1500).
- `ESPER_RANGE_STEP_MS` — attacker stage spacing (default 2600).
- `ESPER_RANGE_BASE_PORT` — first loopback port (default 8110).
