import type { AgentDef, BusMessage } from "@/lib/model"
import { shortTime } from "@/lib/format"

/* The coordination bus, as a list.
   The graph shows that agents are talking; this shows what they said and in
   which direction, which is the part you need when something looks wrong. */

const KIND_TONE: Record<string, string> = {
  task: "info",
  report: "positive",
  query: "info",
  answer: "positive",
  escalation: "warning",
  broadcast: "muted",
  handoff: "warning",
  operator_query: "warning",
  commander_reply: "info",
}

export function BusTrace({
  messages,
  agents,
  onSelectAgent,
  emptyText = "No traffic yet.",
  limit = 60,
}: {
  messages: BusMessage[]
  agents: Map<string, AgentDef>
  onSelectAgent?: (agentId: string) => void
  emptyText?: string
  limit?: number
}) {
  const recent = messages.slice(-limit).reverse()
  if (recent.length === 0) {
    return <p className="meta-mono">{emptyText}</p>
  }
  return (
    <ol className="flex flex-col">
      {recent.map((message) => {
        const from = agents.get(message.fromAgentId)
        const to = message.toAgentId ? agents.get(message.toAgentId) : null
        return (
          <li key={message.id} className="rule-row grid-cols-[4.5rem_6rem_minmax(0,1fr)] items-baseline">
            <span className="meta-mono">{shortTime(message.at)}</span>
            <span className="sev-tag w-fit" data-tone={KIND_TONE[message.kind] ?? "muted"}>
              {message.kind}
            </span>
            <div className="min-w-0">
              <div className="meta-mono flex items-center gap-1.5">
                <button type="button" className="text-ink hover:underline" onClick={() => onSelectAgent?.(message.fromAgentId)}>
                  {from?.callsign ?? message.fromAgentId}
                </button>
                <span>→</span>
                {to ? (
                  <button type="button" className="text-ink hover:underline" onClick={() => onSelectAgent?.(to.id)}>
                    {to.callsign}
                  </button>
                ) : (
                  <span>everyone</span>
                )}
              </div>
              <p className="prose-serif mt-0.5">{message.summary}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
