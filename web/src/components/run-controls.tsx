import { useState } from "react"
import { Button } from "@foundry/ui/components/button"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { FlaskConical, Play, RotateCcw } from "lucide-react"
import { phalanxApi, usePhalanx } from "@/lib/store"

/* Run controls.
   Two categories, one visual language. "Simulated" runs replay authored
   telemetry; "Live range" runs real attacks against the isolated lab. Every
   run button is the same outline style — nothing is arbitrarily highlighted —
   and the icon (playback vs. lab flask) plus the group label carry the meaning.
   A demo world holds one run of each scenario, so a button explains itself when
   it is unavailable, and reset is the way back. */

const SIMULATED = [
  { id: "zero-day-edge", label: "Zero-day", scenario: true, run: () => phalanxApi.runScenario("zero-day-edge"), tip: "Simulated zero-day intrusion of the ingress gateway (authored telemetry)." },
  { id: "identity-front", label: "Identity", scenario: true, run: () => phalanxApi.runScenario("identity-front"), tip: "Simulated consent-grant abuse in the corporate tenant (authored telemetry)." },
  { id: "campaign", label: "Campaign", scenario: false, run: () => phalanxApi.runCampaign(), tip: "Simulated multi-front campaign — two commanders on one adversary (authored telemetry)." },
] as const

const LIVE = [
  { label: "1 front", run: () => phalanxApi.runRange(), tip: "One real attack against the isolated lab; agents read the real telemetry." },
  { label: "2 fronts", run: () => phalanxApi.runRangeCampaign(), tip: "Two concurrent real attacks; two commanders correlate them into one campaign." },
  { label: "4 fronts", run: () => phalanxApi.runRangeMultiFront(), tip: "Four concurrent real attacks handled by four commanders at once." },
] as const

export function RunControls({ compact = false }: { compact?: boolean }) {
  const { incidents, mode, rangeStatus } = usePhalanx()
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Mirrors the server's own rule so a disabled button can explain itself
  // without a round trip. The server stays the authority (it answers 409).
  const already = (scenarioId: string) =>
    [...incidents.values()].find((incident) => incident.scenarioId === scenarioId) ?? null

  const run = async (start: () => Promise<{ ok: boolean; reason?: string }>) => {
    setBusy(true)
    setNotice(null)
    const result = await start()
    setBusy(false)
    if (!result.ok) setNotice(result.reason ?? "That run could not be started.")
  }

  const reset = async () => {
    setBusy(true)
    setNotice(null)
    await phalanxApi.reset()
    setBusy(false)
  }

  const scenarioBlocked = ["zero-day-edge", "identity-front"].some((id) => already(id))
  const rangeRunning = rangeStatus !== null

  const simDisabled = (item: (typeof SIMULATED)[number]) =>
    busy || (item.scenario ? already(item.id) !== null : scenarioBlocked)
  const simTip = (item: (typeof SIMULATED)[number]) => {
    if (item.scenario) {
      const blocked = already(item.id)
      return blocked ? `${blocked.code} has already run in this world. Reset to run it again.` : item.tip
    }
    return scenarioBlocked ? "One of the campaign's incidents has already run. Reset to run it again." : item.tip
  }

  return (
    <div className={compact ? "flex flex-col gap-2" : "flex flex-col gap-3"}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Group label="Simulated">
          {SIMULATED.map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant="outline"
              disabled={simDisabled(item)}
              title={simTip(item)}
              onClick={() => void run(item.run)}
            >
              <Play className="size-3.5" /> {item.label}
            </Button>
          ))}
        </Group>

        <span className="h-5 w-px shrink-0 bg-border" aria-hidden />

        <Group label="Live range">
          {LIVE.map((item) => (
            <Button
              key={item.label}
              size="sm"
              variant="outline"
              disabled={busy || rangeRunning}
              title={rangeRunning ? "The range is already running. Reset to run it again." : item.tip}
              onClick={() => void run(item.run)}
            >
              <FlaskConical className="size-3.5" /> {item.label}
            </Button>
          ))}
        </Group>

        <span className="h-5 w-px shrink-0 bg-border" aria-hidden />

        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void reset()}
          title="Clear every incident, message, surface and any running attack"
        >
          <RotateCcw className="size-3.5" />
          {compact ? null : <span className="ml-1.5">Reset</span>}
        </Button>
      </div>

      {notice ? (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <StatusDot tone="warning" />
          {notice}
        </p>
      ) : null}
      {!compact && mode === "replay" ? (
        <p className="text-[11px] text-muted-foreground">
          Replay director — deterministic, no model calls. Set <code className="font-mono">PHALANX_MODE=live</code> for real
          agent sessions.
        </p>
      ) : null}
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
