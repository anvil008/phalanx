import { randomUUID } from "node:crypto"
import {
  A2A_ERROR,
  isTerminal,
  messageText,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type Message,
  type Task,
  type TaskState,
} from "./types.ts"
import type { A2AMessageKind } from "../model.ts"
import { store, now, WorldResetError } from "../store.ts"

export interface HandlerContext {
  agentId: string
  fromAgentId: string | null
  incidentId: string | null
  task: Task
  message: Message
  text: string
  data: Record<string, unknown>
}

export interface HandlerResult {
  text: string
  data?: Record<string, unknown>
  state?: TaskState
}

export type A2AHandler = (context: HandlerContext) => Promise<HandlerResult>

const handlers = new Map<string, A2AHandler>()
const tasks = new Map<string, Task>()
/** Task id → the agent serving it, so tasks/get can be routed. */
const taskOwner = new Map<string, string>()

export function registerHandler(agentId: string, handler: A2AHandler): void {
  handlers.set(agentId, handler)
}

export function hasHandler(agentId: string): boolean {
  return handlers.has(agentId)
}

export function getTask(taskId: string): Task | undefined {
  return tasks.get(taskId)
}

export function tasksForIncident(incidentId: string): Task[] {
  return [...tasks.values()].filter((task) => task.metadata?.incidentId === incidentId)
}

/** Drop every task and its history. Called by the world reset. */
export function clearTasks(): void {
  tasks.clear()
  taskOwner.clear()
}

function ok(id: string | number, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result }
}

function fail(id: string | number, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } }
}

function collectData(message: Message): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  for (const part of message.parts) if ("data" in part) Object.assign(merged, part.data)
  return merged
}

/**
 * Serve one JSON-RPC request against one agent. Every inter-agent call in
 * Phalanx lands here — the internal client and the HTTP endpoint share this
 * path, so the protocol trace is complete by construction.
 */
export async function dispatch(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  if (request.jsonrpc !== "2.0") return fail(request.id ?? 0, A2A_ERROR.invalidRequest, "jsonrpc must be \"2.0\"")

  const handler = handlers.get(agentId)
  if (!handler) return fail(request.id, A2A_ERROR.agentNotFound, `no agent serving id ${agentId}`)

  switch (request.method) {
    case "message/send":
      return sendMessageMethod(agentId, handler, request)
    case "tasks/get": {
      const taskId = String(request.params?.id ?? "")
      const task = tasks.get(taskId)
      if (!task) return fail(request.id, A2A_ERROR.taskNotFound, `unknown task ${taskId}`)
      return ok(request.id, task)
    }
    case "tasks/cancel": {
      const taskId = String(request.params?.id ?? "")
      const task = tasks.get(taskId)
      if (!task) return fail(request.id, A2A_ERROR.taskNotFound, `unknown task ${taskId}`)
      if (!isTerminal(task.status.state)) {
        task.status = { state: "TASK_STATE_CANCELED", timestamp: now() }
      }
      return ok(request.id, task)
    }
    case "agent/getAuthenticatedExtendedCard":
      return ok(request.id, store.agentCard(agentId, ""))
    default:
      return fail(request.id, A2A_ERROR.methodNotFound, `unsupported method ${request.method}`)
  }
}

async function sendMessageMethod(
  agentId: string,
  handler: A2AHandler,
  request: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const message = request.params?.message as Message | undefined
  if (!message || !Array.isArray(message.parts)) {
    return fail(request.id, A2A_ERROR.invalidParams, "params.message with parts[] is required")
  }

  const contextId = message.contextId ?? `ctx_${randomUUID().slice(0, 8)}`
  const taskId = message.taskId ?? `task_${randomUUID().slice(0, 8)}`
  const meta = (message.metadata ?? {}) as Record<string, unknown>
  const fromAgentId = typeof meta.fromAgentId === "string" ? meta.fromAgentId : null
  const incidentId = typeof meta.incidentId === "string" ? meta.incidentId : null

  const task: Task =
    tasks.get(taskId) ??
    ({
      id: taskId,
      contextId,
      status: { state: "TASK_STATE_SUBMITTED", timestamp: now() },
      artifacts: [],
      history: [],
      metadata: { incidentId, servedBy: agentId, requestedBy: fromAgentId },
    } satisfies Task)
  tasks.set(taskId, task)
  taskOwner.set(taskId, agentId)
  task.history.push(message)
  task.status = { state: "TASK_STATE_WORKING", timestamp: now() }

  try {
    const result = await handler({
      agentId,
      fromAgentId,
      incidentId,
      task,
      message,
      text: messageText(message),
      data: collectData(message),
    })

    const reply: Message = {
      messageId: `msg_${randomUUID().slice(0, 8)}`,
      contextId,
      taskId,
      role: "ROLE_AGENT",
      parts: result.data ? [{ text: result.text }, { data: result.data }] : [{ text: result.text }],
      metadata: { fromAgentId: agentId, incidentId },
    }
    task.history.push(reply)
    task.status = { state: result.state ?? "TASK_STATE_COMPLETED", message: reply, timestamp: now() }
    task.artifacts.push({
      artifactId: `art_${randomUUID().slice(0, 8)}`,
      name: `${agentId}-response`,
      parts: reply.parts,
    })
    store.creditAgent(agentId, { tasks: 1 })
    return ok(request.id, task)
  } catch (error) {
    if (error instanceof WorldResetError) throw error
    const detail = error instanceof Error ? error.message : String(error)
    task.status = {
      state: "TASK_STATE_FAILED",
      timestamp: now(),
      message: {
        messageId: `msg_${randomUUID().slice(0, 8)}`,
        contextId,
        taskId,
        role: "ROLE_AGENT",
        parts: [{ text: detail }],
      },
    }
    store.log(`${agentId} failed task ${taskId}: ${detail}`, "error")
    return ok(request.id, task)
  }
}

export interface SendOptions {
  from: string
  to: string
  text: string
  data?: Record<string, unknown>
  kind: A2AMessageKind
  incidentId?: string | null
  contextId?: string
  taskId?: string
  /** One-line description used for the graph edge and the trace list. */
  summary: string
}

export interface SendOutcome {
  task: Task
  text: string
  data: Record<string, unknown>
  state: TaskState
}

/**
 * Agent-to-agent call. Records the outbound hop and the reply hop on the
 * coordination bus so the graph can animate the exchange, then returns the
 * peer's answer to the caller.
 */
export async function a2aSend(options: SendOptions): Promise<SendOutcome> {
  const contextId = options.contextId ?? (options.incidentId ? `ctx_${options.incidentId}` : `ctx_${randomUUID().slice(0, 8)}`)
  const taskId = options.taskId ?? `task_${randomUUID().slice(0, 8)}`
  const message: Message = {
    messageId: `msg_${randomUUID().slice(0, 8)}`,
    contextId,
    taskId,
    role: "ROLE_USER",
    parts: options.data ? [{ text: options.text }, { data: options.data }] : [{ text: options.text }],
    metadata: { fromAgentId: options.from, incidentId: options.incidentId ?? null },
  }
  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: `rpc_${randomUUID().slice(0, 8)}`,
    method: "message/send",
    params: { message },
  }

  // Every cross-agent effect passes through here, so this is the one place a
  // reset needs to be able to interrupt a run that is already in flight.
  const generation = store.generation

  store.recordBusMessage({
    fromAgentId: options.from,
    toAgentId: options.to,
    kind: options.kind,
    incidentId: options.incidentId ?? null,
    taskId,
    summary: options.summary,
    envelope: request,
  })
  store.recordTranscript({
    incidentId: options.incidentId ?? null,
    fromAgentId: options.from,
    toAgentId: options.to,
    kind: options.kind,
    text: options.text,
  })

  const response = await dispatch(options.to, request)
  if (store.generation !== generation) throw new WorldResetError()
  if ("error" in response) {
    throw new Error(`${options.to}: ${response.error.message}`)
  }
  const task = response.result as Task
  const reply = task.status.message
  const text = reply ? messageText(reply) : ""
  const data: Record<string, unknown> = {}
  for (const part of reply?.parts ?? []) if ("data" in part) Object.assign(data, part.data)

  store.recordBusMessage({
    fromAgentId: options.to,
    toAgentId: options.from,
    kind: options.kind === "query" ? "answer" : "report",
    incidentId: options.incidentId ?? null,
    taskId,
    summary: firstLine(text) || `${options.to} responded`,
    envelope: response,
  })
  if (text.trim().length > 0) {
    store.recordTranscript({
      incidentId: options.incidentId ?? null,
      fromAgentId: options.to,
      toAgentId: options.from,
      kind: options.kind === "query" ? "answer" : "report",
      text,
    })
  }

  return { task, text, data, state: task.status.state }
}

/** A message with no single recipient — everyone enrolled sees it. */
export function a2aBroadcast(options: {
  from: string
  incidentId: string | null
  summary: string
  text: string
}): void {
  store.recordTranscript({
    incidentId: options.incidentId,
    fromAgentId: options.from,
    toAgentId: null,
    kind: "broadcast",
    text: options.text,
  })
  store.recordBusMessage({
    fromAgentId: options.from,
    toAgentId: null,
    kind: "broadcast",
    incidentId: options.incidentId,
    taskId: null,
    summary: options.summary,
    envelope: {
      jsonrpc: "2.0",
      method: "message/send",
      params: {
        message: {
          role: "ROLE_AGENT",
          parts: [{ text: options.text }],
          metadata: { fromAgentId: options.from, broadcast: true, incidentId: options.incidentId },
        },
      },
    },
  })
}

function firstLine(text: string): string {
  const line = text.split("\n").find((each) => each.trim().length > 0) ?? ""
  return line.length > 140 ? `${line.slice(0, 137)}…` : line
}
