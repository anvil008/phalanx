import { Badge } from "@foundry/ui/components/badge"
import type { AgentDef, BusMessage } from "@/lib/model"
import { shortTime } from "@/lib/format"

/* The coordination bus, as a list.
   The graph shows that agents are talking; this shows what they said and in
   which direction, which is the part you need when something looks wrong. */

const KIND_TONE: Record<string, string> = {
  task: "text-primary border-primary/30",
  report: "text-positive border-positive/30",
  query: "text-info border-info/30",
  answer: "text-positive border-positive/30",
  escalation: "text-warning border-warning/35",
  broadcast: "text-[color:var(--phalanx-bus-broadcast)] border-[color:var(--phalanx-bus-broadcast)]/30",
  handoff: "text-warning border-warning/35",
  operator_query: "text-warning border-warning/35",
  commander_reply: "text-primary border-primary/30",
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
    return <p className="text-xs text-muted-foreground">{emptyText}</p>
  }
  return (
    <ol className="flex flex-col">
      {recent.map((message) => {
        const from = agents.get(message.fromAgentId)
        const to = message.toAgentId ? agents.get(message.toAgentId) : null
        return (
          <li
            key={message.id}
            className="grid grid-cols-[4.5rem_5.5rem_1fr] items-baseline gap-3 border-b border-border/60 py-2 last:border-b-0"
          >
            <span className="font-mono text-[11px] text-muted-foreground">{shortTime(message.at)}</span>
            <Badge variant="outline" className={`w-fit font-mono text-[10px] ${KIND_TONE[message.kind] ?? ""}`}>
              {message.kind}
            </Badge>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <button
                  type="button"
                  className="text-foreground hover:underline"
                  onClick={() => onSelectAgent?.(message.fromAgentId)}
                >
                  {from?.callsign ?? message.fromAgentId}
                </button>
                <span className="text-muted-foreground">→</span>
                {to ? (
                  <button type="button" className="text-foreground hover:underline" onClick={() => onSelectAgent?.(to.id)}>
                    {to.callsign}
                  </button>
                ) : (
                  <span className="text-muted-foreground">everyone</span>
                )}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{message.summary}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
