import { StatusDot } from "@foundry/ui/components/status-dot"
import type { RangeStatus } from "@/lib/model"

/* Live range panel.
   Reflects the real lab: which stage each attack front has reached, how much
   real harm has happened (beacons to the C2, mailboxes enumerated), and which
   containment actions have taken effect. Every number is read from the range's
   own state file, not narrated. When a second front is active it shows both. */

const GATEWAY_STAGES = [
  { key: "initial-access", label: "Access" },
  { key: "foothold", label: "Foothold" },
  { key: "lateral-movement", label: "Lateral" },
  { key: "persistence", label: "Persistence" },
  { key: "collection", label: "Collection" },
  { key: "exfiltration", label: "Exfiltration" },
  { key: "complete", label: "Complete" },
]

const IDENTITY_STAGES = [
  { key: "consent", label: "Consent" },
  { key: "burst", label: "Burst" },
  { key: "enumeration", label: "Enumeration" },
]

const RANSOM_STAGES = [
  { key: "encrypting", label: "Encrypting" },
]

const BRUTE_STAGES = [
  { key: "spray", label: "Spray" },
  { key: "takeover", label: "Takeover" },
]

function stageIndex(stages: { key: string }[], stage: string): number {
  const direct = stages.findIndex((s) => s.key === stage)
  if (direct >= 0) return direct
  if (stage === "lateral") return 2
  return 0
}

export function RangePanel({ status, compact = false }: { status: RangeStatus; compact?: boolean }) {
  const isolatedHosts = status.isolatedHosts ?? []
  const blockedIndicators = status.blockedIndicators ?? []
  const beaconDead = isolatedHosts.includes("edge-gw-01") || blockedIndicators.some((i) => i.includes("185.121.44.19"))
  const identityActive = (status.mailboxesEnumerated ?? 0) > 0 || (status.consentGrants?.length ?? 0) > 0
  const ransomActive = (status.filesEncrypted ?? 0) > 0 || status.stages?.ransomware !== undefined
  const bruteActive = (status.failedLogins ?? 0) > 0 || status.stages?.bruteforce !== undefined
  const anyContained =
    isolatedHosts.length > 0 || blockedIndicators.length > 0 || status.enumerationStopped || status.encryptionStopped || status.bruteforceStopped
  const contained = Boolean(anyContained)
  const multi = [identityActive, ransomActive, bruteActive].filter(Boolean).length >= 1

  return (
    <div className="flex flex-col gap-3 border border-rule-soft p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="flex items-center gap-2">
          <StatusDot tone={contained ? "positive" : "negative"} pulse={!contained} />
          <span className="title-serif text-[1.125rem]">Live range</span>
        </span>
        <span className="meta-mono ml-auto">isolated estate · loopback only</span>
      </div>

      <p className="prose-serif max-w-[62ch]">
        {multi
          ? "Several real attacks are running at once against instrumented services on this host. Every reading comes from the lab's own logs; the agents read the same bytes."
          : "A real attack script is running against instrumented services on this host. Every reading comes from the lab's own logs; the agents read the same bytes."}
      </p>

      {/* Gateway front */}
      <Front
        title="Gateway zero-day"
        commander="Atlas"
        stages={GATEWAY_STAGES}
        reached={stageIndex(GATEWAY_STAGES, status.stages?.gateway ?? status.attackStage)}
        complete={status.attackComplete}
        metrics={[
          { label: "Beacons to C2", value: String(status.beaconCount), tone: beaconDead ? "positive" : "negative" },
          { label: "Exfiltrated", value: `${(status.exfilBytes / 1e6).toFixed(2)} MB`, tone: status.exfilBytes > 0 ? "warning" : "neutral" },
          { label: "Beacon", value: beaconDead ? "stopped" : "active", tone: beaconDead ? "positive" : "negative" },
        ]}
      />

      {/* Identity front, only when it's live */}
      {identityActive ? (
        <Front
          title="Consent-grant abuse"
          commander="Vesper"
          stages={IDENTITY_STAGES}
          reached={stageIndex(IDENTITY_STAGES, status.stages?.identity ?? "consent")}
          complete={status.enumerationStopped}
          metrics={[
            { label: "Mailboxes read", value: String(status.mailboxesEnumerated), tone: status.enumerationStopped ? "positive" : "warning" },
            { label: "Consent grants", value: String(status.consentGrants?.length ?? 0), tone: "warning" },
            { label: "Enumeration", value: status.enumerationStopped ? "stopped" : "active", tone: status.enumerationStopped ? "positive" : "negative" },
          ]}
        />
      ) : null}

      {/* Ransomware front */}
      {ransomActive ? (
        <Front
          title="Ransomware"
          commander="Endpoint"
          stages={RANSOM_STAGES}
          reached={0}
          complete={status.encryptionStopped}
          metrics={[
            { label: "Files encrypted", value: String(status.filesEncrypted ?? 0), tone: status.encryptionStopped ? "positive" : "negative" },
            { label: "Host", value: "corp-fs-03", tone: "warning" },
            { label: "Encryption", value: status.encryptionStopped ? "stopped" : "active", tone: status.encryptionStopped ? "positive" : "negative" },
          ]}
        />
      ) : null}

      {/* Brute-force front */}
      {bruteActive ? (
        <Front
          title="Credential stuffing"
          commander="Access"
          stages={BRUTE_STAGES}
          reached={status.accountTakeover ? 1 : 0}
          complete={status.bruteforceStopped}
          metrics={[
            { label: "Failed logins", value: String(status.failedLogins ?? 0), tone: status.bruteforceStopped ? "positive" : "warning" },
            { label: "Takeover", value: status.accountTakeover ? "yes" : "no", tone: status.accountTakeover ? "negative" : "neutral" },
            { label: "Attack", value: status.bruteforceStopped ? "stopped" : "active", tone: status.bruteforceStopped ? "positive" : "negative" },
          ]}
        />
      ) : null}

      {contained ? (
        <div className="flex flex-col gap-1.5 border-t border-rule-soft pt-2.5">
          <div className="meta-mono text-[color:var(--positive)]!">Containment applied to the range</div>
          <RangeFacts label="Revoked" values={status.revokedPrincipals} />
          <RangeFacts label="Blocked" values={status.blockedIndicators} />
          <RangeFacts label="Isolated" values={status.isolatedHosts} />
          {status.enumerationStopped ? <RangeFacts label="Consent" values={["9f31c0 revoked — enumeration stopped"]} /> : null}
        </div>
      ) : compact ? null : (
        <p className="meta-mono text-[color:var(--warning)]!">
          No containment yet — the attack is still live. The commanders will act on their own authority.
        </p>
      )}
    </div>
  )
}

type Tone = "neutral" | "positive" | "warning" | "negative"

function Front({
  title,
  commander,
  stages,
  reached,
  complete,
  metrics,
}: {
  title: string
  commander: string
  stages: { key: string; label: string }[]
  reached: number
  complete: boolean
  metrics: { label: string; value: string; tone: Tone }[]
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-rule-soft pt-2.5">
      <div className="flex items-baseline gap-2">
        <span className="title-serif text-[0.9375rem]">{title}</span>
        <span className="meta-mono ml-auto">{commander}</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {metrics.map((m) => (
          <Metric key={m.label} label={m.label} value={m.value} tone={m.tone} />
        ))}
      </div>
      <ol className="meta-mono flex flex-wrap gap-x-3.5 gap-y-1">
        {stages.map((stage, index) => {
          const done = index < reached || complete
          const active = index === reached && !complete
          return (
            <li key={stage.key} className="flex items-center gap-1.5">
              <span
                className="inline-block size-1.5 rounded-full"
                style={{ background: active ? "var(--negative)" : done ? "var(--muted)" : "var(--rule)" }}
              />
              <span className={active ? "text-ink" : done ? undefined : "text-muted-soft"}>{stage.label}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const colour =
    tone === "positive" ? "text-positive" : tone === "warning" ? "text-warning" : tone === "negative" ? "text-destructive" : "text-ink"
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className={`mt-0.5 font-mono text-sm font-normal ${colour}`}>{value}</div>
    </div>
  )
}

function RangeFacts({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null
  return (
    <div className="meta-mono flex items-baseline gap-2">
      <span className="w-14 shrink-0">{label}</span>
      <span className="text-ink">{values.join(", ")}</span>
    </div>
  )
}
