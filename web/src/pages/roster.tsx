import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@foundry/ui/components/badge"
import { Card, CardContent, CardHeader } from "@foundry/ui/components/card"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { AgentDetail } from "@/components/agent-detail"
import { SectionHeader } from "@/components/section-header"
import { CLASS_LABEL, type AgentClass } from "@/lib/model"
import { usePhalanx, useIncidentList } from "@/lib/store"

/* The Roster.
   Classified blue-team agent dossiers: live A2A discovery specifications,
   clearance stamps, real-time capacities, and operational skill cards. */

const ORDER: AgentClass[] = ["command", "analysis", "action", "comms"]

function getClearanceStamp(clearance: string): { label: string; variant: string } {
  switch (clearance) {
    case "command":
      return { label: "TS//SCI", variant: "border-primary/50 bg-primary/15 text-primary" }
    case "act":
      return { label: "SECRET", variant: "border-warning/50 bg-warning/15 text-warning" }
    default:
      return { label: "CONFIDENTIAL", variant: "border-border/80 bg-black/40 text-muted-foreground" }
  }
}

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
        subtitle={`${state.agents.length} autonomous defenders · ${
          state.mode === "live"
            ? `${state.commanderModel.toUpperCase()} / ${state.specialistModel.toUpperCase()}`
            : "deterministic replay"
        }`}
      />

      <div className="rounded-item border border-border/80 bg-card/70 p-3.5 backdrop-blur-md max-w-4xl text-xs font-mono text-muted-foreground leading-relaxed">
        Every agent publishes a live A2A discovery card describing its skills, instruments, and delegation heuristics. Incident commanders dynamically formulate task squads at run time without fixed static playbooks.
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {ORDER.map((agentClass) => {
            const members = state.agents.filter((each) => each.class === agentClass)
            if (members.length === 0) return null
            return (
              <section key={agentClass} className="flex flex-col gap-3">
                <SectionHeader title={CLASS_LABEL[agentClass].toUpperCase()}>
                  <span className="font-mono text-[10px] text-muted-foreground">[{members.length} OPERATORS]</span>
                </SectionHeader>

                <div className="grid gap-3.5 md:grid-cols-2 2xl:grid-cols-3">
                  {members.map((member) => {
                    const runtime = state.runtime.get(member.id)
                    const activeCount = runtime?.incidentIds.length ?? 0
                    const busy = activeCount > 0
                    const clearance = getClearanceStamp(member.clearance)
                    const capacityRatio = (activeCount / Math.max(1, member.capacity)) * 100

                    return (
                      <Card
                        key={member.id}
                        className={`cursor-pointer transition-all duration-200 bg-card/75 hover:bg-card hover:border-primary/50 relative overflow-hidden ${
                          selected === member.id
                            ? "border-primary shadow-[0_0_16px_rgba(76,201,217,0.25)] ring-1 ring-primary/40"
                            : "border-border"
                        }`}
                        onClick={() => setSelected(selected === member.id ? null : member.id)}
                      >
                        {/* Top hairline highlight */}
                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                        <CardHeader className="gap-2 pb-0 p-3.5">
                          <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block size-2 rounded-full shadow-[0_0_6px_currentColor]"
                                style={{
                                  background: `var(--phalanx-class-${member.class})`,
                                  color: `var(--phalanx-class-${member.class})`,
                                }}
                              />
                              <span className="font-mono text-xs font-bold tracking-wider text-foreground">
                                {member.callsign}
                              </span>
                              <span className="font-mono text-[10px] text-muted-foreground/80">
                                ({member.id})
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold border ${clearance.variant}`}
                              >
                                {clearance.label}
                              </span>
                              <StatusDot
                                tone={busy ? "warning" : "positive"}
                                pulse={runtime?.state === "working" || runtime?.state === "consulting"}
                              />
                            </div>
                          </div>

                          <div>
                            <div className="text-xs font-bold text-foreground">{member.name}</div>
                            <div className="font-mono text-[10px] text-muted-foreground/80 mt-0.5">
                              {CLASS_LABEL[member.class]} · {member.discipline}
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="flex flex-col gap-3 p-3.5 pt-2">
                          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {member.summary}
                          </p>

                          {/* Skill Chips */}
                          <div className="flex flex-wrap gap-1.5">
                            {member.skills.slice(0, 3).map((skill) => (
                              <Badge
                                key={skill.id}
                                variant="outline"
                                className="font-mono text-[9.5px] border-border/70 bg-black/40 text-muted-foreground px-2 py-0.5"
                              >
                                {skill.id}
                              </Badge>
                            ))}
                            {member.skills.length > 3 ? (
                              <span className="font-mono text-[9px] text-muted-foreground/60 self-center">
                                +{member.skills.length - 3}
                              </span>
                            ) : null}
                          </div>

                          {/* Capacity Gauge & Telemetry */}
                          <div className="pt-2 border-t border-border/40 flex flex-col gap-1.5">
                            <div className="flex items-center justify-between font-mono text-[10px]">
                              <span className="text-muted-foreground">
                                LOAD: <strong className="text-foreground">{activeCount}/{member.capacity}</strong>
                              </span>
                              <span className="text-muted-foreground">
                                {runtime?.tasksHandled ?? 0} TASKS
                              </span>
                            </div>
                            <div className="h-1 w-full rounded-full bg-border/60 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  capacityRatio > 80
                                    ? "bg-destructive"
                                    : capacityRatio > 0
                                      ? "bg-primary"
                                      : "bg-muted-foreground/30"
                                }`}
                                style={{ width: `${Math.max(4, Math.min(100, capacityRatio))}%` }}
                              />
                            </div>
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
