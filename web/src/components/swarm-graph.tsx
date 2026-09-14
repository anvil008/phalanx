import { useEffect, useMemo, useRef, useState } from "react"
import { gsap } from "gsap"
import type { A2AMessageKind, AgentClass, AgentState, BusMessage, IncidentSeverity } from "@/lib/model"
import { VIRTUAL, type GraphLayout, type GraphNode } from "@/lib/graph-model"
import { useAgentIndex } from "@/lib/store"
import { Grid, Hexagon, Shield } from "lucide-react"

/* The Phalanx Swarm Graph Instrument.
   A native cyber-tactical canvas instrument:
   - "Tactical Mesh": Incident topology with commander hubs and dynamic specialist links.
   - "Hex Constellation": Geometric defensive lattice inspired by anvilpalamattam.com.
   - "Incident Focus": Incident-centric blast radius & containment perimeter.
   - Enhanced A2A photon packets traveling along quadratic bezier flight paths. */

const PACKET_MS = 2400
const PACKET_TAIL = 0.24

export type SwarmCanvasMode = "tactical" | "hex" | "focus"

interface Palette {
  canvas: string
  grid: string
  foreground: string
  muted: string
  faint: string
  border: string
  accent: string
  accentIndigo: string
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

interface AnimatedCoord {
  x: number
  y: number
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
  generation?: number
}

function cssValue(name: string): string {
  if (typeof document === "undefined") return ""
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function readPalette(): Palette {
  return {
    canvas: cssValue("--phalanx-canvas") || "#080908",
    grid: cssValue("--phalanx-grid") || "rgba(241, 240, 233, 0.05)",
    foreground: cssValue("--foreground") || "#f1f0e9",
    muted: cssValue("--muted-foreground") || "#a3a299",
    faint: cssValue("--phalanx-paused") || "#787770",
    border: cssValue("--border") || "rgba(241, 240, 233, 0.10)",
    accent: cssValue("--brand-phalanx") || "#79a7ff",
    accentIndigo: cssValue("--accent-indigo") || "#79a7ff",
    positive: cssValue("--positive") || "#3ecf8e",
    warning: cssValue("--warning") || "#e0b34d",
    negative: cssValue("--destructive") || "#f2565f",
    classes: {
      command: cssValue("--phalanx-class-command") || "#79a7ff",
      analysis: cssValue("--phalanx-class-analysis") || "#79a7ff",
      action: cssValue("--phalanx-class-action") || "oklch(0.72 0.15 45)",
      comms: cssValue("--phalanx-class-comms") || "oklch(0.72 0.13 310)",
    },
    bus: {
      task: cssValue("--phalanx-bus-task") || "#79a7ff",
      report: cssValue("--phalanx-bus-report") || "#3ecf8e",
      query: cssValue("--phalanx-bus-query") || "#79a7ff",
      answer: cssValue("--phalanx-bus-report") || "#3ecf8e",
      escalation: cssValue("--phalanx-bus-escalation") || "#e0b34d",
      broadcast: cssValue("--phalanx-bus-broadcast") || "oklch(0.72 0.13 310)",
      handoff: cssValue("--phalanx-bus-escalation") || "#e0b34d",
      operator_query: cssValue("--phalanx-bus-operator_query") || "#e0b34d",
      commander_reply: cssValue("--phalanx-bus-commander_reply") || "#79a7ff",
    },
    severity: {
      sev1: cssValue("--phalanx-sev1") || "#f2565f",
      sev2: cssValue("--phalanx-sev2") || "#e0b34d",
      sev3: cssValue("--phalanx-sev3") || "#79a7ff",
      sev4: cssValue("--phalanx-sev4") || "#a3a299",
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

function stateRing(state: AgentState, palette: Palette): string | null {
  switch (state) {
    case "working":
      return palette.accent
    case "consulting":
      return palette.bus.query || palette.accentIndigo
    case "briefing":
      return palette.bus.task || palette.accent
    case "reporting":
      return palette.positive
    case "blocked":
      return palette.negative
    default:
      return null
  }
}

function edgePath(from: { x: number; y: number }, to: { x: number; y: number }): { cx: number; cy: number } {
  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  const bow = Math.min(36, length * 0.12)
  return { cx: midX - (dy / length) * bow, cy: midY + (dx / length) * bow }
}

function quadPoint(
  from: { x: number; y: number },
  control: { cx: number; cy: number },
  to: { x: number; y: number },
  t: number,
) {
  const inverse = 1 - t
  return {
    x: inverse * inverse * from.x + 2 * inverse * t * control.cx + t * t * to.x,
    y: inverse * inverse * from.y + 2 * inverse * t * control.cy + t * t * to.y,
  }
}

/**
 * Compute positions for "Tactical Mesh" mode:
 * Structured 2D tactical network mesh organized by operational tier across VIRTUAL dimensions (1240 x 620):
 * - Command Tier (y: 115): Atlas, Vesper, Orion, Solaris, Aegis
 * - Analysis Tier (y: 250): Triage, Intel, Forensics, Malware, Hunt, Vuln, Identity, Network
 * - Action Tier (y: 390): Contain, Remediate, Detect
 * - Comms & Governance Tier (y: 520): Comms, Legal, Scribe
 */
function computeTacticalMeshPositions(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()

  const tierConfigs: {
    tierClass: AgentClass
    y: number
    preferredOrder: string[]
    margin: number
  }[] = [
    {
      tierClass: "command",
      y: 115,
      preferredOrder: ["ic-atlas", "ic-vesper", "ic-orrery", "ic-warden", "ic-marshal"],
      margin: 180,
    },
    {
      tierClass: "analysis",
      y: 250,
      preferredOrder: [
        "triage-sentry",
        "intel-oracle",
        "forensics-cinder",
        "malware-splice",
        "hunt-drift",
        "vuln-lathe",
        "identity-keystone",
        "network-tide",
      ],
      margin: 100,
    },
    {
      tierClass: "action",
      y: 390,
      preferredOrder: ["contain-bulwark", "remediate-forge", "detect-loom"],
      margin: 260,
    },
    {
      tierClass: "comms",
      y: 520,
      preferredOrder: ["comms-herald", "legal-canon", "scribe-ledger"],
      margin: 260,
    },
  ]

  for (const { tierClass, y, preferredOrder, margin } of tierConfigs) {
    const tierNodes = nodes.filter((n) => n.agentClass === tierClass)
    tierNodes.sort((a, b) => {
      const idxA = preferredOrder.indexOf(a.id)
      const idxB = preferredOrder.indexOf(b.id)
      if (idxA !== -1 && idxB !== -1) return idxA - idxB
      if (idxA !== -1) return -1
      if (idxB !== -1) return 1
      return a.label.localeCompare(b.label)
    })

    const count = tierNodes.length
    if (count === 0) continue

    const availableWidth = VIRTUAL.width - margin * 2
    const step = count > 1 ? availableWidth / (count - 1) : 0

    tierNodes.forEach((node, idx) => {
      const x = count === 1 ? VIRTUAL.width / 2 : margin + idx * step
      positions.set(node.id, { x, y })
    })
  }

  // Fallback for any unpositioned nodes
  nodes.forEach((node) => {
    if (!positions.has(node.id)) {
      positions.set(node.id, { x: node.x, y: node.y })
    }
  })

  return positions
}

/** Compute positions for "Hex Constellation" mode (symmetrical orbital lattice) */
function computeHexConstellationPositions(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const cx = VIRTUAL.width / 2
  const cy = VIRTUAL.height / 2

  const commanders = nodes.filter((n) => n.kind === "commander")
  const specialists = nodes.filter((n) => n.kind !== "commander")

  // Position commanders in the hub
  if (commanders.length === 1) {
    positions.set(commanders[0]!.id, { x: cx, y: cy })
  } else if (commanders.length === 2) {
    positions.set(commanders[0]!.id, { x: cx - 75, y: cy })
    positions.set(commanders[1]!.id, { x: cx + 75, y: cy })
  } else if (commanders.length >= 3) {
    commanders.forEach((cmd, idx) => {
      const angle = (idx * Math.PI * 2) / commanders.length - Math.PI / 2
      positions.set(cmd.id, { x: cx + 105 * Math.cos(angle), y: cy + 105 * Math.sin(angle) })
    })
  }

  // Inner specialists (first 6): Hexagonal ring at radius 200
  const innerSpecialists = specialists.slice(0, 6)
  const outerSpecialists = specialists.slice(6)

  innerSpecialists.forEach((spec, idx) => {
    const angle = (idx * Math.PI * 2) / innerSpecialists.length - Math.PI / 6
    positions.set(spec.id, {
      x: cx + 200 * Math.cos(angle),
      y: cy + 200 * Math.sin(angle),
    })
  })

  // Outer specialists (remaining): Outer ring at radius 290
  outerSpecialists.forEach((spec, idx) => {
    const angle = (idx * Math.PI * 2) / Math.max(1, outerSpecialists.length) - Math.PI / 12
    positions.set(spec.id, {
      x: cx + 290 * Math.cos(angle),
      y: cy + 290 * Math.sin(angle),
    })
  })

  return positions
}

/** Compute positions for "Incident Focus" mode */
function computeIncidentFocusPositions(
  layout: GraphLayout,
  _focusedId: string | null,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const { nodes, clusters } = layout

  // If no clusters exist (all quiet / standby), use default bench positions
  if (clusters.length === 0) {
    nodes.forEach((n) => positions.set(n.id, { x: n.x, y: n.y }))
    return positions
  }

  // 1. Single Incident Mode: Left Standby Roster Column + Right Stage
  if (clusters.length === 1) {
    const cluster = clusters[0]!
    const centerX = 780
    const centerY = 310
    const placedIds = new Set<string>()

    // Commander at exact center of cluster halo
    const commander = nodes.find(
      (n) => n.kind === "commander" && n.incidentIds.includes(cluster.incidentId),
    ) || nodes.find((n) => n.id === cluster.commanderId)

    if (commander) {
      positions.set(commander.id, { x: centerX, y: centerY })
      placedIds.add(commander.id)
    }

    // Active specialists orbiting inside cluster.radius
    const clusterSpecs = nodes.filter(
      (n) => n.kind !== "commander" && n.incidentIds.includes(cluster.incidentId),
    )
    const count = clusterSpecs.length
    if (count > 0) {
      const baseR = 145
      clusterSpecs.forEach((spec, idx) => {
        const angle = (idx / count) * 2 * Math.PI - Math.PI / 2
        const stagger = idx % 2 === 0 ? -16 : 20
        const r = baseR + stagger
        positions.set(spec.id, {
          x: centerX + Math.cos(angle) * r,
          y: centerY + Math.sin(angle) * (r * 0.85),
        })
        placedIds.add(spec.id)
      })
    }

    // Peer commanders attached to this incident or linked: spread horizontally (260px) above cluster
    const extraCommanders = nodes.filter(
      (n) => n.kind === "commander" && !placedIds.has(n.id) && n.incidentIds.length > 0,
    )
    extraCommanders.forEach((cmd, idx) => {
      const x = centerX + (idx - (extraCommanders.length - 1) / 2) * 260
      const y = Math.max(50, centerY - 210 - 45)
      positions.set(cmd.id, { x, y })
      placedIds.add(cmd.id)
    })

    // Standby agents: clean 2-column vertical roster on the left side
    const unassigned = nodes.filter((n) => !placedIds.has(n.id))
    const classOrder = ["command", "analysis", "action", "comms"]
    const sortedUnassigned = [...unassigned].sort((a, b) => {
      const byClass = classOrder.indexOf(a.agentClass) - classOrder.indexOf(b.agentClass)
      return byClass !== 0 ? byClass : a.label.localeCompare(b.label)
    })

    sortedUnassigned.forEach((node, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const x = col === 0 ? 95 : 205
      const y = 95 + row * 65
      positions.set(node.id, { x, y })
      placedIds.add(node.id)
    })

    // Fallback for any remaining nodes
    nodes.forEach((node) => {
      if (!positions.has(node.id)) {
        positions.set(node.id, { x: node.x, y: node.y })
      }
    })

    return positions
  }

  // 2. Multi-Cluster Campaign Mode (clusters.length >= 2):
  // Standby roster on left (x = 95 and 205), Incident 1 at 510, Incident 2 at 980, shared at 745
  const placedIds = new Set<string>()

  // Position each cluster's commander and exclusive specialists
  clusters.forEach((cluster, clusterIdx) => {
    const cx = clusterIdx === 0 ? 510 : clusterIdx === 1 ? 980 : cluster.x
    const cy = 310

    const commander = nodes.find(
      (n) => n.kind === "commander" && n.incidentIds.includes(cluster.incidentId),
    ) || nodes.find((n) => n.id === cluster.commanderId)

    if (commander && !placedIds.has(commander.id)) {
      positions.set(commander.id, { x: cx, y: cy })
      placedIds.add(commander.id)
    }

    const clusterSpecs = nodes.filter(
      (n) =>
        n.kind !== "commander" &&
        n.incidentIds.length === 1 &&
        n.incidentIds[0] === cluster.incidentId &&
        !placedIds.has(n.id),
    )

    const specCount = clusterSpecs.length
    if (specCount > 0) {
      const baseRadius = 125
      clusterSpecs.forEach((spec, idx) => {
        const angle = (idx / specCount) * (Math.PI * 2) - Math.PI / 2
        const stagger = idx % 2 === 0 ? -16 : 20
        const r = baseRadius + stagger
        positions.set(spec.id, {
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * (r * 0.85),
        })
        placedIds.add(spec.id)
      })
    }
  })

  // Shared specialists in multiple incidents or shared: bridge column at x = 745
  const sharedNodes = nodes.filter(
    (n) => (n.incidentIds.length > 1 || n.shared) && !placedIds.has(n.id),
  )
  if (sharedNodes.length > 0) {
    const bridgeX = 745
    sharedNodes.forEach((node, idx) => {
      const y = 310 + (idx - (sharedNodes.length - 1) / 2) * 58
      positions.set(node.id, { x: bridgeX, y })
      placedIds.add(node.id)
    })
  }

  // Linked commanders (extra commanders engaged in campaign): bridge column above
  const linkedCommanders = nodes.filter(
    (n) => n.kind === "commander" && !placedIds.has(n.id) && n.incidentIds.length > 0,
  )
  if (linkedCommanders.length > 0) {
    const bridgeX = 745
    linkedCommanders.forEach((cmd, idx) => {
      const y = Math.max(50, 310 - 210 - 45 + (idx - (linkedCommanders.length - 1) / 2) * 45)
      positions.set(cmd.id, { x: bridgeX, y })
      placedIds.add(cmd.id)
    })
  }

  // All remaining unassigned agents go to the left standby roster
  const unassigned = nodes.filter((n) => !placedIds.has(n.id))
  const classOrder = ["command", "analysis", "action", "comms"]
  const sortedUnassigned = [...unassigned].sort((a, b) => {
    const byClass = classOrder.indexOf(a.agentClass) - classOrder.indexOf(b.agentClass)
    return byClass !== 0 ? byClass : a.label.localeCompare(b.label)
  })
  sortedUnassigned.forEach((node, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = col === 0 ? 95 : 205
    const y = 95 + row * 65
    positions.set(node.id, { x, y })
    placedIds.add(node.id)
  })

  // Fallback for any unpositioned nodes
  nodes.forEach((node) => {
    if (!positions.has(node.id)) {
      positions.set(node.id, { x: node.x, y: node.y })
    }
  })

  return positions
}

export function SwarmGraph({
  layout,
  bus,
  selected,
  onSelect,
  focusIncidentId = null,
  onOpenIncident,
  className,
  generation,
}: SwarmGraphProps) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const packetsRef = useRef<Packet[]>([])
  const seenRef = useRef<Set<string>>(new Set())
  const layoutRef = useRef(layout)
  const busRef = useRef(bus)
  const focusRef = useRef(focusIncidentId)
  const selectedRef = useRef(selected)

  const [mode, setMode] = useState<SwarmCanvasMode>("tactical")
  const modeRef = useRef<SwarmCanvasMode>(mode)
  modeRef.current = mode

  const animCoordsRef = useRef<Map<string, AnimatedCoord>>(new Map())

  const agentDefs = useAgentIndex()
  const [hover, setHover] = useState<{ node: GraphNode; x: number; y: number } | null>(null)
  const hoverRef = useRef<GraphNode | null>(null)

  layoutRef.current = layout
  busRef.current = bus
  focusRef.current = focusIncidentId
  selectedRef.current = selected

  // Handle world generation resets or bus clear
  const prevGenRef = useRef(generation)
  useEffect(() => {
    if (generation !== undefined && prevGenRef.current !== undefined && generation !== prevGenRef.current) {
      packetsRef.current = []
      seenRef.current.clear()
    }
    prevGenRef.current = generation
  }, [generation])

  useEffect(() => {
    if (bus.length === 0) {
      packetsRef.current = []
      seenRef.current.clear()
    }
  }, [bus.length])

  // GSAP animate node positions when layout or mode changes
  useEffect(() => {
    let targetPositions = new Map<string, { x: number; y: number }>()

    if (mode === "tactical") {
      targetPositions = computeTacticalMeshPositions(layout.nodes)
    } else if (mode === "hex") {
      targetPositions = computeHexConstellationPositions(layout.nodes)
    } else if (mode === "focus") {
      targetPositions = computeIncidentFocusPositions(layout, focusIncidentId)
    }

    // Tween each node coordinate to target
    layout.nodes.forEach((node) => {
      const target = targetPositions.get(node.id) || { x: node.x, y: node.y }
      let current = animCoordsRef.current.get(node.id)
      if (!current) {
        current = { x: target.x, y: target.y }
        animCoordsRef.current.set(node.id, current)
      }
      gsap.to(current, {
        x: target.x,
        y: target.y,
        duration: 0.85,
        ease: "power2.out",
        overwrite: "auto",
      })
    })
  }, [layout, mode, focusIncidentId])

  // Packet animation queue
  useEffect(() => {
    const now = performance.now()
    const fresh: Packet[] = []
    for (const message of bus) {
      if (seenRef.current.has(message.id)) continue
      seenRef.current.add(message.id)
      if (Date.now() - Date.parse(message.at) > PACKET_MS) continue
      if (message.toAgentId) {
        fresh.push({
          id: message.id,
          from: message.fromAgentId,
          to: message.toAgentId,
          kind: message.kind,
          startedAt: now,
        })
      } else {
        const peers = layoutRef.current.nodes.filter(
          (node) =>
            node.id !== message.fromAgentId &&
            !node.reserve &&
            (message.incidentId === null || node.incidentIds.includes(message.incidentId)),
        )
        for (const peer of peers) {
          fresh.push({
            id: `${message.id}:${peer.id}`,
            from: message.fromAgentId,
            to: peer.id,
            kind: "broadcast",
            startedAt: now,
          })
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
          const coord = animCoordsRef.current.get(node.id) || node
          const dx = screenX - (originX + coord.x * scale)
          const dy = screenY - (originY + coord.y * scale)
          const distance = Math.hypot(dx, dy)
          const hit = Math.max(14, node.radius * scale + 10)
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
      const pad = 24
      scale = Math.min((width - pad * 2) / VIRTUAL.width, (height - pad * 2) / VIRTUAL.height)
      originX = (width - VIRTUAL.width * scale) / 2
      originY = (height - VIRTUAL.height * scale) / 2
      palette = readPalette()
    }

    const project = (coord: { x: number; y: number }) => ({
      x: originX + coord.x * scale,
      y: originY + coord.y * scale,
    })

    const draw = () => {
      const current = layoutRef.current
      const now = performance.now()
      packetsRef.current = packetsRef.current.filter((packet) => now - packet.startedAt < PACKET_MS)

      context.clearRect(0, 0, width, height)
      context.fillStyle = palette.canvas
      context.fillRect(0, 0, width, height)

      const centerScreen = {
        x: originX + (VIRTUAL.width / 2) * scale,
        y: originY + (VIRTUAL.height / 2) * scale,
      }

      // 1. Grid backdrop
      context.strokeStyle = palette.grid
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



      // 3. Mode-specific structures (Hex Constellation rings/spokes, Incident blast halos & divider)
      if (modeRef.current === "hex") {
        context.save()
        context.strokeStyle = withAlpha(palette.foreground, 0.05)
        context.lineWidth = 0.8
        context.setLineDash([3, 5])
        // 3 subtle concentric constellation guide rings
        for (const r of [105, 200, 290]) {
          context.beginPath()
          context.arc(centerScreen.x, centerScreen.y, r * scale, 0, Math.PI * 2)
          context.stroke()
        }
        // 6 subtle spoke rays from hub to outer ring
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3
          const rInner = 105 * scale
          const rOuter = 290 * scale
          context.beginPath()
          context.moveTo(centerScreen.x + Math.cos(angle) * rInner, centerScreen.y + Math.sin(angle) * rInner)
          context.lineTo(centerScreen.x + Math.cos(angle) * rOuter, centerScreen.y + Math.sin(angle) * rOuter)
          context.stroke()
        }
        context.restore()
      } else if (modeRef.current === "focus") {
        if (current.clusters.length >= 1) {
          // Subtle vertical divider between left standby roster and right active incident(s)
          const divTop = project({ x: 280, y: 60 })
          const divBottom = project({ x: 280, y: 580 })
          context.save()
          context.strokeStyle = withAlpha(palette.foreground, 0.06)
          context.setLineDash([4, 6])
          context.lineWidth = 1
          context.beginPath()
          context.moveTo(divTop.x, divTop.y)
          context.lineTo(divBottom.x, divBottom.y)
          context.stroke()
          context.restore()

          // Header for the standby roster column
          const hdr = project({ x: 150, y: 55 })
          context.fillStyle = withAlpha(palette.muted, 0.5)
          context.font = "500 10px 'Roboto Mono', ui-monospace, monospace"
          context.textAlign = "center"
          context.fillText("STANDBY ROSTER", hdr.x, hdr.y)
        }

        // Incident cluster halos
        for (const cluster of current.clusters) {
          const centre = project(cluster)
          const radius = cluster.radius * scale
          const tint = palette.severity[cluster.severity] ?? palette.accent
          const dim = focusRef.current !== null && focusRef.current !== cluster.incidentId
          context.strokeStyle = withAlpha(tint, dim ? 0.08 : 0.24)
          context.setLineDash([4, 6])
          context.lineWidth = 1
          context.beginPath()
          context.arc(centre.x, centre.y, radius, 0, Math.PI * 2)
          context.stroke()
          context.setLineDash([])

          // Incident header label
          context.fillStyle = withAlpha(tint, dim ? 0.4 : 0.95)
          context.font = "400 11px 'Roboto Mono', ui-monospace, monospace"
          context.textAlign = "center"
          context.fillText(cluster.code, centre.x, centre.y - radius - 16)
          context.fillStyle = withAlpha(palette.muted, dim ? 0.3 : 0.8)
          context.font = "400 10px 'Roboto Mono', ui-monospace, monospace"
          context.fillText(
            cluster.status === "resolved" ? "Contained · resolved" : `${cluster.severity} · ${cluster.status}`,
            centre.x,
            centre.y - radius - 3,
          )
        }
      }

      // 4. Static / Dynamic edges
      for (const edge of current.edges) {
        const fromNode = current.nodeById.get(edge.from)
        const toNode = current.nodeById.get(edge.to)
        if (!fromNode || !toNode) continue

        const fromCoord = animCoordsRef.current.get(edge.from) || fromNode
        const toCoord = animCoordsRef.current.get(edge.to) || toNode
        const dim = focusRef.current !== null && edge.incidentId !== null && edge.incidentId !== focusRef.current
        const highlighted =
          selectedRef.current !== null && (edge.from === selectedRef.current || edge.to === selectedRef.current)

        const control = edgePath(fromCoord, toCoord)
        const a = project(fromCoord)
        const b = project(toCoord)
        const c = project({ x: control.cx, y: control.cy })

        context.strokeStyle =
          edge.kind === "campaign"
            ? withAlpha(palette.warning, highlighted ? 0.8 : dim ? 0.1 : 0.38)
            : withAlpha(palette.foreground, highlighted ? 0.5 : dim ? 0.04 : 0.12)
        context.lineWidth = edge.kind === "campaign" ? 1.5 : 1
        if (edge.kind === "campaign") context.setLineDash([6, 5])
        context.beginPath()
        context.moveTo(a.x, a.y)
        context.quadraticCurveTo(c.x, c.y, b.x, b.y)
        context.stroke()
        context.setLineDash([])
      }

      // 5. Enhanced A2A Packet Transport (Glowing photon heads + bezier particle tails)
      for (const packet of packetsRef.current) {
        const fromNode = current.nodeById.get(packet.from)
        const toNode = current.nodeById.get(packet.to)
        if (!fromNode || !toNode) continue

        const fromCoord = animCoordsRef.current.get(packet.from) || fromNode
        const toCoord = animCoordsRef.current.get(packet.to) || toNode

        const progress = (now - packet.startedAt) / PACKET_MS
        const control = edgePath(fromCoord, toCoord)
        const colour = palette.bus[packet.kind] ?? palette.accent
        const fade = progress > 0.85 ? 1 - (progress - 0.85) / 0.15 : 1

        // Multi-segment quadratic tail
        context.save()
        context.strokeStyle = withAlpha(colour, 0.4 * fade)
        context.lineWidth = 1
        context.beginPath()
        const tailStart = Math.max(0, progress - PACKET_TAIL)
        for (let step = 0; step <= 12; step += 1) {
          const t = tailStart + ((progress - tailStart) * step) / 12
          const pt = quadPoint(fromCoord, control, toCoord, Math.min(1, t))
          const screen = project(pt)
          if (step === 0) context.moveTo(screen.x, screen.y)
          else context.lineTo(screen.x, screen.y)
        }
        context.stroke()

        // The packet head: one dot in the message's own hue
        const head = quadPoint(fromCoord, control, toCoord, Math.min(1, progress))
        const screenHead = project(head)
        context.fillStyle = withAlpha(colour, 0.9 * fade)
        context.beginPath()
        context.arc(screenHead.x, screenHead.y, 2.4, 0, Math.PI * 2)
        context.fill()
        context.restore()
      }

      // 6. Agent nodes: the page, outlined in the class hue
      for (const node of current.nodes) {
        const coord = animCoordsRef.current.get(node.id) || node
        const point = project(coord)
        const dim =
          (focusRef.current !== null && !node.incidentIds.includes(focusRef.current) && !node.reserve) ||
          (node.reserve && modeRef.current === "focus")
        const colour = palette.classes[node.agentClass] ?? palette.accent
        const radius = Math.max(3.5, node.radius * scale)
        const isSelected = selectedRef.current === node.id
        const isHovered = hoverRef.current?.id === node.id

        // A working or consulting agent carries one static ring
        const ring = stateRing(node.state, palette)
        if (ring && !node.reserve) {
          context.save()
          context.strokeStyle = withAlpha(ring, dim ? 0.12 : 0.45)
          context.lineWidth = 1
          context.beginPath()
          context.arc(point.x, point.y, radius + 5, 0, Math.PI * 2)
          context.stroke()
          context.restore()
        }

        // Shared agent cross-front indicator
        if (node.shared) {
          context.strokeStyle = withAlpha(palette.warning, 0.65)
          context.setLineDash([2, 3])
          context.lineWidth = 1.2
          context.beginPath()
          context.arc(point.x, point.y, radius + 4, 0, Math.PI * 2)
          context.stroke()
          context.setLineDash([])
        }



        context.save()

        // The node is the page with a hairline in its class hue; the selected
        // one takes an ink outline instead.
        context.fillStyle = palette.canvas
        context.beginPath()
        context.arc(point.x, point.y, radius, 0, Math.PI * 2)
        context.fill()

        context.strokeStyle = withAlpha(
          isSelected || isHovered ? palette.foreground : colour,
          dim ? 0.25 : isSelected ? 0.95 : 0.8,
        )
        context.lineWidth = 1
        context.beginPath()
        context.arc(point.x, point.y, radius, 0, Math.PI * 2)
        context.stroke()

        // A commander carries one concentric dot in its own hue
        if (node.kind === "commander") {
          context.fillStyle = withAlpha(colour, dim ? 0.3 : 0.9)
          context.beginPath()
          context.arc(point.x, point.y, Math.max(1.5, radius * 0.4), 0, Math.PI * 2)
          context.fill()
        }
        context.restore()

        // Node label
        context.fillStyle = withAlpha(
          node.kind === "commander" ? palette.foreground : palette.muted,
          dim ? 0.3 : 0.9,
        )
        context.font = "400 10px 'Roboto Mono', ui-monospace, monospace"
        context.textAlign = "center"

        // Avoid overlapping labels:
        // 1. In hex mode: upper hemisphere labels above, lower hemisphere labels below
        // 2. In focus / incident layout:
        //    - Standby nodes on the left: ALWAYS draw label BELOW node for uniform vertical alignment
        //    - Peer commanders above cluster: draw label ABOVE node
        //    - Assigned specialists in upper half of their cluster: draw label ABOVE node
        const isStandby = node.reserve || coord.x < 280
        const cluster = current.clusters.find((c) => node.incidentIds.includes(c.incidentId))
        const isPeerAboveCluster =
          node.kind === "commander" &&
          cluster &&
          coord.y < cluster.y - 80 &&
          coord.y < 200
        const isAssignedUpperSector =
          node.kind !== "commander" &&
          cluster &&
          node.incidentIds.includes(cluster.incidentId) &&
          coord.y < cluster.y - 20

        let drawAbove = false
        if (modeRef.current === "hex") {
          drawAbove = coord.y < VIRTUAL.height / 2 - 15
        } else if (!isStandby) {
          drawAbove = Boolean(isPeerAboveCluster || isAssignedUpperSector)
        }

        const labelY = drawAbove
          ? point.y - radius - 5
          : point.y + radius + 13

        context.fillText(node.label, point.x, labelY)
      }

      // Reserve shelf label (only when not in focus mode, since focus mode has STANDBY ROSTER on the left)
      if (current.reserveLabel && modeRef.current !== "focus") {
        context.fillStyle = withAlpha(palette.muted, 0.55)
        context.font = "400 10px 'Roboto Mono', ui-monospace, monospace"
        context.textAlign = "center"
        context.fillText(current.reserveLabel, width / 2, height - 12)
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

  const hoverDef = hover ? agentDefs.get(hover.node.id) : undefined

  return (
    <div ref={shellRef} className={`phalanx-graph-shell group relative ${className ?? ""}`}>
      {/* Mode selector */}
      <div className="pointer-events-none absolute top-2.5 left-2.5 right-2.5 z-10 flex flex-wrap items-center gap-4">
        {([
          { id: "tactical", Icon: Grid, label: "Tactical mesh" },
          { id: "hex", Icon: Hexagon, label: "Hex constellation" },
          { id: "focus", Icon: Shield, label: "Incident focus" },
        ] as const).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setMode(item.id)}
            className={`meta-mono pointer-events-auto flex items-center gap-1.5 border-b pb-0.5 transition-colors ${
              mode === item.id ? "border-[color:var(--accent)] text-ink!" : "border-transparent hover:text-ink!"
            }`}
          >
            <item.Icon className="size-3" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <canvas ref={canvasRef} className="phalanx-graph-canvas" data-hover="false" />

      {/* Hover tooltip */}
      {hover ? (
        <div
          className="phalanx-tooltip pointer-events-none"
          style={{
            left: Math.min(hover.x + 16, (shellRef.current?.clientWidth ?? 0) - 280),
            top: Math.max(12, Math.min(hover.y - 16, (shellRef.current?.clientHeight ?? 0) - 200)),
          }}
        >
          <div className="meta-mono flex items-center gap-2 border-b border-rule-soft pb-2">
            <span
              className="inline-block size-1.5 rounded-full"
              style={{ background: `var(--phalanx-class-${hover.node.agentClass})` }}
            />
            <span className="text-ink">{hover.node.label}</span>
            <span>{hover.node.id}</span>
          </div>

          <div className="title mt-2 text-[0.875rem]">{hoverDef?.name || hover.node.name}</div>
          <div className="meta-mono">
            {hoverDef ? `${hoverDef.discipline} · ${hoverDef.class}` : hover.node.agentClass}
          </div>

          <div className="meta-mono mt-2 flex items-center gap-2">
            <span
              className="size-1.5 rounded-full"
              style={{
                background:
                  hover.node.state === "working"
                    ? "var(--accent)"
                    : hover.node.state === "blocked"
                      ? "var(--negative)"
                      : "var(--positive)",
              }}
            />
            <span>{hover.node.state}</span>
            <span className="ml-auto truncate text-ink!">{hover.node.activity}</span>
          </div>

          <div className="meta-mono mt-2 grid grid-cols-2 gap-2 border-t border-rule-soft pt-1.5">
            <div>
              <span>Incidents </span>
              <span className="text-ink!">
                {hover.node.incidentIds.length > 0 ? hover.node.incidentIds.join(", ") : "none"}
              </span>
            </div>
            <div>
              <span>Capacity </span>
              <span className="text-ink!">
                {hover.node.incidentIds.length}/{hoverDef?.capacity ?? 2}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function BusLegend({ className }: { className?: string }) {
  const items: { kind: A2AMessageKind; label: string }[] = [
    { kind: "task", label: "Task" },
    { kind: "report", label: "Report" },
    { kind: "query", label: "Peer query" },
    { kind: "escalation", label: "Escalation" },
    { kind: "broadcast", label: "Broadcast" },
  ]
  return (
    <div className={`meta-mono flex flex-wrap items-center gap-x-4 gap-y-1.5 ${className ?? ""}`}>
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
    { key: "command", label: "Command" },
    { key: "analysis", label: "Analysis" },
    { key: "action", label: "Action" },
    { key: "comms", label: "Comms" },
  ]
  return (
    <div className={`meta-mono flex flex-wrap items-center gap-x-4 gap-y-1.5 ${className ?? ""}`}>
      {items.map((item) => (
        <span key={item.key} className="flex items-center gap-1.5">
          <span
            className="inline-block size-1.5 rounded-full"
            style={{ background: `var(--phalanx-class-${item.key})` }}
          />
          {item.label}
        </span>
      ))}
    </div>
  )
}
