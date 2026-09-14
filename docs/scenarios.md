# Scenarios

Scenario definitions live in `server/src/scenarios/index.ts`; the ground truth
the specialists uncover lives in `server/src/tools/world.ts`.

## `zero-day-edge` — PLX-1041, commanded by Atlas

A pre-authentication request-smuggling flaw in the Rivet Edge 4.2.1 TLS
terminator. Five detections arrive over roughly four seconds of wall clock:
a WAF desync heuristic, a service account spawning a shell, a deployment
credential authenticating from the DMZ for the first time, periodic egress on a
47-second cadence, and a bulk read of customer export objects.

Nothing tells the commander these are one incident. The interesting judgements
are whether the clusters are related, whether the absence of a matching CVE
means a zero-day or a gap in the catalogue, and whether to accept a ~90-second
customer-facing outage to revoke a credential the adversary is still holding.

Ground truth the specialists have to assemble between them:

| Fact | Discoverable by |
|---|---|
| First touch is the gateway request itself, ~3h15m before the alert | host forensics |
| Persistence is an `LD_PRELOAD` shim, survives restart but not rebuild | host forensics |
| 1.84 GB already left the estate | network analysis |
| `svc-deploy` chained into `svc-backup`; both still live | identity analysis |
| Only 4.2.x is reachable — two hosts, not four | vulnerability research |
| A poisoned artifact will re-infect anything rebuilt from it | threat hunting |
| The regulatory clock starts at the exfiltration finding, not the first alert | regulatory liaison |

The last two are the ones that punish a commander who moves to recovery too
early.

## `identity-front` — PLX-1042, commanded by Vesper

Consent-grant abuse in the corporate tenant: an unregistered OAuth application
granted `mail.read` by two finance users four minutes apart, then enumerating
shared mailboxes. Shorter, and shaped differently on purpose — Vesper cannot
close its own incident, because the adversary's way back in is on ATLAS's side
of the estate.

## The campaign

`POST /api/campaign/run` starts both, staggered, then runs commander
coordination once each has something worth trading. Vesper raises the shared
indicator with Atlas, Orrery pulls both pictures, links the incidents, and
publishes an arbitration card giving ATLAS priority on the shared specialists
while the front with an active egress channel is still open.

This is the case the per-incident view structurally cannot show: agents
enrolled in two incidents at once, and commanders negotiating with each other
rather than with the operator.

## Adding one

1. Add a `Scenario` to `server/src/scenarios/index.ts` — detections with
   `afterMs` offsets, the assets and indicators in scope, and which commander
   owns it.
2. Add whatever the specialists must be able to discover to
   `server/src/tools/world.ts`. If a tool cannot return it, an agent cannot
   honestly claim it.
3. In live mode you are done — the commander plans from the alert text.
4. For replay, add a plan to `server/src/agents/replay.ts` and branch to it
   from `replayCommand`.
