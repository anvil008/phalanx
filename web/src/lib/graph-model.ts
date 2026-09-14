import type { AgentClass, AgentDef, AgentRuntime, AgentState, Incident, IncidentSeverity } from "./model.ts"

/* Swarm graph layout.
   Two layouts, one renderer. The incident layout answers "who is working this,
   and who is talking to whom"; the campaign layout answers "what is the whole
   team doing right now, across every incident at once" — which is the view a
   per-incident page structurally cannot give you.

   Layout is pure and in virtual units. The canvas fits it. */

export const VIRTUAL = { width: 1240, height: 620 } as const

export type GraphNodeKind = "commander" | "specialist"

export interface GraphNode {
  id: string
  label: string
  name: string
  kind: GraphNodeKind
  agentClass: AgentClass
  state: AgentState
  activity: string
  x: number
  y: number
  radius: number
  incidentIds: string[]
  /** Enrolled in more than one incident — drawn between its clusters. */
  shared: boolean
  /** Not enrolled anywhere: on the bench. */
  reserve: boolean
}

export interface GraphEdge {
  id: string
  from: string
  to: string
  incidentId: string | null
  kind: "command" | "campaign"
}

export interface GraphCluster {
  incidentId: string
  code: string
  title: string
  severity: IncidentSeverity
  status: Incident["status"]
  commanderId: string
  x: number
  y: number
  radius: number
}

export interface GraphLayout {
  nodes: GraphNode[]
  nodeById: Map<string, GraphNode>
  edges: GraphEdge[]
  clusters: GraphCluster[]
  reserveLabel: string | null
}

export interface LayoutInput {
  agents: AgentDef[]
  runtime: Map<string, AgentRuntime>
  incidents: Incident[]
}

const CLASS_ORDER: AgentClass[] = ["analysis", "action", "comms", "command"]

/** Beyond this the wedges are too narrow to read; the tiles carry the rest. */
const MAX_CLUSTERS = 4

function radiusFor(kind: GraphNodeKind, shared: boolean, reserve: boolean): number {
  // On the bench everyone is the same size — rank is not information there.
  if (reserve) return 5.5
  if (kind === "commander") return 13
  return shared ? 8.5 : 7
}

function sortAgents(agents: AgentDef[]): AgentDef[] {
  return [...agents].sort((left, right) => {
    const byClass = CLASS_ORDER.indexOf(left.class) - CLASS_ORDER.indexOf(right.class)
    return byClass !== 0 ? byClass : left.callsign.localeCompare(right.callsign)
  })
}

function makeNode(
  agent: AgentDef,
  runtime: Map<string, AgentRuntime>,
  x: number,
  y: number,
  options: { shared?: boolean; reserve?: boolean; incidentIds?: string[] } = {},
): GraphNode {
  const live = runtime.get(agent.id)
  return {
    id: agent.id,
    label: agent.callsign,
    name: agent.name,
    kind: agent.class === "command" ? "commander" : "specialist",
    agentClass: agent.class,
    state: live?.state ?? "standby",
    activity: live?.activity ?? "Standing by",
    x,
    y,
    radius: radiusFor(agent.class === "command" ? "commander" : "specialist", options.shared ?? false, options.reserve ?? false),
    incidentIds: options.incidentIds ?? live?.incidentIds ?? [],
    shared: options.shared ?? false,
    reserve: options.reserve ?? false,
  }
}

/** Cluster centres for n incidents, laid out so edges stay inside their wedge. */
function clusterCentres(count: number): { x: number; y: number }[] {
  const cx = VIRTUAL.width / 2
  const cy = VIRTUAL.height / 2 - 10
  if (count <= 1) return [{ x: 780, y: 310 }]
  if (count === 2) {
    return [
      { x: 510, y: 310 },
      { x: 980, y: 310 },
    ]
  }
  if (count === 3) {
    return [
      { x: cx - 396, y: cy - 78 },
      { x: cx + 396, y: cy - 78 },
      { x: cx, y: cy + 150 },
    ]
  }
  const ring = 412
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2
    return { x: cx + Math.cos(angle) * ring, y: cy + Math.sin(angle) * ring * 0.62 }
  })
}

function nudgeClear(
  point: { x: number; y: number },
  clusters: GraphCluster[],
  clearance: number,
): { x: number; y: number } {
  let { x, y } = point
  for (const cluster of clusters) {
    const dx = x - cluster.x
    const dy = y - cluster.y
    const distance = Math.hypot(dx, dy)
    const minimum = cluster.radius + clearance
    if (distance >= minimum) continue
    // Straight through the centre: pick a deterministic direction rather than
    // dividing by zero.
    const angle = distance < 1 ? Math.PI / 2 : Math.atan2(dy, dx)
    x = cluster.x + Math.cos(angle) * minimum
    y = cluster.y + Math.sin(angle) * minimum
  }
  return { x, y }
}

function layoutReserveLeft(agents: AgentDef[], runtime: Map<string, AgentRuntime>): GraphNode[] {
  if (agents.length === 0) return []
  const sorted = sortAgents(agents)
  return sorted.map((agent, index) => {
    const col = index % 2
    const row = Math.floor(index / 2)
    const x = col === 0 ? 95 : 205
    const y = 95 + row * 65
    return makeNode(agent, runtime, x, y, {
      reserve: true,
      incidentIds: [],
    })
  })
}


/** One incident: its commander at the centre of its own team. */
export function buildIncidentLayout(input: LayoutInput & { incidentId: string }): GraphLayout {
  const incident = input.incidents.find((each) => each.id === input.incidentId)
  const byId = new Map(input.agents.map((agent) => [agent.id, agent]))
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const clusters: GraphCluster[] = []

  if (!incident) {
    return { nodes: [], nodeById: new Map(), edges: [], clusters: [], reserveLabel: null }
  }

  const cx = 780
  const cy = 310

  const commander = byId.get(incident.commanderId)
  if (commander) nodes.push(makeNode(commander, input.runtime, cx, cy, { incidentIds: [incident.id] }))

  const enrolledIds = new Set(incident.assignments.map((each) => each.agentId))
  for (const [, live] of input.runtime) {
    if (live.incidentIds.includes(incident.id)) enrolledIds.add(live.id)
  }
  enrolledIds.delete(incident.commanderId)

  const enrolled = sortAgents([...enrolledIds].map((id) => byId.get(id)).filter((each): each is AgentDef => Boolean(each)))
  const ring = 145
  enrolled.forEach((agent, index) => {
    const angle = (index / Math.max(1, enrolled.length)) * Math.PI * 2 - Math.PI / 2
    const stagger = index % 2 === 0 ? -16 : 20
    nodes.push(
      makeNode(agent, input.runtime, cx + Math.cos(angle) * (ring + stagger), cy + Math.sin(angle) * (ring + stagger) * 0.85, {
        incidentIds: [incident.id],
      }),
    )
    edges.push({ id: `cmd:${incident.commanderId}:${agent.id}`, from: incident.commanderId, to: agent.id, incidentId: incident.id, kind: "command" })
  })

  // Peer commanders that share this incident's campaign sit outside the ring.
  const linkedIncidentIds = incident.links.map((link) => link.incidentId)
  const peers = input.incidents.filter((each) => linkedIncidentIds.includes(each.id))
  peers.forEach((peer, index) => {
    const peerAgent = byId.get(peer.commanderId)
    if (!peerAgent || nodes.some((node) => node.id === peerAgent.id)) return
    // Spread peer commanders horizontally (260px spread) so they never crowd the cluster title at cx
    const x = cx + (index - (peers.length - 1) / 2) * 260
    const y = Math.max(50, cy - 210 - 45)
    nodes.push(
      makeNode(peerAgent, input.runtime, x, y, { incidentIds: [peer.id] }),
    )
    edges.push({ id: `camp:${incident.commanderId}:${peerAgent.id}`, from: incident.commanderId, to: peerAgent.id, incidentId: null, kind: "campaign" })
  })

  clusters.push({
    incidentId: incident.id,
    code: incident.code,
    title: incident.title,
    severity: incident.severity,
    status: incident.status,
    commanderId: incident.commanderId,
    x: cx,
    y: cy,
    radius: 210,
  })

  const placed = new Set(nodes.map((node) => node.id))
  const reserve = layoutReserveLeft(input.agents.filter((agent) => !placed.has(agent.id)), input.runtime)
  nodes.push(...reserve)

  return {
    nodes,
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    edges,
    clusters,
    reserveLabel: reserve.length > 0 ? "Not engaged on this incident" : null,
  }
}

/** Every incident at once, with agents that span more than one drawn between. */
export function buildCampaignLayout(input: LayoutInput): GraphLayout {
  const byId = new Map(input.agents.map((agent) => [agent.id, agent]))
  const incidents = input.incidents.filter((incident) => incident.status !== "resolved").slice(0, MAX_CLUSTERS)

  if (incidents.length === 0) {
    // Nothing running: show the whole roster as a bench, grouped by class.
    const nodes = layoutBench(input.agents, input.runtime)
    return { nodes, nodeById: new Map(nodes.map((node) => [node.id, node])), edges: [], clusters: [], reserveLabel: "Standing by" }
  }

  const centres = clusterCentres(incidents.length)
  const clusters: GraphCluster[] = incidents.map((incident, index) => ({
    incidentId: incident.id,
    code: incident.code,
    title: incident.title,
    severity: incident.severity,
    status: incident.status,
    commanderId: incident.commanderId,
    x: centres[index]!.x,
    y: centres[index]!.y,
    radius: incidents.length <= 1 ? 210 : incidents.length === 2 ? 196 : 158,
  }))
  const clusterById = new Map(clusters.map((cluster) => [cluster.incidentId, cluster]))

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  // Commanders sit at the centre of their own incident.
  for (const cluster of clusters) {
    const commander = byId.get(cluster.commanderId)
    if (!commander || nodes.some((node) => node.id === commander.id)) continue
    nodes.push(makeNode(commander, input.runtime, cluster.x, cluster.y, { incidentIds: [cluster.incidentId] }))
  }

  // Membership, from live runtime rather than the assignment list, so an agent
  // that a peer pulled in directly still shows up.
  const membership = new Map<string, string[]>()
  for (const agent of input.agents) {
    const live = input.runtime.get(agent.id)
    const ids = (live?.incidentIds ?? []).filter((id) => clusterById.has(id))
    if (ids.length > 0) membership.set(agent.id, ids)
  }
  for (const incident of incidents) {
    for (const assignment of incident.assignments) {
      const current = membership.get(assignment.agentId) ?? []
      if (!current.includes(incident.id)) membership.set(assignment.agentId, [...current, incident.id])
    }
  }

  const perCluster = new Map<string, AgentDef[]>()
  const sharedAgents: { agent: AgentDef; incidentIds: string[] }[] = []

  for (const [agentId, incidentIds] of membership) {
    const agent = byId.get(agentId)
    if (!agent || agent.class === "command") continue
    if (incidentIds.length > 1) {
      sharedAgents.push({ agent, incidentIds })
      continue
    }
    const clusterId = incidentIds[0]!
    perCluster.set(clusterId, [...(perCluster.get(clusterId) ?? []), agent])
  }

  for (const cluster of clusters) {
    const members = sortAgents(perCluster.get(cluster.incidentId) ?? [])
    members.forEach((agent, index) => {
      const angle = (index / Math.max(1, members.length)) * Math.PI * 2 - Math.PI / 2
      const baseR = incidents.length <= 1 ? 145 : cluster.radius * 0.72
      const stagger = incidents.length <= 1 ? (index % 2 === 0 ? -16 : 20) : (index % 2 === 0 ? 0 : 34)
      const r = baseR + stagger
      const yRatio = incidents.length <= 1 ? 0.85 : 0.62
      nodes.push(
        makeNode(agent, input.runtime, cluster.x + Math.cos(angle) * r, cluster.y + Math.sin(angle) * (r * yRatio), {
          incidentIds: [cluster.incidentId],
        }),
      )
      edges.push({ id: `cmd:${cluster.commanderId}:${agent.id}`, from: cluster.commanderId, to: agent.id, incidentId: cluster.incidentId, kind: "command" })
    })
  }

  // Agents on more than one incident sit between the clusters they serve.
  sortAgents(sharedAgents.map((each) => each.agent)).forEach((agent, index) => {
    const entry = sharedAgents.find((each) => each.agent.id === agent.id)!
    const centre = entry.incidentIds
      .map((id) => clusterById.get(id)!)
      .reduce((acc, cluster) => ({ x: acc.x + cluster.x / entry.incidentIds.length, y: acc.y + cluster.y / entry.incidentIds.length }), { x: 0, y: 0 })
    const offset = (index - (sharedAgents.length - 1) / 2) * 58
    const placed = nudgeClear({ x: centre.x, y: centre.y + offset }, clusters, 24)
    nodes.push(makeNode(agent, input.runtime, placed.x, placed.y, { shared: true, incidentIds: entry.incidentIds }))
    for (const incidentId of entry.incidentIds) {
      const cluster = clusterById.get(incidentId)!
      edges.push({ id: `cmd:${cluster.commanderId}:${agent.id}:${incidentId}`, from: cluster.commanderId, to: agent.id, incidentId, kind: "command" })
    }
  })

  // Commander-to-commander links, from declared incident links.
  for (const incident of incidents) {
    for (const link of incident.links) {
      const peer = clusterById.get(link.incidentId)
      if (!peer) continue
      const key = [incident.commanderId, peer.commanderId].sort().join(":")
      if (edges.some((edge) => edge.id === `camp:${key}`)) continue
      edges.push({ id: `camp:${key}`, from: incident.commanderId, to: peer.commanderId, incidentId: null, kind: "campaign" })
    }
  }

  // A commander with no incident of its own still belongs on the map once it
  // has been pulled into someone else's — the strategic commander taking the
  // campaign view, or a peer answering an escalation. Fan them out above the
  // clusters so two of them never land on the same point.
  const extraCommanders = input.agents.filter(
    (agent) =>
      agent.class === "command" &&
      !nodes.some((node) => node.id === agent.id) &&
      (input.runtime.get(agent.id)?.incidentIds ?? []).some((id) => clusterById.has(id)),
  )
  extraCommanders.forEach((agent, index) => {
    const engaged = (input.runtime.get(agent.id)?.incidentIds ?? []).filter((id) => clusterById.has(id))
    const centre = engaged
      .map((id) => clusterById.get(id)!)
      .reduce((acc, cluster) => ({ x: acc.x + cluster.x / engaged.length, y: acc.y + cluster.y / engaged.length }), { x: 0, y: 0 })
    const spread = (index - (extraCommanders.length - 1) / 2) * 200
    const placed = nudgeClear({ x: centre.x + spread, y: centre.y - 206 }, clusters, 30)
    nodes.push(
      makeNode(agent, input.runtime, placed.x, placed.y, {
        shared: engaged.length > 1,
        incidentIds: engaged,
      }),
    )
    for (const incidentId of engaged) {
      const cluster = clusterById.get(incidentId)!
      edges.push({ id: `camp:${agent.id}:${cluster.commanderId}`, from: agent.id, to: cluster.commanderId, incidentId: null, kind: "campaign" })
    }
  })

  const placed = new Set(nodes.map((node) => node.id))
  const reserve = layoutReserveLeft(input.agents.filter((agent) => !placed.has(agent.id)), input.runtime)
  nodes.push(...reserve)

  return {
    nodes,
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    edges,
    clusters,
    reserveLabel: reserve.length > 0 ? "Available" : null,
  }
}

function layoutBench(agents: AgentDef[], runtime: Map<string, AgentRuntime>): GraphNode[] {
  const grouped = CLASS_ORDER.map((agentClass) => ({
    agentClass,
    members: sortAgents(agents.filter((agent) => agent.class === agentClass)),
  })).filter((group) => group.members.length > 0)

  const nodes: GraphNode[] = []
  const rowHeight = VIRTUAL.height / (grouped.length + 1)
  grouped.forEach((group, rowIndex) => {
    const y = rowHeight * (rowIndex + 1)
    const span = Math.min(VIRTUAL.width - 260, group.members.length * 118)
    const start = (VIRTUAL.width - span) / 2
    group.members.forEach((agent, index) => {
      const x = group.members.length === 1 ? VIRTUAL.width / 2 : start + (span * index) / (group.members.length - 1)
      nodes.push(makeNode(agent, runtime, x, y, { reserve: true, incidentIds: [] }))
    })
  })
  return nodes
}
