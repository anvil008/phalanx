# Phalanx — agent swarm demo

Standalone demo showing an LLM orchestrator with no fixed workflow, A2A
agent-to-agent coordination, multi-provider live LLM support (Gemini, Claude, OpenAI),
and an A2UI interface the agents author at run time. Self-contained: it is a standalone
demo with zero external repository dependencies, and nothing outside this directory
should be edited to change its behaviour.

- **Ports:** server `:8095`, web dev server `:5195`.
- **Design language:** Flat hairline dashboard surfaces on `@foundry/ui`, restyled through tokens in `web/src/styles/phalanx.css` rather than per-page overrides. The page is black; grouped content sits in a `.panel` (`--card` fill, 1px rule, `0.375rem` radius). The accent is indigo `#79a7ff`; amber and red stay reserved for severity, and severity shows as text colour or a small dot, never a fill or a glow. Titles, prose, buttons, navigation, and badges use Roboto (`--phalanx-font-sans`), while structured data, telemetry, and code use Roboto Mono (`--phalanx-font-mono`), and uppercase is permitted only for eyebrows. No glass, blur, grain, gradient, shadow or glow anywhere.
- **The live range is real data, and its isolation is load-bearing.** The
  `range/` lab is Node processes on `127.0.0.1` writing real logs to
  `~/.phalanx-range`; the agents read those logs through the `TelemetrySource`
  interface, and containment POSTs to the range control plane for real. Keep it
  confined to loopback and to that working directory — no range component may
  reach outside the host, and the "vulnerability" stays modelled (a marker
  header), never a shipped exploit. Range children are our child processes:
  they must die on reset and on server exit (`killRangeSync`), or they orphan
  onto a range port and poison the next run.
- **Telemetry goes through the source interface.** `tools/impl.ts` reads and
  actuates through `getSource()`; `sim-source.ts` is the built-in estate,
  `range/telemetry.ts` is the live range. Do not reach back into `world.ts`
  directly from a tool — that bypasses the range.
- **Everything is simulated or ranged.** No tool touches a real network, host, or
  credential. `server/src/tools/world.ts` holds the entire observable estate
  plus the ground truth the specialists discover through their instruments.
  Keep it that way: a tool that reaches outside the simulation does not belong
  here.
- **The commander must stay unscripted in live mode.** `agents/prompts.ts`
  states the role and the judgement being asked for and deliberately contains
  no numbered procedure. If a demo needs a specific sequence, add it to the
  replay director (`agents/replay.ts`), not the prompt.
- **Two modes, one path.** Live sessions and the replay director register
  handlers against the same A2A transport and call the same tool
  implementations, so a change to a tool or a surface affects both. Replay
  pacing comes from `PHALANX_TICK_MS`.
- **Protocol fidelity is the point.** Inter-agent calls go through
  `a2a/transport.ts` as real JSON-RPC even in-process, and UI updates go
  through `a2ui/cards.ts` as real A2UI messages. Do not add a side channel that
  skips either — the Protocol Trace page is the demo's own audit, and a
  shortcut makes it a lie.
- **Reset is a full teardown, and it must stay that way.** `resetWorld()` in
  `runner.ts` bumps `store.generation` and clears the store, the A2A task map,
  and the A2UI card registry, then broadcasts a fresh snapshot so clients drop
  their state. Any new module that accumulates run state needs a clear step
  there — a registry that outlives a reset shows up later as duplicate or
  dangling ids. In-flight work unwinds because the replay director's `sleep`
  and the transport's `a2aSend` both re-check the generation they captured; if
  you add another await path that mutates the world, guard it the same way.
- **One run per scenario per world.** `refuseReason()` is the single rule, and
  the run buttons mirror it client-side so a disabled control can explain
  itself. The server still answers 409 — do not let the UI become the only
  guard.
- **Wire types are duplicated by hand** between `server/src/model.ts` and
  `web/src/lib/model.ts`. A shared package would buy nothing but a build step
  for a single deployable; keep the two in step when either changes.
- **Verification:** `npm run typecheck` covers both workspaces.
  `npm run build --workspace=web` emits `server/webdist`, which the server
  serves directly. UI checks happen in a real browser against a running server.
