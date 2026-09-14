import { useMemo, useState } from "react"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { SegmentedControl } from "@foundry/ui/components/segmented-control"
import { PanelSection } from "@/components/section-header"
import { shortTime } from "@/lib/format"
import { useAgentIndex, usePhalanx } from "@/lib/store"

/* Protocol trace.
   Both protocols, unedited. The left column is the JSON-RPC that actually
   moved between agents; the right is the A2UI stream that produced the cards
   on the other pages. If the demo is claiming to speak these protocols, this
   is where that claim is checkable. */

type Tab = "a2a" | "a2ui"

export function ProtocolPage() {
  const state = usePhalanx()
  const agents = useAgentIndex()
  const [tab, setTab] = useState<Tab>("a2a")
  const [selected, setSelected] = useState<string | null>(null)

  const surfaceMessages = useMemo(
    () =>
      [...state.surfaces.values()]
        .flatMap((surface) =>
          surface.components && Object.keys(surface.components).length > 0
            ? [{ surfaceId: surface.id, updatedAt: surface.updatedAt, components: Object.keys(surface.components).length }]
            : [],
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [state.surfaces],
  )

  const messages = [...state.bus].reverse()
  const active = selected ? messages.find((each) => each.id === selected) : messages[0]

  return (
    <PageContent className="phalanx-page-scroll-fade">
      <PageHeader title="Protocol Trace" subtitle={`${state.bus.length} A2A hops · ${state.surfaces.size} A2UI surfaces`} />

      <SegmentedControl<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "a2a", label: "A2A · JSON-RPC" },
          { value: "a2ui", label: "A2UI · surfaces" },
        ]}
        className="w-fit"
      />

      {tab === "a2a" ? (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <PanelSection title="Hops" meta={<span>{messages.length} recorded</span>}>
            {messages.length === 0 ? (
              <p className="prose px-3 py-2.5 text-[0.75rem]!">No traffic yet. Start a scenario.</p>
            ) : (
              <ol className="flex max-h-[42rem] flex-col overflow-y-auto">
                {messages.slice(0, 120).map((message) => (
                  <li key={message.id}>
                    <button
                      type="button"
                      className="panel-row w-full grid-cols-[4.5rem_minmax(0,1fr)] items-baseline text-left"
                      data-interactive="true"
                      style={active?.id === message.id ? { background: "var(--wash)" } : undefined}
                      onClick={() => setSelected(message.id)}
                    >
                      <span className="meta-mono">{shortTime(message.at)}</span>
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="meta-mono flex items-center gap-1.5 text-ink!">
                          {agents.get(message.fromAgentId)?.callsign ?? message.fromAgentId}
                          <span className="text-muted-foreground">→</span>
                          {message.toAgentId ? agents.get(message.toAgentId)?.callsign ?? message.toAgentId : "broadcast"}
                          <span
                            className="sev-tag ml-auto"
                            style={{ color: `var(--phalanx-bus-${message.kind}, var(--muted))` }}
                          >
                            {message.kind}
                          </span>
                        </span>
                        <span className="prose truncate text-[0.75rem]!">{message.summary}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </PanelSection>

          <PanelSection title="Envelope" meta={active ? <span>{active.kind}</span> : undefined}>
            {active ? (
              <div className="flex flex-col gap-2 px-3 py-2.5">
                <div className="meta-mono flex flex-wrap gap-3">
                  <span>taskId {active.taskId ?? "—"}</span>
                  <span>incident {active.incidentId ?? "—"}</span>
                </div>
                <pre className="max-h-[38rem] overflow-auto border border-rule-soft p-3 font-mono text-[0.75rem] leading-relaxed text-muted-foreground">
                  {JSON.stringify(active.envelope, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="prose px-3 py-2.5 text-[0.75rem]!">Select a hop.</p>
            )}
          </PanelSection>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {[...state.surfaces.values()].map((surface) => (
            <section key={surface.id} className="panel flex flex-col">
              <div className="panel-head">
                <span className="meta-mono flex-1 text-ink!">{surface.id}</span>
                <span className="meta-mono">{shortTime(surface.updatedAt)}</span>
              </div>
              <div className="flex flex-col gap-2 px-3 py-2.5">
                <div className="meta-mono flex gap-3">
                  <span>{Object.keys(surface.components).length} components</span>
                  <span>root {surface.root ?? "—"}</span>
                </div>
                <pre className="max-h-72 overflow-auto border border-rule-soft p-3 font-mono text-[0.75rem] leading-relaxed text-muted-foreground">
                  {JSON.stringify(surface.components, null, 2).slice(0, 4000)}
                </pre>
              </div>
            </section>
          ))}
          {surfaceMessages.length === 0 ? (
            <p className="prose text-[0.75rem]!">No surfaces published yet.</p>
          ) : null}
        </div>
      )}
    </PageContent>
  )
}
