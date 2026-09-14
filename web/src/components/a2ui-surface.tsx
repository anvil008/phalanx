import { Badge } from "@foundry/ui/components/badge"
import { Button } from "@foundry/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/components/card"
import { Separator } from "@foundry/ui/components/separator"
import { StatusDot } from "@foundry/ui/components/status-dot"
import { resolve, type RenderedSurface } from "@/lib/a2ui"
import type { ComponentSpec } from "@/lib/model"
import { shortTime } from "@/lib/format"

/* A2UI renderer.
   The client knows the catalog and nothing else. Everything on this surface —
   which cards exist, what they say, what order they are in, which buttons they
   offer — was decided by an agent at run time and arrived as protocol
   messages. Adding a case here widens the catalog; it does not encode a
   feature. */

type Tone = "neutral" | "info" | "positive" | "warning" | "critical"

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-foreground",
  info: "text-info",
  positive: "text-positive",
  warning: "text-warning",
  critical: "text-destructive",
}

const TONE_DOT: Record<Tone, "neutral" | "info" | "positive" | "warning" | "negative"> = {
  neutral: "neutral",
  info: "info",
  positive: "positive",
  warning: "warning",
  critical: "negative",
}

/* The typography classes carry their own colour, so a tone has to win on
   importance rather than on order. Tailwind only emits candidates it can see,
   so these stay literal rather than being built from TONE_TEXT. */
const TONE_TEXT_IMPORTANT: Record<Tone, string> = {
  neutral: "",
  info: "text-info!",
  positive: "text-positive!",
  warning: "text-warning!",
  critical: "text-destructive!",
}

function toned(value: unknown): string {
  return TONE_TEXT_IMPORTANT[toneOf(value)]
}

function toneOf(value: unknown): Tone {
  const tone = String(value ?? "neutral")
  return (["neutral", "info", "positive", "warning", "critical"] as const).includes(tone as Tone)
    ? (tone as Tone)
    : "neutral"
}

interface RenderContext {
  surface: RenderedSurface
  onAction: (actionId: string, payload: Record<string, unknown>) => void
}

function str(value: unknown, data: Record<string, unknown>): string {
  const resolved = resolve(value, data)
  return resolved === null || resolved === undefined ? "" : String(resolved)
}

function arr<T>(value: unknown, data: Record<string, unknown>): T[] {
  const resolved = resolve(value, data)
  return Array.isArray(resolved) ? (resolved as T[]) : []
}

function Component({ id, context, depth = 0 }: { id: string; context: RenderContext; depth?: number }) {
  if (depth > 32) return null
  const spec: ComponentSpec | undefined = context.surface.components[id]
  if (!spec) return null
  const data = context.surface.data

  switch (spec.component) {
    case "Column":
      return (
        <div className={gapClass(spec.gap, "flex flex-col")}>
          {arr<string>(spec.children, data).map((child) => (
            <Component key={child} id={child} context={context} depth={depth + 1} />
          ))}
        </div>
      )

    case "Row":
      return (
        <div className={gapClass(spec.gap, "flex flex-wrap items-center")}>
          {arr<string>(spec.children, data).map((child) => (
            <Component key={child} id={child} context={context} depth={depth + 1} />
          ))}
        </div>
      )

    case "Card": {
      const tone = toneOf(spec.tone)
      return (
        <Card className="phalanx-card-in">
          <CardHeader className="gap-1 pb-0">
            {spec.kicker ? (
              <div className="meta-mono flex items-center gap-1.5">
                <StatusDot tone={TONE_DOT[tone]} pulse={tone === "critical"} />
                <span>{str(spec.kicker, data)}</span>
              </div>
            ) : null}
            <CardTitle className="title text-[0.875rem]!">{str(spec.title, data)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            {typeof spec.child === "string" ? <Component id={spec.child} context={context} depth={depth + 1} /> : null}
          </CardContent>
        </Card>
      )
    }

    case "Heading":
      return <h3 className="title text-[0.875rem]">{str(spec.text, data)}</h3>

    case "Text": {
      const tone = toneOf(spec.tone)
      const variant = String(spec.variant ?? "body")
      return (
        <p
          className={[
            variant === "mono" ? "meta-mono" : "prose text-[0.75rem]!",
            tone === "neutral" ? (variant === "lead" ? "text-ink!" : "") : toned(spec.tone),
          ].join(" ")}
        >
          {str(spec.text, data)}
        </p>
      )
    }

    case "Badge": {
      const tone = toneOf(spec.tone)
      return (
        <Badge variant="outline" data-tone={tone === "critical" ? "negative" : tone}>
          {str(spec.text, data)}
        </Badge>
      )
    }

    case "Divider":
      return <Separator />

    case "MetricRow": {
      const metrics = arr<{ label: string; value: string; delta?: string; tone?: string }>(spec.metrics, data)
      return (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <div className="eyebrow">{metric.label}</div>
              <div className={`mt-0.5 font-mono text-sm font-normal ${TONE_TEXT[toneOf(metric.tone)]}`}>{metric.value}</div>
              {metric.delta ? <div className="meta-mono">{metric.delta}</div> : null}
            </div>
          ))}
        </div>
      )
    }

    case "KeyValue": {
      const rows = arr<{ label: string; value: string; tone?: string }>(spec.rows, data)
      if (rows.length === 0) return null
      return (
        <dl className="flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[8.5rem_1fr] items-baseline gap-3">
              <dt className="meta-mono">{row.label}</dt>
              <dd className={`prose text-[0.75rem]! ${toned(row.tone)}`}>{row.value}</dd>
            </div>
          ))}
        </dl>
      )
    }

    case "List": {
      const items = arr<string>(spec.items, data)
      const tone = toneOf(spec.tone)
      const Tag = spec.ordered ? "ol" : "ul"
      return (
        <Tag className="flex flex-col gap-1.5 text-xs leading-relaxed">
          {items.map((item, index) => (
            <li key={index} className="flex gap-2">
              <span className="mt-1.5 inline-block size-1 shrink-0 rounded-full bg-current opacity-50" />
              <span className={tone === "neutral" ? "text-muted-foreground" : TONE_TEXT[tone]}>{item}</span>
            </li>
          ))}
        </Tag>
      )
    }

    case "Timeline": {
      const entries = arr<{ at: string; actor: string; text: string; tone?: string }>(spec.entries, data)
      return (
        <ol className="flex flex-col gap-2.5">
          {entries.map((entry, index) => (
            <li key={index} className="grid grid-cols-[4.5rem_1fr] gap-3">
              <span className="font-mono text-[11px] text-muted-foreground">{shortTime(entry.at)}</span>
              <span className="text-xs leading-relaxed">
                <span className="meta-mono text-ink!">{entry.actor}</span>{" "}
                <span className={TONE_TEXT[toneOf(entry.tone)]}>{entry.text}</span>
              </span>
            </li>
          ))}
        </ol>
      )
    }

    case "AgentChips": {
      const agents = arr<{ id: string; name: string; state: string }>(spec.agents, data)
      return (
        <div className="flex flex-wrap gap-1.5">
          {agents.map((agent) => (
            <span
              key={agent.id}
              className="meta-mono flex items-center gap-1.5 border border-rule-soft px-2 py-1"
            >
              <StatusDot
                tone={agent.state === "blocked" ? "negative" : agent.state === "standby" ? "faint" : "info"}
                pulse={agent.state === "working" || agent.state === "consulting"}
              />
              {agent.name}
            </span>
          ))}
        </div>
      )
    }

    case "Progress": {
      const value = Number(resolve(spec.value, data) ?? 0)
      const max = Math.max(1, Number(spec.max ?? 100) || 100)
      const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)))
      const tone = toneOf(spec.tone)
      const barTone =
        tone === "positive" ? "bg-positive" : tone === "critical" ? "bg-destructive" : tone === "warning" ? "bg-warning" : "bg-[color:var(--accent)]"
      return (
        <div>
          <div className="meta-mono flex items-baseline justify-between">
            <span>{str(spec.label, data)}</span>
            <span className="text-ink">{pct}%</span>
          </div>
          <div className="mt-1.5 h-px w-full bg-rule-soft">
            <div className={`h-px transition-all duration-500 ${barTone}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )
    }

    case "CodeBlock":
      return (
        <pre className="overflow-x-auto border border-rule-soft bg-wash p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {str(spec.text, data)}
        </pre>
      )

    case "ActionRow":
      return (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {arr<string>(spec.children, data).map((child) => (
            <Component key={child} id={child} context={context} depth={depth + 1} />
          ))}
        </div>
      )

    case "Action": {
      const tone = toneOf(spec.tone)
      return (
        <Button
          size="sm"
          variant={tone === "positive" ? "default" : "outline"}
          className={tone === "critical" ? "border-destructive/40 text-destructive" : undefined}
          onClick={() => context.onAction(String(spec.actionId), (spec.payload as Record<string, unknown>) ?? {})}
        >
          {str(spec.label, data)}
        </Button>
      )
    }

    default:
      // A catalog the client does not know is a protocol mismatch, not a crash.
      return (
        <div className="meta-mono border border-rule-soft px-2 py-1 text-[color:var(--warning)]!">
          unrenderable component: {spec.component}
        </div>
      )
  }
}

function gapClass(gap: unknown, base: string): string {
  const size = String(gap ?? "md")
  const map: Record<string, string> = { xs: "gap-1", sm: "gap-2", md: "gap-3", lg: "gap-4" }
  return `${base} ${map[size] ?? "gap-3"}`
}

export function A2UISurface({
  surface,
  onAction,
  empty,
}: {
  surface: RenderedSurface | undefined
  onAction: (actionId: string, payload: Record<string, unknown>) => void
  empty?: React.ReactNode
}) {
  if (!surface || !surface.root || !surface.components[surface.root]) {
    return <>{empty ?? null}</>
  }
  return <Component id={surface.root} context={{ surface, onAction }} />
}
