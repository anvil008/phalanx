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

const TONE_BORDER: Record<Tone, string> = {
  neutral: "border-border",
  info: "border-info/30",
  positive: "border-positive/30",
  warning: "border-warning/35",
  critical: "border-destructive/40",
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
        <Card className={`phalanx-card-in ${TONE_BORDER[tone]}`}>
          <CardHeader className="gap-1 pb-0">
            {spec.kicker ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <StatusDot tone={TONE_DOT[tone]} pulse={tone === "critical"} />
                <span className="font-mono">{str(spec.kicker, data)}</span>
              </div>
            ) : null}
            <CardTitle className="text-sm font-medium normal-case leading-snug tracking-normal">{str(spec.title, data)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            {typeof spec.child === "string" ? <Component id={spec.child} context={context} depth={depth + 1} /> : null}
          </CardContent>
        </Card>
      )
    }

    case "Heading":
      return <h3 className="text-sm font-medium text-foreground">{str(spec.text, data)}</h3>

    case "Text": {
      const tone = toneOf(spec.tone)
      const variant = String(spec.variant ?? "body")
      return (
        <p
          className={[
            variant === "lead" ? "text-sm leading-relaxed" : "text-xs leading-relaxed",
            variant === "mono" ? "font-mono" : "",
            tone === "neutral" ? (variant === "lead" ? "text-foreground" : "text-muted-foreground") : TONE_TEXT[tone],
          ].join(" ")}
        >
          {str(spec.text, data)}
        </p>
      )
    }

    case "Badge": {
      const tone = toneOf(spec.tone)
      return (
        <Badge variant="outline" className={`${TONE_TEXT[tone]} ${TONE_BORDER[tone]} font-mono text-[11px]`}>
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
              <div className="text-xs text-muted-foreground">{metric.label}</div>
              <div className={`mt-0.5 font-mono text-sm ${TONE_TEXT[toneOf(metric.tone)]}`}>{metric.value}</div>
              {metric.delta ? <div className="text-[11px] text-muted-foreground">{metric.delta}</div> : null}
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
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className={`text-xs leading-relaxed ${TONE_TEXT[toneOf(row.tone)]}`}>{row.value}</dd>
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
                <span className="font-mono text-[11px] text-muted-foreground">{entry.actor}</span>{" "}
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
              className="flex items-center gap-1.5 rounded-item border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground"
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
        tone === "positive" ? "bg-positive" : tone === "critical" ? "bg-destructive" : tone === "warning" ? "bg-warning" : "bg-primary"
      return (
        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">{str(spec.label, data)}</span>
            <span className="font-mono text-muted-foreground">{pct}%</span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-well">
            <div className={`h-full rounded-full transition-all duration-500 ${barTone}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )
    }

    case "CodeBlock":
      return (
        <pre className="overflow-x-auto rounded-item border border-border bg-well p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
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
        <div className="rounded-item border border-warning/30 px-2 py-1 font-mono text-[11px] text-warning">
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
