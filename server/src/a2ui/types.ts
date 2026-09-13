/* A2UI v0.9 — the agent describes an interface as declarative JSON against a
   published catalog, and the client renders it with native components. Esper
   uses it for exactly the thing it is good at: the commander decides what the
   operator needs to see next and emits the card, instead of the frontend
   guessing from a fixed schema. */

export const A2UI_VERSION = "v0.9"
export const CATALOG_ID = "/api/a2ui/catalog.json"

export interface CreateSurface {
  version: typeof A2UI_VERSION
  createSurface: {
    surfaceId: string
    catalogId: string
    theme?: Record<string, unknown>
    sendDataModel?: boolean
  }
}

export interface ComponentSpec {
  id: string
  component: string
  [prop: string]: unknown
}

export interface UpdateComponents {
  version: typeof A2UI_VERSION
  updateComponents: {
    surfaceId: string
    components: ComponentSpec[]
  }
}

export interface UpdateDataModel {
  version: typeof A2UI_VERSION
  updateDataModel: {
    surfaceId: string
    path: string
    value: unknown
  }
}

export interface DeleteSurface {
  version: typeof A2UI_VERSION
  deleteSurface: { surfaceId: string }
}

export type A2UIMessage =
  | CreateSurface
  | UpdateComponents
  | UpdateDataModel
  | DeleteSurface

/** A binding: `{ path }` resolves against the surface's data model. */
export interface DataBinding {
  path: string
}

export function bind(path: string): DataBinding {
  return { path }
}

/* The Phalanx catalog. Every component maps onto a Foundry primitive on the
   client, so an agent-authored card is indistinguishable from a hand-built
   page — which is the whole point of shipping UI as data. */
export const PHALANX_CATALOG = {
  catalogId: CATALOG_ID,
  version: A2UI_VERSION,
  name: "Phalanx Operations Catalog",
  components: {
    Column: { children: "component[]", gap: "string?" },
    Row: { children: "component[]", gap: "string?", align: "string?" },
    Card: { child: "component", tone: "string?", title: "string?", kicker: "string?" },
    Heading: { text: "string", level: "number?" },
    Text: { text: "string", variant: "string?", tone: "string?" },
    Badge: { text: "string", tone: "string?" },
    Divider: {},
    Metric: { label: "string", value: "string", delta: "string?", tone: "string?" },
    MetricRow: { metrics: "Metric[]" },
    KeyValue: { rows: "{label,value,tone?}[]" },
    List: { items: "string[]", ordered: "boolean?", tone: "string?" },
    Timeline: { entries: "{at,actor,text,tone?}[]" },
    Progress: { label: "string", value: "number", max: "number?", tone: "string?" },
    AgentChips: { agents: "{id,name,state}[]" },
    CodeBlock: { text: "string", language: "string?" },
    Action: { label: "string", actionId: "string", tone: "string?", payload: "object?" },
    ActionRow: { children: "component[]" },
  },
} as const

export const ESPER_CATALOG = PHALANX_CATALOG

