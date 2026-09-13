import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@foundry/ui/components/badge"
import { Button } from "@foundry/ui/components/button"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { SegmentedControl } from "@foundry/ui/components/segmented-control"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { ArrowDownToLine, CornerDownLeft, Loader2, Terminal } from "lucide-react"
import { shortTime } from "@/lib/format"
import type { AgentDef, TranscriptEntry } from "@/lib/model"
import { phalanxApi, useAgentIndex, usePhalanx, useIncidentList } from "@/lib/store"

/* Agent Chat.
   The full text the agents actually produce as they work — every A2A report,
   query, task, broadcast, and interactive operator transmission in order as a
   live conversation. */

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
  return agent ? `var(--phalanx-class-${agent.class})` : "var(--brand-phalanx)"
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
                className="rounded bg-muted/70 px-1 py-0.5 font-mono text-[11px] text-primary"
              >
                {part.slice(1, -1)}
              </code>
            )
          }
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <strong key={partIdx} className="font-semibold text-foreground">
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
    <PageContent className="min-h-0 flex flex-col gap-3">
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

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setIncidentId("all")}
          className={`rounded-item border px-2.5 py-1 text-xs transition-colors ${incidentId === "all" ? "border-primary/50 bg-primary-surface text-primary" : "border-border text-muted-foreground hover:bg-accent"}`}
        >
          All incidents
        </button>
        {rangeIncidents.map((incident) => (
          <button
            key={incident.id}
            type="button"
            onClick={() => setIncidentId(incident.id)}
            className={`flex items-center gap-1.5 rounded-item border px-2.5 py-1 text-xs transition-colors ${incidentId === incident.id ? "border-primary/50 bg-primary-surface text-primary" : "border-border text-muted-foreground hover:bg-accent"}`}
          >
            <StatusDot tone={incident.status === "resolved" ? "positive" : "negative"} />
            <span className="font-mono">{incident.code}</span>
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-shell border border-border bg-card p-4"
      >
        {entries.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="text-sm text-foreground">No agent traffic yet.</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Start a scenario, a live-range attack, or use the Operator Console below to query Incident Commanders and specialists.
            </p>
          </div>
        ) : (
          entries.map((entry) => (
            <ChatBubble
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
            className="sticky bottom-2 self-end shadow-md z-10"
            onClick={() => {
              setFollow(true)
              bottomRef.current?.scrollIntoView({ behavior: "smooth" })
            }}
          >
            <ArrowDownToLine className="size-3.5" /> Jump to latest
          </Button>
        ) : null}
      </div>

      {/* Operator Intervene / Ask Commander Console */}
      <div className="flex flex-col gap-2 rounded-shell border border-border/80 bg-card/90 p-3 shadow-sm backdrop-blur">
        {/* Header & Quick-suggestion pills */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Terminal className="size-3.5 text-warning" />
            <span>Operator Console</span>
            <span className="text-[10px] font-normal lowercase text-muted-foreground/70">· intervene / query swarm</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mr-1 hidden sm:inline">Suggestions:</span>
            {QUICK_PROMPTS.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={asking}
                onClick={() => void handleSend(item.prompt)}
                className="group flex items-center gap-1 rounded-full border border-border/70 bg-accent/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary-surface hover:text-primary disabled:opacity-50 cursor-pointer"
              >
                <Terminal className="size-2.5 text-muted-foreground/70 group-hover:text-primary" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Query Input Box */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Target selector */}
          <div className="flex items-center gap-1 shrink-0">
            <select
              value={targetAgentId}
              onChange={(e) => setTargetAgentId(e.target.value)}
              disabled={asking}
              className="h-8 rounded-item border border-border bg-popover/80 px-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">Target: Active Commander</option>
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
          </div>

          {/* Text input */}
          <div className="relative flex-1">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={asking}
              placeholder="Ask Commander a question (e.g., blast radius, C2 IOCs, containment status)..."
              className="w-full rounded-item border border-border bg-popover/50 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:bg-popover focus:outline-none"
            />
          </div>

          {/* Send Button */}
          <Button
            size="sm"
            onClick={() => void handleSend()}
            disabled={asking || !prompt.trim()}
            className="h-8 gap-1.5 px-3 shrink-0"
          >
            {asking ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span className="text-xs">Analyzing...</span>
              </>
            ) : (
              <>
                <CornerDownLeft className="size-3.5" />
                <span className="text-xs">Transmit</span>
              </>
            )}
          </Button>
        </div>

        {/* Loading status or Error */}
        {asking ? (
          <div className="flex items-center gap-2 pt-0.5 text-[11px] text-primary animate-pulse">
            <span className="inline-block size-1.5 rounded-full bg-primary" />
            <span>Commander analyzing live telemetry and synthesizing tactical assessment...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-between text-[11px] text-destructive bg-destructive/10 px-2 py-1 rounded">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="underline hover:text-foreground">dismiss</button>
          </div>
        ) : null}
      </div>
    </PageContent>
  )
}

function ChatBubble({
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

  if (isOperatorQuery) {
    return (
      <div className="flex gap-3">
        <div className="mt-1 flex flex-col items-center gap-1">
          <span className="inline-block size-2.5 rounded-full" style={{ background: "var(--warning)" }} />
          <span className="w-px flex-1 bg-border" />
        </div>
        <div className="min-w-0 flex-1 rounded-shell border border-warning/35 bg-warning/[0.04] px-3 py-2.5 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge variant="outline" className="border-warning/50 bg-warning/10 font-mono text-[10px] text-warning tracking-wide">
              OPERATOR
            </Badge>
            <span className="text-[11px] text-muted-foreground">{KIND_LABEL[entry.kind] ?? "queries"}</span>
            <span className="text-xs font-medium text-foreground">{to?.callsign ?? "Commander"}</span>
            {incidentCode && entry.incidentId ? (
              <button
                type="button"
                onClick={() => onOpenIncident(entry.incidentId!)}
                className="font-mono text-[10px] text-muted-foreground hover:text-foreground hover:underline"
              >
                {incidentCode}
              </button>
            ) : null}
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">{shortTime(entry.at)}</span>
          </div>
          <div className="mt-1.5 text-xs leading-relaxed text-foreground font-medium">
            {formatMessageText(entry.text)}
          </div>
        </div>
      </div>
    )
  }

  if (isCommanderReply) {
    return (
      <div className="flex gap-3">
        <div className="mt-1 flex flex-col items-center gap-1">
          <span className="inline-block size-2.5 rounded-full" style={{ background: "var(--brand-phalanx)" }} />
          <span className="w-px flex-1 bg-border" />
        </div>
        <div className="min-w-0 flex-1 rounded-shell border border-primary/50 bg-primary/[0.06] px-3 py-2.5 shadow-sm shadow-primary/5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs font-semibold text-primary">{from?.callsign ?? "Commander"}</span>
            <Badge variant="outline" className="border-primary/50 bg-primary/10 font-mono text-[10px] text-primary tracking-wide">
              COMMANDER SITREP
            </Badge>
            <span className="text-[11px] text-muted-foreground">{KIND_LABEL[entry.kind] ?? "transmits to"}</span>
            <span className="text-xs font-medium text-warning">Operator</span>
            {incidentCode && entry.incidentId ? (
              <button
                type="button"
                onClick={() => onOpenIncident(entry.incidentId!)}
                className="font-mono text-[10px] text-muted-foreground hover:text-foreground hover:underline"
              >
                {incidentCode}
              </button>
            ) : null}
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">{shortTime(entry.at)}</span>
          </div>
          <div className="mt-2 text-xs leading-relaxed text-foreground space-y-0.5">
            {formatMessageText(entry.text)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <div className="mt-1 flex flex-col items-center gap-1">
        <span className="inline-block size-2.5 rounded-full" style={{ background: classColor(from) }} />
        <span className="w-px flex-1 bg-border" />
      </div>
      <div className={`min-w-0 flex-1 rounded-shell border px-3 py-2.5 ${isTask ? "border-border/60 bg-well" : "border-border bg-popover/40"}`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-medium text-foreground">{from?.callsign ?? entry.fromAgentId}</span>
          <span className="text-[11px] text-muted-foreground">{KIND_LABEL[entry.kind] ?? entry.kind}</span>
          {to ? <span className="text-xs font-medium text-foreground">{to.callsign}</span> : <span className="text-xs text-muted-foreground">everyone</span>}
          {incidentCode && entry.incidentId ? (
            <button type="button" onClick={() => onOpenIncident(entry.incidentId!)} className="font-mono text-[10px] text-muted-foreground hover:text-foreground hover:underline">
              {incidentCode}
            </button>
          ) : null}
          {isTask ? <Badge variant="outline" className="ml-auto font-mono text-[10px] text-muted-foreground">tasking</Badge> : null}
          <span className={`${isTask ? "" : "ml-auto"} font-mono text-[11px] text-muted-foreground`}>{shortTime(entry.at)}</span>
        </div>
        <p className={`mt-1.5 whitespace-pre-wrap text-xs leading-relaxed ${isTask ? "text-muted-foreground" : "text-foreground"}`}>{entry.text}</p>
      </div>
    </div>
  )
}
