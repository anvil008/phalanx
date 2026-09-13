import { useMemo, useState } from "react"
import { Badge } from "@foundry/ui/components/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/components/card"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { SegmentedControl } from "@foundry/ui/components/segmented-control"
import { SectionHeader } from "@/components/section-header"
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
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="flex flex-col gap-3">
            <SectionHeader title="Hops" />
            {messages.length === 0 ? (
              <p className="text-xs text-muted-foreground">No traffic yet. Start a scenario.</p>
            ) : (
              <ol className="flex max-h-[42rem] flex-col overflow-y-auto">
                {messages.slice(0, 120).map((message) => (
                  <li key={message.id}>
                    <button
                      type="button"
                      className={`grid w-full grid-cols-[4.5rem_1fr] gap-3 border-b border-border/60 py-2 text-left transition-colors hover:bg-accent/50 ${
                        active?.id === message.id ? "bg-accent/60" : ""
                      }`}
                      onClick={() => setSelected(message.id)}
                    >
                      <span className="font-mono text-[11px] text-muted-foreground">{shortTime(message.at)}</span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-mono text-[11px] text-foreground">
                          {agents.get(message.fromAgentId)?.callsign ?? message.fromAgentId}
                          <span className="text-muted-foreground">→</span>
                          {message.toAgentId ? agents.get(message.toAgentId)?.callsign ?? message.toAgentId : "broadcast"}
                          <Badge variant="outline" className="ml-auto font-mono text-[10px] text-muted-foreground">
                            {message.kind}
                          </Badge>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{message.summary}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <SectionHeader title="Envelope" />
            {active ? (
              <>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">taskId {active.taskId ?? "—"}</span>
                  <span className="font-mono">incident {active.incidentId ?? "—"}</span>
                </div>
                <pre className="max-h-[38rem] overflow-auto rounded-shell border border-border bg-card p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {JSON.stringify(active.envelope, null, 2)}
                </pre>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Select a hop.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {[...state.surfaces.values()].map((surface) => (
            <Card key={surface.id}>
              <CardHeader className="pb-0">
                <CardTitle className="font-mono text-sm font-medium">{surface.id}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 pt-3">
                <div className="flex gap-3 text-[11px] text-muted-foreground">
                  <span>{Object.keys(surface.components).length} components</span>
                  <span>root {surface.root ?? "—"}</span>
                  <span className="ml-auto font-mono">{shortTime(surface.updatedAt)}</span>
                </div>
                <pre className="max-h-72 overflow-auto rounded-item border border-border bg-well p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {JSON.stringify(surface.components, null, 2).slice(0, 4000)}
                </pre>
              </CardContent>
            </Card>
          ))}
          {surfaceMessages.length === 0 ? (
            <p className="text-xs text-muted-foreground">No surfaces published yet.</p>
          ) : null}
        </div>
      )}
    </PageContent>
  )
}
