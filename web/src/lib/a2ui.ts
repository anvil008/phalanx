import type { A2UIMessage, ComponentSpec, Surface } from "./model.ts"

/* Client-side A2UI surface state.
   The client is a renderer, not a designer: it holds a component map and a
   data model, and every change arrives as a protocol message. Nothing here
   knows what an incident is. */

export interface RenderedSurface {
  id: string
  components: Record<string, ComponentSpec>
  data: Record<string, unknown>
  root: string | null
  updatedAt: string
}

export function emptySurface(id: string): RenderedSurface {
  return { id, components: {}, data: {}, root: null, updatedAt: new Date().toISOString() }
}

export function surfaceIdOf(message: A2UIMessage): string {
  if ("createSurface" in message) return message.createSurface.surfaceId
  if ("updateComponents" in message) return message.updateComponents.surfaceId
  if ("updateDataModel" in message) return message.updateDataModel.surfaceId
  return message.deleteSurface.surfaceId
}

export function applyA2UI(surface: RenderedSurface, message: A2UIMessage): RenderedSurface {
  if ("createSurface" in message) {
    return { ...surface, updatedAt: new Date().toISOString() }
  }
  if ("updateComponents" in message) {
    const components = { ...surface.components }
    let root = surface.root
    for (const component of message.updateComponents.components) {
      components[component.id] = component
      if (component.id === "root") root = "root"
    }
    return { ...surface, components, root, updatedAt: new Date().toISOString() }
  }
  if ("updateDataModel" in message) {
    const { path, value } = message.updateDataModel
    if (path === "/" || path === "") {
      return { ...surface, data: (value as Record<string, unknown>) ?? {}, updatedAt: new Date().toISOString() }
    }
    const data = structuredClone(surface.data)
    writePointer(data, path, value)
    return { ...surface, data, updatedAt: new Date().toISOString() }
  }
  return emptySurface(surface.id)
}

export function hydrate(serverSurface: Surface): RenderedSurface {
  let surface = emptySurface(serverSurface.id)
  for (const message of serverSurface.messages) surface = applyA2UI(surface, message)
  // Trust the server's reduced state when the message tail has been trimmed.
  if (Object.keys(surface.components).length === 0 && serverSurface.components) {
    surface = {
      ...surface,
      components: serverSurface.components,
      data: serverSurface.data ?? {},
      root: serverSurface.root,
    }
  }
  return surface
}

/** Resolve `{ path }` bindings against the surface data model. */
export function resolve(value: unknown, data: Record<string, unknown>): unknown {
  if (value && typeof value === "object" && !Array.isArray(value) && "path" in (value as Record<string, unknown>)) {
    const pointer = String((value as { path: unknown }).path)
    return readPointer(data, pointer)
  }
  return value
}

function segmentsOf(pointer: string): string[] {
  return pointer
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
}

function writePointer(target: Record<string, unknown>, pointer: string, value: unknown): void {
  const segments = segmentsOf(pointer)
  if (segments.length === 0) return
  for (const seg of segments) {
    if (seg === "__proto__" || seg === "constructor" || seg === "prototype") return
  }
  let node: Record<string, unknown> = target
  for (const segment of segments.slice(0, -1)) {
    const next = node[segment]
    if (typeof next !== "object" || next === null) node[segment] = {}
    node = node[segment] as Record<string, unknown>
  }
  node[segments[segments.length - 1]!] = value
}

function readPointer(source: Record<string, unknown>, pointer: string): unknown {
  let node: unknown = source
  for (const segment of segmentsOf(pointer)) {
    if (typeof node !== "object" || node === null) return undefined
    node = (node as Record<string, unknown>)[segment]
  }
  return node
}
