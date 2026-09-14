import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { AgentDetail } from "@/components/agent-detail"
import { SectionHeader } from "@/components/section-header"
import { CLASS_LABEL, type AgentClass } from "@/lib/model"
import { usePhalanx, useIncidentList } from "@/lib/store"

/* The Roster.
   One compact panel per agent, grouped by class: who it is, what it does, the
   skills it publishes and the load it is carrying. Selecting a card opens the
   agent detail beside the grid. */

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

      <p className="prose max-w-[72ch] text-[0.75rem]!">
        Every agent publishes a live A2A discovery card describing its skills, instruments, and
        delegation heuristics. Incident commanders formulate task squads at run time rather than
        following a fixed playbook.
      </p>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {ORDER.map((agentClass) => {
            const members = state.agents.filter((each) => each.class === agentClass)
            if (members.length === 0) return null
            return (
              <section key={agentClass} className="flex flex-col gap-2">
                <SectionHeader title={CLASS_LABEL[agentClass]}>
                  <span>{members.length} agents</span>
                </SectionHeader>

                <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {members.map((member) => {
                    const runtime = state.runtime.get(member.id)
                    const activeCount = runtime?.incidentIds.length ?? 0
                    const working = runtime?.state === "working" || runtime?.state === "consulting"

                    return (
                      <li key={member.id} className="flex">
                        <button
                          type="button"
                          className={`panel flex w-full flex-col gap-1.5 border-l-2 p-3 text-left transition-colors hover:bg-wash ${
                            selected === member.id ? "border-l-[var(--accent)]" : "border-l-rule-soft"
                          }`}
                          onClick={() => setSelected(selected === member.id ? null : member.id)}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className={`phalanx-signal ${working ? "phalanx-status-pulse" : ""}`}
                              style={{ color: `var(--phalanx-class-${member.class})` }}
                            />
                            <span className="truncate text-[0.8125rem] font-semibold tracking-[-0.01em] text-ink">
                              {member.name}
                            </span>
                          </span>

                          <span className="meta-mono truncate">
                            {member.callsign} · {member.discipline} · {CLASS_LABEL[member.class]}
                          </span>

                          <span className="prose line-clamp-2 text-[0.75rem]!">{member.summary}</span>

                          <span className="concepts mt-auto pt-1">
                            {member.skills.map((skill) => (
                              <span key={skill.id}>{skill.id}</span>
                            ))}
                          </span>

                          <span className="meta-mono">
                            Load {activeCount} / {member.capacity} · {runtime?.tasksHandled ?? 0} tasks
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
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
