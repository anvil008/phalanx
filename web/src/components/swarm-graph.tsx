import { useEffect, useMemo, useRef, useState } from "react"
import type { A2AMessageKind, AgentState, BusMessage, IncidentSeverity } from "@/lib/model"
import { VIRTUAL, type GraphLayout, type GraphNode } from "@/lib/graph-model"

/* The swarm graph.
   A canvas instrument rather than a document: nodes are agents, static edges
   are who reports to whom, and the moving packets are literal A2A messages —
   one per JSON-RPC hop, coloured by message kind. Watching the packets is
   watching the protocol, not an illustration of it. */

const PACKET_MS = 2400
const PACKET_TAIL = 0.22

interface Palette {
  canvas: string
  grid: string
  foreground: string
  muted: string
  faint: string
  border: string
  accent: string
  positive: string
  warning: string
  negative: string
  classes: Record<string, string>
  bus: Record<string, string>
  severity: Record<IncidentSeverity, string>
}

interface Packet {
  id: string
  from: string
  to: string
  kind: A2AMessageKind
  startedAt: number
}

export interface SwarmGraphProps {
  layout: GraphLayout
  bus: BusMessage[]
  selected: string | null
  onSelect: (agentId: string | null) => void
  /** Dim everything not attached to this incident. */
  focusIncidentId?: string | null
  onOpenIncident?: (incidentId: string) => void
  className?: string
}

function cssValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function readPalette(): Palette {
  return {
    canvas: cssValue("--phalanx-canvas"),
    grid: cssValue("--phalanx-grid"),
    foreground: cssValue("--foreground"),
    muted: cssValue("--muted-foreground"),
    faint: cssValue("--phalanx-paused"),
    border: cssValue("--border"),
    accent: cssValue("--brand-phalanx"),
    positive: cssValue("--positive"),
    warning: cssValue("--warning"),
    negative: cssValue("--destructive"),
    classes: {
      command: cssValue("--phalanx-class-command"),
      analysis: cssValue("--phalanx-class-analysis"),
      action: cssValue("--phalanx-class-action"),
      comms: cssValue("--phalanx-class-comms"),
    },
    bus: {
      task: cssValue("--phalanx-bus-task"),
      report: cssValue("--phalanx-bus-report"),
      query: cssValue("--phalanx-bus-query"),
      answer: cssValue("--phalanx-bus-report"),
      escalation: cssValue("--phalanx-bus-escalation"),
      broadcast: cssValue("--phalanx-bus-broadcast"),
      handoff: cssValue("--phalanx-bus-escalation"),
      operator_query: cssValue("--phalanx-bus-operator_query") || cssValue("--warning"),
      commander_reply: cssValue("--phalanx-bus-commander_reply") || cssValue("--phalanx-bus-task"),
    },
    severity: {
      sev1: cssValue("--phalanx-sev1"),
      sev2: cssValue("--phalanx-sev2"),
      sev3: cssValue("--phalanx-sev3"),
      sev4: cssValue("--phalanx-sev4"),
    },
  }
}

function withAlpha(color: string, alpha: number): string {
  const hex = color.trim()
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${alpha})`
  }
  if (hex.startsWith("oklch")) return hex.replace(")", ` / ${alpha})`)
  if (hex.startsWith("rgb(")) return hex.replace("rgb(", "rgba(").replace(")", ` / ${alpha})`)
  return hex
}

/** Working states earn a ring; standby does not. */
function stateRing(state: AgentState, palette: Palette): string | null {
  switch (state) {
    case "working":
      return palette.accent
    case "consulting":
      return palette.bus.query!
    case "briefing":
      return palette.bus.task!
    case "reporting":
      return palette.positive
    case "blocked":
      return palette.negative
    default:
      return null
  }
}

function edgePath(from: GraphNode, to: GraphNode): { cx: number; cy: number } {
  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  // Bow every edge the same way so parallel edges between the same pair of
  // clusters stay individually readable.
  const bow = Math.min(38, length * 0.11)
  return { cx: midX - (dy / length) * bow, cy: midY + (dx / length) * bow }
}

function quadPoint(from: GraphNode, control: { cx: number; cy: number }, to: GraphNode, t: number) {
  const inverse = 1 - t
  return {
    x: inverse * inverse * from.x + 2 * inverse * t * control.cx + t * t * to.x,
    y: inverse * inverse * from.y + 2 * inverse * t * control.cy + t * t * to.y,
  }
}

export function SwarmGraph({
  layout,
  bus,
  selected,
  onSelect,
  focusIncidentId = null,
  onOpenIncident,
  className,
}: SwarmGraphProps) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const packetsRef = useRef<Packet[]>([])
  const seenRef = useRef<Set<string>>(new Set())
  const layoutRef = useRef(layout)
  const busRef = useRef(bus)
  const focusRef = useRef(focusIncidentId)
  const selectedRef = useRef(selected)
  const [hover, setHover] = useState<{ node: GraphNode; x: number; y: number } | null>(null)
  const hoverRef = useRef<GraphNode | null>(null)

  layoutRef.current = layout
  busRef.current = bus
  focusRef.current = focusIncidentId
  selectedRef.current = selected

  // Only animate hops we actually witnessed. A page opened mid-incident should
  // not replay the whole backlog as a burst of packets.
  useEffect(() => {
    const now = performance.now()
    const fresh: Packet[] = []
    for (const message of bus) {
      if (seenRef.current.has(message.id)) continue
      seenRef.current.add(message.id)
      // Skip anything already stale by the time it reached the client.
      if (Date.now() - Date.parse(message.at) > PACKET_MS) continue
      if (message.toAgentId) {
        fresh.push({ id: message.id, from: message.fromAgentId, to: message.toAgentId, kind: message.kind, startedAt: now })
      } else {
        const peers = layoutRef.current.nodes.filter(
          (node) =>
            node.id !== message.fromAgentId &&
            !node.reserve &&
            (message.incidentId === null || node.incidentIds.includes(message.incidentId)),
        )
        for (const peer of peers) {
          fresh.push({ id: `${message.id}:${peer.id}`, from: message.fromAgentId, to: peer.id, kind: "broadcast", startedAt: now })
        }
      }
    }
    if (fresh.length > 0) packetsRef.current = [...packetsRef.current, ...fresh]
  }, [bus])

  const nodeAt = useMemo(
    () =>
      (screenX: number, screenY: number, scale: number, originX: number, originY: number): GraphNode | null => {
        let best: GraphNode | null = null
        let bestDistance = Infinity
        for (const node of layoutRef.current.nodes) {
          const dx = screenX - (originX + node.x * scale)
          const dy = screenY - (originY + node.y * scale)
          const distance = Math.hypot(dx, dy)
          const hit = Math.max(12, node.radius * scale + 8)
          if (distance <= hit && distance < bestDistance) {
            best = node
            bestDistance = distance
          }
        }
        return best
      },
    [],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    const shell = shellRef.current
    if (!canvas || !shell) return
    const context = canvas.getContext("2d")
    if (!context) return

    let palette = readPalette()
    let frame = 0
    let scale = 1
    let originX = 0
    let originY = 0
    let width = 0
    let height = 0
    let pointer: { x: number; y: number } | null = null

    const resize = () => {
      const rect = shell.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = Math.max(320, rect.width)
      height = Math.max(240, rect.height)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      const pad = 28
      scale = Math.min((width - pad * 2) / VIRTUAL.width, (height - pad * 2) / VIRTUAL.height)
      originX = (width - VIRTUAL.width * scale) / 2
      originY = (height - VIRTUAL.height * scale) / 2
      palette = readPalette()
    }

    const project = (node: { x: number; y: number }) => ({ x: originX + node.x * scale, y: originY + node.y * scale })

    const draw = () => {
      const current = layoutRef.current
      const now = performance.now()
      packetsRef.current = packetsRef.current.filter((packet) => now - packet.startedAt < PACKET_MS)

      context.clearRect(0, 0, width, height)
      context.fillStyle = palette.canvas
      context.fillRect(0, 0, width, height)

      // Grid. Fixed screen pitch so it reads as a backdrop, not as data.
      context.strokeStyle = withAlpha(palette.grid || "#ffffff", 0.35)
      context.lineWidth = 1
      for (let x = originX % 48; x < width; x += 48) {
        context.beginPath()
        context.moveTo(Math.round(x) + 0.5, 0)
        context.lineTo(Math.round(x) + 0.5, height)
        context.stroke()
      }
      for (let y = originY % 48; y < height; y += 48) {
        context.beginPath()
        context.moveTo(0, Math.round(y) + 0.5)
        context.lineTo(width, Math.round(y) + 0.5)
        context.stroke()
      }

      // Incident halos.
      for (const cluster of current.clusters) {
        const centre = project(cluster)
        const radius = cluster.radius * scale
        const tint = palette.severity[cluster.severity] ?? palette.accent
        const dim = focusRef.current !== null && focusRef.current !== cluster.incidentId
        const gradient = context.createRadialGradient(centre.x, centre.y, radius * 0.25, centre.x, centre.y, radius)
        gradient.addColorStop(0, withAlpha(tint, dim ? 0.03 : 0.075))
        gradient.addColorStop(1, withAlpha(tint, 0))
        context.fillStyle = gradient
        context.beginPath()
        context.arc(centre.x, centre.y, radius, 0, Math.PI * 2)
        context.fill()

        context.strokeStyle = withAlpha(tint, dim ? 0.1 : 0.22)
        context.setLineDash([4, 6])
        context.lineWidth = 1
        context.beginPath()
        context.arc(centre.x, centre.y, radius, 0, Math.PI * 2)
        context.stroke()
        context.setLineDash([])

        context.fillStyle = withAlpha(tint, dim ? 0.4 : 0.95)
        context.font = "650 12px ui-sans-serif, system-ui, sans-serif"
        context.textAlign = "center"
        context.fillText(cluster.code, centre.x, centre.y - radius - 16)
        context.fillStyle = withAlpha(palette.muted, dim ? 0.35 : 0.85)
        context.font = "500 11px ui-sans-serif, system-ui, sans-serif"
        context.fillText(
          cluster.status === "resolved" ? "resolved" : `${cluster.severity} · ${cluster.status}`,
          centre.x,
          centre.y - radius - 3,
        )
      }

      // Static edges.
      for (const edge of current.edges) {
        const from = current.nodeById.get(edge.from)
        const to = current.nodeById.get(edge.to)
        if (!from || !to) continue
        const dim = focusRef.current !== null && edge.incidentId !== null && edge.incidentId !== focusRef.current
        const highlighted =
          selectedRef.current !== null && (edge.from === selectedRef.current || edge.to === selectedRef.current)
        const control = edgePath(from, to)
        const a = project(from)
        const b = project(to)
        const c = { x: originX + control.cx * scale, y: originY + control.cy * scale }

        context.strokeStyle =
          edge.kind === "campaign"
            ? withAlpha(palette.warning, highlighted ? 0.7 : dim ? 0.12 : 0.34)
            : withAlpha(palette.foreground, highlighted ? 0.4 : dim ? 0.05 : 0.13)
        context.lineWidth = edge.kind === "campaign" ? 1.4 : 1
        if (edge.kind === "campaign") context.setLineDash([6, 5])
        context.beginPath()
        context.moveTo(a.x, a.y)
        context.quadraticCurveTo(c.x, c.y, b.x, b.y)
        context.stroke()
        context.setLineDash([])
      }

      // Packets — one per A2A hop.
      for (const packet of packetsRef.current) {
        const from = current.nodeById.get(packet.from)
        const to = current.nodeById.get(packet.to)
        if (!from || !to) continue
        const progress = (now - packet.startedAt) / PACKET_MS
        const control = edgePath(from, to)
        const colour = palette.bus[packet.kind] ?? palette.accent
        const fade = progress > 0.85 ? 1 - (progress - 0.85) / 0.15 : 1

        // Trail, then head. The trail is what makes direction readable.
        context.strokeStyle = withAlpha(colour, 0.4 * fade)
        context.lineWidth = 1.6
        context.beginPath()
        const tailStart = Math.max(0, progress - PACKET_TAIL)
        for (let step = 0; step <= 10; step += 1) {
          const t = tailStart + ((progress - tailStart) * step) / 10
          const point = quadPoint(from, control, to, Math.min(1, t))
          const screen = { x: originX + point.x * scale, y: originY + point.y * scale }
          if (step === 0) context.moveTo(screen.x, screen.y)
          else context.lineTo(screen.x, screen.y)
        }
        context.stroke()

        const head = quadPoint(from, control, to, Math.min(1, progress))
        const screenHead = { x: originX + head.x * scale, y: originY + head.y * scale }
        context.fillStyle = withAlpha(colour, 0.95 * fade)
        context.beginPath()
        context.arc(screenHead.x, screenHead.y, 2.6, 0, Math.PI * 2)
        context.fill()
        context.fillStyle = withAlpha(colour, 0.18 * fade)
        context.beginPath()
        context.arc(screenHead.x, screenHead.y, 6.5, 0, Math.PI * 2)
        context.fill()
      }

      // Nodes.
      for (const node of current.nodes) {
        const point = project(node)
        const dim =
          (focusRef.current !== null && !node.incidentIds.includes(focusRef.current) && !node.reserve) || node.reserve
        const colour = palette.classes[node.agentClass] ?? palette.accent
        const radius = Math.max(3.2, node.radius * scale)
        const isSelected = selectedRef.current === node.id
        const isHovered = hoverRef.current?.id === node.id

        const ring = stateRing(node.state, palette)
        if (ring && !node.reserve) {
          const pulse = 0.55 + 0.45 * Math.sin(now / 420 + node.x)
          context.strokeStyle = withAlpha(ring, 0.28 + 0.28 * pulse)
          context.lineWidth = 1.4
          context.beginPath()
          context.arc(point.x, point.y, radius + 5 + pulse * 2, 0, Math.PI * 2)
          context.stroke()
        }

        if (node.shared) {
          context.strokeStyle = withAlpha(palette.warning, 0.55)
          context.setLineDash([2, 3])
          context.lineWidth = 1
          context.beginPath()
          context.arc(point.x, point.y, radius + 3.5, 0, Math.PI * 2)
          context.stroke()
          context.setLineDash([])
        }

        context.fillStyle = withAlpha(colour, dim ? 0.32 : 1)
        context.beginPath()
        context.arc(point.x, point.y, radius, 0, Math.PI * 2)
        context.fill()

        if (node.kind === "commander") {
          context.strokeStyle = withAlpha(palette.canvas, 1)
          context.lineWidth = 2
          context.beginPath()
          context.arc(point.x, point.y, radius * 0.42, 0, Math.PI * 2)
          context.stroke()
        }

        if (isSelected || isHovered) {
          context.strokeStyle = withAlpha(palette.foreground, isSelected ? 0.85 : 0.45)
          context.lineWidth = 1.5
          context.beginPath()
          context.arc(point.x, point.y, radius + 8, 0, Math.PI * 2)
          context.stroke()
        }

        context.fillStyle = withAlpha(palette.foreground, dim ? 0.35 : node.kind === "commander" ? 0.95 : 0.75)
        context.font = `${node.kind === "commander" ? "650" : "500"} ${node.kind === "commander" ? 12 : 11}px ui-sans-serif, system-ui, sans-serif`
        context.textAlign = "center"
        context.fillText(node.label, point.x, point.y + radius + 13)
      }

      if (current.reserveLabel) {
        context.fillStyle = withAlpha(palette.muted, 0.6)
        context.font = "500 11px ui-sans-serif, system-ui, sans-serif"
        context.textAlign = "center"
        context.fillText(current.reserveLabel.toUpperCase(), width / 2, height - 12)
      }

      frame = requestAnimationFrame(draw)
    }

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      const node = nodeAt(pointer.x, pointer.y, scale, originX, originY)
      hoverRef.current = node
      canvas.dataset.hover = node ? "true" : "false"
      setHover(node ? { node, x: pointer.x, y: pointer.y } : null)
    }

    const onPointerLeave = () => {
      pointer = null
      hoverRef.current = null
      canvas.dataset.hover = "false"
      setHover(null)
    }

    const onClick = () => {
      const node = hoverRef.current
      if (!node) {
        onSelect(null)
        return
      }
      onSelect(node.id === selectedRef.current ? null : node.id)
      if (onOpenIncident && node.kind === "commander" && node.incidentIds.length === 1) {
        onOpenIncident(node.incidentIds[0]!)
      }
    }

    const observer = new ResizeObserver(resize)
    observer.observe(shell)
    resize()
    frame = requestAnimationFrame(draw)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerleave", onPointerLeave)
    canvas.addEventListener("click", onClick)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerleave", onPointerLeave)
      canvas.removeEventListener("click", onClick)
    }
  }, [nodeAt, onSelect, onOpenIncident])

  return (
    <div ref={shellRef} className={`phalanx-graph-shell ${className ?? ""}`}>
      <canvas ref={canvasRef} className="phalanx-graph-canvas" data-hover="false" />
      {hover ? (
        <div
          className="phalanx-tooltip"
          style={{
            left: Math.min(hover.x + 14, (shellRef.current?.clientWidth ?? 0) - 260),
            top: Math.max(8, hover.y - 12),
          }}
        >
          <div className="text-xs font-medium text-foreground">{hover.node.name}</div>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{hover.node.id}</div>
          <div className="mt-1.5 text-xs text-foreground">{hover.node.activity}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {hover.node.state}
            {hover.node.incidentIds.length > 0 ? ` · ${hover.node.incidentIds.length} incident${hover.node.incidentIds.length === 1 ? "" : "s"}` : ""}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function BusLegend({ className }: { className?: string }) {
  const items: { kind: A2AMessageKind; label: string }[] = [
    { kind: "task", label: "task" },
    { kind: "report", label: "report" },
    { kind: "query", label: "peer query" },
    { kind: "escalation", label: "escalation" },
    { kind: "broadcast", label: "broadcast" },
  ]
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground ${className ?? ""}`}>
      {items.map((item) => (
        <span key={item.kind} className="flex items-center gap-1.5">
          <span
            className="inline-block size-1.5 rounded-full"
            style={{ background: `var(--phalanx-bus-${item.kind})` }}
          />
          {item.label}
        </span>
      ))}
    </div>
  )
}

export function ClassLegend({ className }: { className?: string }) {
  const items = [
    { key: "command", label: "command" },
    { key: "analysis", label: "analysis" },
    { key: "action", label: "action" },
    { key: "comms", label: "comms" },
  ]
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground ${className ?? ""}`}>
      {items.map((item) => (
        <span key={item.key} className="flex items-center gap-1.5">
          <span className="inline-block size-1.5 rounded-full" style={{ background: `var(--phalanx-class-${item.key})` }} />
          {item.label}
        </span>
      ))}
    </div>
  )
}
