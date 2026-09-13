import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@foundry/ui/components/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/components/card"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { AgentDetail } from "@/components/agent-detail"
import { SectionHeader } from "@/components/section-header"
import { CLASS_LABEL, type AgentClass } from "@/lib/model"
import { usePhalanx, useIncidentList } from "@/lib/store"

/* The roster.
   Every card here is served as a real A2A agent card at
   /api/a2a/agents/{id}/.well-known/agent-card.json — this page is a rendering
   of the discovery document the commanders read, not a separate description. */

const ORDER: AgentClass[] = ["command", "analysis", "action", "comms"]

export function RosterPage() {
  const navigate = useNavigate()
  const state = usePhalanx()
  const incidents = useIncidentList()
  const [selected, setSelected] = useState<string | null>(null)
  const agent = selected ? state.agents.find((each) => each.id === selected) : undefined

  return (
    <PageContent className="phalanx-page-scroll-fade">
      <PageHeader
        title="Agent Roster"
        subtitle={`${state.agents.length} agents · ${state.mode === "live" ? `${state.commanderModel} / ${state.specialistModel}` : "replay"}`}
      />

      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Every agent publishes an A2A agent card describing its skills and a note on when to delegate to it. A commander
        reads these at run time and picks its own team — nothing here maps to a fixed workflow.
      </p>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {ORDER.map((agentClass) => {
            const members = state.agents.filter((each) => each.class === agentClass)
            if (members.length === 0) return null
            return (
              <section key={agentClass} className="flex flex-col gap-3">
                <SectionHeader title={CLASS_LABEL[agentClass]}>
                  <span className="font-mono text-[11px] text-muted-foreground">{members.length}</span>
                </SectionHeader>
                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {members.map((member) => {
                    const runtime = state.runtime.get(member.id)
                    const busy = (runtime?.incidentIds.length ?? 0) > 0
                    return (
                      <Card
                        key={member.id}
                        className={`cursor-pointer transition-colors hover:border-primary/40 ${selected === member.id ? "border-primary/60" : ""}`}
                        onClick={() => setSelected(selected === member.id ? null : member.id)}
                      >
                        <CardHeader className="gap-1.5 pb-0">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block size-1.5 rounded-full"
                              style={{ background: `var(--phalanx-class-${member.class})` }}
                            />
                            <span className="font-mono text-[11px] text-foreground">{member.callsign}</span>
                            <StatusDot
                              tone={busy ? "info" : "faint"}
                              pulse={runtime?.state === "working" || runtime?.state === "consulting"}
                              className="ml-auto"
                            />
                          </div>
                          <CardTitle className="text-sm font-medium normal-case leading-snug tracking-normal">{member.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-2.5 pt-2.5">
                          <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{member.summary}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {member.skills.slice(0, 3).map((skill) => (
                              <Badge key={skill.id} variant="outline" className="font-mono text-[10px] text-muted-foreground">
                                {skill.id}
                              </Badge>
                            ))}
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{member.clearance} clearance</span>
                            <span className="font-mono">
                              {runtime?.tasksHandled ?? 0} tasks · {runtime?.incidentIds.length ?? 0}/{member.capacity}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>

        {agent ? (
          <AgentDetail
            agent={agent}
            runtime={state.runtime.get(agent.id)}
            incidents={incidents}
            onClose={() => setSelected(null)}
            onOpenIncident={(incidentId) => navigate(`/incidents/${incidentId}`)}
          />
        ) : null}
      </div>
    </PageContent>
  )
}
