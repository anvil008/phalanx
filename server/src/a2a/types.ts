/* Agent2Agent (A2A) core objects, v0.3 shape.
   Phalanx speaks the real protocol between its own agents rather than calling
   them through function pointers: every delegation is a JSON-RPC `message/send`
   against an agent card, so the trace on the Protocol page is the wire, not a
   rendering of it. */

export type TaskState =
  | "TASK_STATE_SUBMITTED"
  | "TASK_STATE_WORKING"
  | "TASK_STATE_INPUT_REQUIRED"
  | "TASK_STATE_COMPLETED"
  | "TASK_STATE_FAILED"
  | "TASK_STATE_CANCELED"
  | "TASK_STATE_REJECTED"

export type Role = "ROLE_USER" | "ROLE_AGENT"

export interface TextPart {
  text: string
}

export interface DataPart {
  data: Record<string, unknown>
}

export type Part = TextPart | DataPart

export interface Message {
  messageId: string
  contextId?: string
  taskId?: string
  role: Role
  parts: Part[]
  metadata?: Record<string, unknown>
  referenceTaskIds?: string[]
}

export interface TaskStatus {
  state: TaskState
  message?: Message
  timestamp: string
}

export interface Artifact {
  artifactId: string
  name?: string
  parts: Part[]
}

export interface Task {
  id: string
  contextId: string
  status: TaskStatus
  artifacts: Artifact[]
  history: Message[]
  metadata?: Record<string, unknown>
}

export interface AgentSkill {
  id: string
  name: string
  description: string
  tags: string[]
  examples?: string[]
}

export interface AgentCapabilities {
  streaming: boolean
  pushNotifications: boolean
  extendedAgentCard: boolean
}

export interface AgentCard {
  protocolVersion: string
  name: string
  description: string
  url: string
  version: string
  provider: { organization: string; url: string }
  capabilities: AgentCapabilities
  defaultInputModes: string[]
  defaultOutputModes: string[]
  skills: AgentSkill[]
  /** Phalanx extension: presentation metadata the graph reads. */
  metadata: {
    agentId: string
    discipline: string
    model: string
    clearance: "read" | "act" | "command"
  }
}

export interface JsonRpcRequest {
  jsonrpc: "2.0"
  id: string | number
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcSuccess {
  jsonrpc: "2.0"
  id: string | number
  result: unknown
}

export interface JsonRpcFailure {
  jsonrpc: "2.0"
  id: string | number
  error: { code: number; message: string; data?: unknown }
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure

export const A2A_ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  taskNotFound: -32001,
  agentNotFound: -32004,
} as const

export function textPart(text: string): TextPart {
  return { text }
}

export function dataPart(data: Record<string, unknown>): DataPart {
  return { data }
}

export function messageText(message: Message): string {
  return message.parts
    .map((part) => ("text" in part ? part.text : JSON.stringify(part.data)))
    .join("\n")
}

export function isTerminal(state: TaskState): boolean {
  return (
    state === "TASK_STATE_COMPLETED" ||
    state === "TASK_STATE_FAILED" ||
    state === "TASK_STATE_CANCELED" ||
    state === "TASK_STATE_REJECTED"
  )
}
