import { A2UI_VERSION, type ComponentSpec } from "./types.ts"
import { store } from "../store.ts"

/* Card composition.
   The agents think in cards, not components: they say "show the operator a
   containment decision with these three facts and two buttons", and this
   module lowers that into the A2UI component/data messages the client
   renders. Keeping the lowering here means an agent never has to hand-write
   component graphs, and the catalog stays the only contract. */

export type Tone = "neutral" | "info" | "positive" | "warning" | "critical"

export type CardBlock =
  | { type: "text"; text: string; tone?: Tone; variant?: "body" | "lead" | "mono" }
  | { type: "metrics"; metrics: { label: string; value: string; delta?: string; tone?: Tone }[] }
  | { type: "keyvalue"; rows: { label: string; value: string; tone?: Tone }[] }
  | { type: "list"; items: string[]; ordered?: boolean; tone?: Tone }
  | { type: "timeline"; entries: { at: string; actor: string; text: string; tone?: Tone }[] }
  | { type: "agents"; agents: { id: string; name: string; state: string }[] }
  | { type: "progress"; label: string; value: number; max?: number; tone?: Tone }
  | { type: "code"; text: string; language?: string }
  | { type: "badges"; badges: { text: string; tone?: Tone }[] }
  | { type: "actions"; actions: { label: string; actionId: string; tone?: Tone; payload?: Record<string, unknown> }[] }
  | { type: "divider" }

export interface CardSpec {
  surfaceId: string
  cardId: string
  title: string
  kicker?: string
  tone?: Tone
  /** Cards sort descending by weight, then by publish time. */
  weight?: number
  blocks: CardBlock[]
}

interface SurfaceCards {
  order: string[]
  weights: Map<string, number>
}

const surfaceCards = new Map<string, SurfaceCards>()

function cardsFor(surfaceId: string): SurfaceCards {
  let entry = surfaceCards.get(surfaceId)
  if (!entry) {
    entry = { order: [], weights: new Map() }
    surfaceCards.set(surfaceId, entry)
  }
  return entry
}

/**
 * Publish (or replace) one card on a surface. Re-publishing the same cardId
 * updates it in place, which is how a long-running card such as
 * "containment status" stays live rather than accumulating duplicates.
 */
export function publishCard(spec: CardSpec): void {
  store.ensureSurface(spec.surfaceId)

  const components: ComponentSpec[] = []
  const bodyIds: string[] = []

  spec.blocks.forEach((block, index) => {
    const blockId = `${spec.cardId}.b${index}`
    bodyIds.push(blockId)
    switch (block.type) {
      case "text":
        components.push({ id: blockId, component: "Text", text: block.text, tone: block.tone ?? "neutral", variant: block.variant ?? "body" })
        break
      case "metrics":
        components.push({ id: blockId, component: "MetricRow", metrics: block.metrics })
        break
      case "keyvalue":
        components.push({ id: blockId, component: "KeyValue", rows: block.rows })
        break
      case "list":
        components.push({ id: blockId, component: "List", items: block.items, ordered: block.ordered ?? false, tone: block.tone ?? "neutral" })
        break
      case "timeline":
        components.push({ id: blockId, component: "Timeline", entries: block.entries })
        break
      case "agents":
        components.push({ id: blockId, component: "AgentChips", agents: block.agents })
        break
      case "progress":
        components.push({ id: blockId, component: "Progress", label: block.label, value: block.value, max: block.max ?? 100, tone: block.tone ?? "info" })
        break
      case "code":
        components.push({ id: blockId, component: "CodeBlock", text: block.text, language: block.language ?? "text" })
        break
      case "badges":
        components.push({ id: blockId, component: "Row", gap: "sm", children: block.badges.map((badge, badgeIndex) => {
          const badgeId = `${blockId}.i${badgeIndex}`
          components.push({ id: badgeId, component: "Badge", text: badge.text, tone: badge.tone ?? "neutral" })
          return badgeId
        }) })
        break
      case "actions":
        components.push({ id: blockId, component: "ActionRow", children: block.actions.map((action, actionIndex) => {
          const actionId = `${blockId}.a${actionIndex}`
          components.push({
            id: actionId,
            component: "Action",
            label: action.label,
            actionId: action.actionId,
            tone: action.tone ?? "neutral",
            payload: action.payload ?? {},
          })
          return actionId
        }) })
        break
      case "divider":
        components.push({ id: blockId, component: "Divider" })
        break
    }
  })

  const bodyId = `${spec.cardId}.body`
  components.push({ id: bodyId, component: "Column", gap: "md", children: bodyIds })
  components.push({
    id: spec.cardId,
    component: "Card",
    title: spec.title,
    kicker: spec.kicker ?? null,
    tone: spec.tone ?? "neutral",
    child: bodyId,
    publishedAt: new Date().toISOString(),
  })

  const registry = cardsFor(spec.surfaceId)
  if (!registry.order.includes(spec.cardId)) registry.order.push(spec.cardId)
  registry.weights.set(spec.cardId, spec.weight ?? 0)
  const ordered = [...registry.order].sort((a, b) => (registry.weights.get(b) ?? 0) - (registry.weights.get(a) ?? 0))

  components.push({ id: "root", component: "Column", gap: "lg", children: ordered })

  store.applyA2UI({ version: A2UI_VERSION, updateComponents: { surfaceId: spec.surfaceId, components } })
}

export function retireCard(surfaceId: string, cardId: string): void {
  const registry = cardsFor(surfaceId)
  registry.order = registry.order.filter((each) => each !== cardId)
  registry.weights.delete(cardId)
  store.applyA2UI({
    version: A2UI_VERSION,
    updateComponents: {
      surfaceId,
      components: [{ id: "root", component: "Column", gap: "lg", children: [...registry.order] }],
    },
  })
}

export function clearSurface(surfaceId: string): void {
  surfaceCards.delete(surfaceId)
}

/** Forget every surface's card order and weights. Called by the world reset;
    without it a fresh surface would sort against ids that no longer exist. */
export function clearAllCards(): void {
  surfaceCards.clear()
}

/** Bind a live value into the surface data model, for cards that stream. */
export function setSurfaceData(surfaceId: string, path: string, value: unknown): void {
  store.applyA2UI({ version: A2UI_VERSION, updateDataModel: { surfaceId, path, value } })
}
