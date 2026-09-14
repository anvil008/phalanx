import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@foundry/ui/components/button"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { SegmentedControl } from "@foundry/ui/components/segmented-control"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { ArrowDownToLine, CornerDownLeft, Loader2 } from "lucide-react"
import { shortTime } from "@/lib/format"
import type { AgentDef, TranscriptEntry } from "@/lib/model"
import { phalanxApi, useAgentIndex, usePhalanx, useIncidentList } from "@/lib/store"

/* Agent Chat.
   The full text the agents actually produce as they work — every A2A report,
   query, task, broadcast, and interactive operator transmission in order as a
   live conversation. One turn per hairline row; no bubbles. */

type Filter = "all" | "reports"

const KIND_LABEL: Record<string, string> = {
  task: "tasks",
  report: "reports",
  query: "asks",
  answer: "answers",
  escalation: "escalates",
  broadcast: "to all",
  handoff: "hands off",
  operator_query: "queries",
  commander_reply: "transmits to",
}

const QUICK_PROMPTS = [
  { label: "Request SITREP", prompt: "Provide an executive situation report (SITREP) covering all current incidents, key indicators, containment status, and immediate next steps." },
  { label: "Analyze Threat Actor", prompt: "Based on observed TTPs and telemetry across active incidents, what threat actor cluster matches this activity and why?" },
  { label: "List Containment Actions", prompt: "What containment actions have been executed, and what is currently staged?" },
  { label: "Verify IOCs", prompt: "List all confirmed indicators of compromise, C2 infrastructure, and malicious artifacts." },
]

function classColor(agent: AgentDef | undefined, isOperator = false): string {
  if (isOperator) return "var(--warning)"
  return agent ? `var(--phalanx-class-${agent.class})` : "var(--accent)"
}

function formatMessageText(text: string) {
  const lines = text.split("\n")
  return lines.map((line, lineIdx) => {
    const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
    return (
      <span key={lineIdx} className="block min-h-[1.25rem]">
        {parts.map((part, partIdx) => {
          if (part.startsWith("`") && part.endsWith("`")) {
            return (
              <code
                key={partIdx}
                className="font-mono text-[0.75rem] text-accent-indigo!"
              >
                {part.slice(1, -1)}
              </code>
            )
          }
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <strong key={partIdx} className="font-normal text-ink!">
                {part.slice(2, -2)}
              </strong>
            )
          }
          return <span key={partIdx}>{part}</span>
        })}
      </span>
    )
  })
}

/* Agents paste raw instrument output into their reports. Those lines are data,
   so they get the mono face; the sentences around them stay in the sans. */
const DATA_LINE = /^\s*\d{4}-\d{2}-\d{2}T/

function renderBody(text: string, rich: boolean, bodyClass: string) {
  const blocks: { mono: boolean; lines: string[] }[] = []
  for (const line of text.split("\n")) {
    const mono = DATA_LINE.test(line) || line.includes("\t")
    const last = blocks[blocks.length - 1]
    if (last && last.mono === mono) last.lines.push(line)
    else blocks.push({ mono, lines: [line] })
  }

  return blocks
    .map((block) => ({ mono: block.mono, text: block.lines.join("\n").trim() }))
    .filter((block) => block.text.length > 0)
    .map((block, idx) =>
      block.mono ? (
        <pre
          key={idx}
          className="overflow-x-auto whitespace-pre-wrap font-mono text-[0.6875rem] leading-relaxed text-muted-foreground"
        >
          {block.text}
        </pre>
      ) : (
        <div key={idx} className={bodyClass}>
          {rich ? formatMessageText(block.text) : block.text}
        </div>
      ),
    )
}

export function ChatPage() {
  const navigate = useNavigate()
  const state = usePhalanx()
  const agents = useAgentIndex()
  const incidents = useIncidentList()
  const [filter, setFilter] = useState<Filter>("all")
  const [incidentId, setIncidentId] = useState<string>("all")
  const [follow, setFollow] = useState(true)
  const [prompt, setPrompt] = useState("")
  const [targetAgentId, setTargetAgentId] = useState("")
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const entries = useMemo(() => {
    return state.transcript.filter((entry) => {
      if (
        filter === "reports" &&
        !(
          entry.kind === "report" ||
          entry.kind === "answer" ||
          entry.kind === "broadcast" ||
          entry.kind === "commander_reply"
        )
      ) {
        return false
      }
      if (incidentId !== "all" && entry.incidentId !== incidentId) return false
      return true
    })
  }, [state.transcript, filter, incidentId])

  // Auto-scroll to newest while following.
  useEffect(() => {
    if (follow) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [entries.length, follow])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (nearBottom !== follow) setFollow(nearBottom)
  }

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? prompt).trim()
    if (!text || asking) return

    setAsking(true)
    setError(null)
    if (!textToSend) setPrompt("")

    try {
      const res = await phalanxApi.askCommander(text, targetAgentId || undefined)
      if (!res.ok) {
        setError(res.error || "Commander failed to respond")
      } else {
        setFollow(true)
        setTimeout(() => {
          bottomRef.current?.scrollIntoView({ behavior: "smooth" })
        }, 80)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to communicate with commander")
    } finally {
      setAsking(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const rangeIncidents = incidents

  return (
    <PageContent className="flex min-h-0 flex-col gap-3">
      <PageHeader
        title="Agent Chat"
        subtitle={`${state.transcript.length} messages`}
        actions={
          <SegmentedControl<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Everything" },
              { value: "reports", label: "Reports only" },
            ]}
          />
        }
      />

      {/* Incident scope: a row of quiet labels, the current one underlined in accent. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-rule-soft pb-2">
        <ScopeButton active={incidentId === "all"} onClick={() => setIncidentId("all")}>
          All incidents
        </ScopeButton>
        {rangeIncidents.map((incident) => (
          <ScopeButton
            key={incident.id}
            active={incidentId === incident.id}
            onClick={() => setIncidentId(incident.id)}
          >
            <StatusDot tone={incident.status === "resolved" ? "positive" : "negative"} />
            {incident.code}
          </ScopeButton>
        ))}
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="panel relative flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        {entries.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="title text-[0.875rem]">No agent traffic yet.</p>
            <p className="prose max-w-md text-[0.75rem]!">
              Start a scenario, a live-range attack, or use the operator console below to query
              incident commanders and specialists.
            </p>
          </div>
        ) : (
          entries.map((entry) => (
            <ChatTurn
              key={entry.id}
              entry={entry}
              agents={agents}
              onOpenIncident={(id) => navigate(`/incidents/${id}`)}
              incidentCode={incidents.find((i) => i.id === entry.incidentId)?.code}
            />
          ))
        )}
        <div ref={bottomRef} />

        {!follow ? (
          <Button
            size="sm"
            variant="outline"
            className="sticky bottom-2 z-10 self-end"
            onClick={() => {
              setFollow(true)
              bottomRef.current?.scrollIntoView({ behavior: "smooth" })
            }}
          >
            <ArrowDownToLine className="size-3.5" /> Jump to latest
          </Button>
        ) : null}
      </div>

      {/* Operator console: intervene in, or query, the swarm. */}
      <div className="panel flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="eyebrow">Operator console</span>

          <div className="flex flex-wrap items-center gap-1.5">
            {QUICK_PROMPTS.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={asking}
                onClick={() => void handleSend(item.prompt)}
                className="meta-mono cursor-pointer rounded-[0.125rem] border border-rule-soft px-2 py-0.5 transition-colors hover:border-rule hover:text-ink! disabled:opacity-50"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <select
            value={targetAgentId}
            onChange={(e) => setTargetAgentId(e.target.value)}
            disabled={asking}
            className="h-8 shrink-0 rounded-[0.125rem] border border-rule bg-transparent px-2 font-mono text-xs text-ink! focus:outline-none"
          >
            <option value="">Target: active commander</option>
            <optgroup label="Incident Commanders">
              <option value="ic-atlas">Commander Atlas</option>
              <option value="ic-vesper">ID Cmdr Vesper</option>
              <option value="ic-orrery">Campaign Cmdr Orrery</option>
              <option value="ic-warden">Endpoint Cmdr Warden</option>
              <option value="ic-marshal">Cloud Cmdr Marshal</option>
            </optgroup>
            <optgroup label="Specialists">
              <option value="network-tide">Network Tide (Network Analyst)</option>
              <option value="forensics-cinder">Forensics Cinder (Host Forensics)</option>
              <option value="intel-oracle">Intel Oracle (Threat Intel)</option>
              <option value="contain-bulwark">Containment Bulwark (Containment)</option>
              <option value="vuln-lathe">Vuln Lathe (Vulnerability Research)</option>
              <option value="identity-keystone">Identity Keystone (Identity Analyst)</option>
              <option value="triage-sentry">Triage Sentry (Alert Triage)</option>
            </optgroup>
          </select>

          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={asking}
            placeholder="Ask the commander a question — blast radius, C2 indicators, containment status"
            className="h-8 flex-1 rounded-[0.125rem] border border-rule bg-transparent px-3 font-mono text-xs text-ink! placeholder:text-muted-soft focus:outline-none"
          />

          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleSend()}
            disabled={asking || !prompt.trim()}
            className="h-8 shrink-0 gap-1.5 px-3"
          >
            {asking ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Sending</span>
              </>
            ) : (
              <>
                <CornerDownLeft className="size-3.5" />
                <span>Send</span>
              </>
            )}
          </Button>
        </div>

        {asking ? (
          <p className="meta-mono">Commander is reading live telemetry and drafting an assessment.</p>
        ) : error ? (
          <div className="meta-mono flex items-center justify-between gap-3" style={{ color: "var(--negative)" }}>
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="underline hover:text-ink!">
              dismiss
            </button>
          </div>
        ) : null}
      </div>
    </PageContent>
  )
}

function ScopeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`meta-mono -mb-2 flex items-center gap-1.5 border-b pb-2 transition-colors ${
        active ? "border-[var(--accent)] text-ink!" : "border-transparent hover:text-ink!"
      }`}
    >
      {children}
    </button>
  )
}

function ChatTurn({
  entry,
  agents,
  incidentCode,
  onOpenIncident,
}: {
  entry: TranscriptEntry
  agents: Map<string, AgentDef>
  incidentCode?: string
  onOpenIncident: (id: string) => void
}) {
  const from = agents.get(entry.fromAgentId)
  const to = entry.toAgentId ? agents.get(entry.toAgentId) : null
  const isOperatorQuery = entry.kind === "operator_query" || entry.fromAgentId === "operator"
  const isCommanderReply = entry.kind === "commander_reply"
  const isTask = entry.kind === "task" || entry.kind === "query" || entry.kind === "escalation"

  const sender = isOperatorQuery ? "Operator" : from?.callsign ?? entry.fromAgentId
  const target = isOperatorQuery
    ? to?.callsign ?? "Commander"
    : isCommanderReply
      ? "Operator"
      : to?.callsign ?? "everyone"
  const dot = classColor(from, isOperatorQuery)

  return (
    <article className="flex flex-col gap-1.5 border-b border-rule-soft px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="phalanx-signal" style={{ color: dot }} />
        <span className="eyebrow" style={isOperatorQuery ? { color: "var(--warning)" } : undefined}>
          {sender}
        </span>
        <span className="meta-mono">{KIND_LABEL[entry.kind] ?? entry.kind}</span>
        <span className="meta-mono text-ink!">{target}</span>
        {incidentCode && entry.incidentId ? (
          <button
            type="button"
            onClick={() => onOpenIncident(entry.incidentId!)}
            className="meta-mono hover:text-ink! hover:underline"
          >
            {incidentCode}
          </button>
        ) : null}
        <span className="meta-mono ml-auto">{shortTime(entry.at)}</span>
      </div>

      <div className="flex flex-col gap-2">
        {renderBody(
          entry.text,
          isCommanderReply || isOperatorQuery,
          `prose max-w-[74ch] text-[0.75rem]! whitespace-pre-wrap ${isTask ? "" : "text-ink-soft!"}`,
        )}
      </div>
    </article>
  )
}
