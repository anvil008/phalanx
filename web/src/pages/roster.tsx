import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { AgentDetail } from "@/components/agent-detail"
import { SectionHeader } from "@/components/section-header"
import { CLASS_LABEL, type AgentClass } from "@/lib/model"
import { usePhalanx, useIncidentList } from "@/lib/store"

/* The Roster.
   One hairline row per agent, grouped by class: callsign and id on the left,
   the dossier in the middle, published skills and current load on the right.
   Selecting a row opens the agent detail beside the list. */

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
        subtitle={`${state.agents.length} agents · ${
          state.mode === "live"
            ? `${state.commanderModel} / ${state.specialistModel}`
            : "deterministic replay"
        }`}
      />

      <p className="prose-serif max-w-[62ch]">
        Every agent publishes a live A2A discovery card describing its skills, instruments, and
        delegation heuristics. Incident commanders formulate task squads at run time rather than
        following a fixed playbook.
      </p>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          {ORDER.map((agentClass) => {
            const members = state.agents.filter((each) => each.class === agentClass)
            if (members.length === 0) return null
            return (
              <section key={agentClass} className="flex flex-col">
                <SectionHeader title={CLASS_LABEL[agentClass]}>
                  <span>{members.length} agents</span>
                </SectionHeader>

                {members.map((member) => {
                  const runtime = state.runtime.get(member.id)
                  const activeCount = runtime?.incidentIds.length ?? 0
                  const working = runtime?.state === "working" || runtime?.state === "consulting"

                  return (
                    <button
                      key={member.id}
                      type="button"
                      className={`rule-row w-full border-l-2 text-left md:grid-cols-[8.5rem_minmax(0,1.15fr)_minmax(0,0.7fr)] ${
                        selected === member.id ? "border-l-[var(--accent)]" : "border-l-transparent"
                      }`}
                      style={{ paddingLeft: "0.75rem" }}
                      onClick={() => setSelected(selected === member.id ? null : member.id)}
                    >
                      <span className="flex flex-col gap-1">
                        <span className="meta-mono flex items-center gap-2 text-ink!">
                          <span
                            className={`phalanx-signal ${working ? "phalanx-status-pulse" : ""}`}
                            style={{ color: `var(--phalanx-class-${member.class})` }}
                          />
                          {member.callsign}
                        </span>
                        <span className="meta-mono">{member.id}</span>
                      </span>

                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="title-serif text-[1.125rem]">{member.name}</span>
                        <span className="meta-mono">
                          {member.discipline} · {CLASS_LABEL[member.class]}
                        </span>
                        <span className="prose-serif max-w-[58ch]">{member.summary}</span>
                      </span>

                      <span className="flex flex-col gap-1.5">
                        <span className="concepts">
                          {member.skills.map((skill) => (
                            <span key={skill.id}>{skill.id}</span>
                          ))}
                        </span>
                        <span className="meta-mono">
                          Load {activeCount} / {member.capacity} · {runtime?.tasksHandled ?? 0} tasks
                        </span>
                      </span>
                    </button>
                  )
                })}
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
