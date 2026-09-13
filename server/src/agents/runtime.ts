import { query } from "@anthropic-ai/claude-agent-sdk"
import { registerHandler, type HandlerContext, type HandlerResult } from "../a2a/transport.ts"
import { agentDef, ROSTER } from "./roster.ts"
import { commanderPrompt, specialistPrompt, specialistTask } from "./prompts.ts"
import { store, WorldResetError } from "../store.ts"
import { toolNamesFor, toolServerFor } from "../tools/mcp.ts"
import { executeAgentWithProvider } from "./provider-runner.ts"

/* Live agent sessions.
   Supports Google Gemini, OpenAI, and Anthropic Claude providers natively.
   Tool executions and A2A messages flow through the standard Phalanx dispatch plane. */

const BUILT_INS_TO_BLOCK = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "Task",
  "TodoWrite",
  "KillShell",
  "BashOutput",
]

export interface SessionResult {
  text: string
  toolCalls: number
  usage: { input: number; output: number }
}

function extractText(message: Record<string, unknown>): string {
  const direct = message.result
  if (typeof direct === "string") return direct

  const contentSources: unknown[] = [
    message.content,
    (message.message as Record<string, unknown> | undefined)?.content,
  ]
  for (const source of contentSources) {
    if (!Array.isArray(source)) continue
    const text = source
      .filter((block): block is { type: string; text: string } => {
        const candidate = block as { type?: string; text?: string }
        return candidate?.type === "text" && typeof candidate.text === "string"
      })
      .map((block) => block.text)
      .join("")
    if (text.trim().length > 0) return text
  }
  if (message.type === "text" && typeof message.text === "string") return message.text
  return ""
}

function toolUseName(message: Record<string, unknown>): string | null {
  if (message.type === "tool_use" && typeof message.name === "string") return message.name
  const content = (message.message as Record<string, unknown> | undefined)?.content ?? message.content
  if (Array.isArray(content)) {
    for (const block of content) {
      const candidate = block as { type?: string; name?: string }
      if (candidate?.type === "tool_use" && typeof candidate.name === "string") return candidate.name
    }
  }
  return null
}

function readableTool(name: string): string {
  return name.replace(/^mcp__esper__/, "").replace(/^mcp__phalanx__/, "").replace(/_/g, " ")
}

function usageOf(message: Record<string, unknown>): { input: number; output: number } | null {
  const usage =
    (message.usage as Record<string, number> | undefined) ??
    ((message.message as Record<string, unknown> | undefined)?.usage as Record<string, number> | undefined)
  if (!usage) return null
  return { input: Number(usage.input_tokens ?? 0), output: Number(usage.output_tokens ?? 0) }
}

async function runClaudeSdkSession(options: {
  agentId: string
  incidentId: string | null
  prompt: string
  maxTurns?: number
  model?: string
}): Promise<SessionResult> {
  const def = agentDef(options.agentId)
  const isCommander = def.class === "command"
  const model = options.model ?? (isCommander ? store.commanderModel : store.specialistModel)
  const context = { agentId: options.agentId, incidentId: options.incidentId }

  let text = ""
  let toolCalls = 0
  const usage = { input: 0, output: 0 }

  const session = query({
    prompt: options.prompt,
    options: {
      model,
      systemPrompt: isCommander ? commanderPrompt(def) : specialistPrompt(def),
      mcpServers: { phalanx: toolServerFor(context) },
      allowedTools: toolNamesFor(options.agentId),
      disallowedTools: BUILT_INS_TO_BLOCK,
      permissionMode: "bypassPermissions",
      maxTurns: options.maxTurns ?? (isCommander ? 40 : 12),
      settingSources: [],
      env: { ...process.env },
    },
  })

  for await (const raw of session as AsyncIterable<unknown>) {
    const message = raw as Record<string, unknown>
    const tool = toolUseName(message)
    if (tool) {
      toolCalls += 1
      store.setAgentState(options.agentId, {
        state: tool.endsWith("a2a_send") ? "consulting" : "working",
        activity: readableTool(tool),
      })
    }
    const spend = usageOf(message)
    if (spend) {
      usage.input += spend.input
      usage.output += spend.output
    }
    const chunk = extractText(message)
    if (chunk) text = chunk
  }

  return { text: text.trim(), toolCalls, usage }
}

export async function runAgentSession(options: {
  agentId: string
  incidentId: string | null
  prompt: string
  maxTurns?: number
  model?: string
}): Promise<SessionResult> {
  const def = agentDef(options.agentId)
  const isCommander = def.class === "command"
  const provider = store.activeProvider

  store.setAgentState(options.agentId, {
    state: "working",
    activity: isCommander ? "Working the plan" : "Working the task",
    focusIncidentId: options.incidentId,
  })

  try {
    let result: SessionResult

    if (provider === "gemini") {
      const apiKey = store.settings.apiKeys.gemini
      if (!apiKey) throw new Error("Gemini API key is not configured in Settings.")
      const model = options.model ?? (isCommander ? store.settings.models.gemini.commander : store.settings.models.gemini.specialist)
      result = await executeAgentWithProvider({
        provider: "gemini",
        apiKey,
        model,
        agentId: options.agentId,
        incidentId: options.incidentId,
        prompt: options.prompt,
        maxTurns: options.maxTurns ?? (isCommander ? 30 : 12),
      })
    } else if (provider === "openai") {
      const apiKey = store.settings.apiKeys.openai
      if (!apiKey) throw new Error("OpenAI API key is not configured in Settings.")
      const model = options.model ?? (isCommander ? store.settings.models.openai.commander : store.settings.models.openai.specialist)
      result = await executeAgentWithProvider({
        provider: "openai",
        apiKey,
        model,
        agentId: options.agentId,
        incidentId: options.incidentId,
        prompt: options.prompt,
        maxTurns: options.maxTurns ?? (isCommander ? 30 : 12),
      })
    } else if (provider === "anthropic") {
      const apiKey = store.settings.apiKeys.anthropic
      if (apiKey) {
        const model = options.model ?? (isCommander ? store.settings.models.anthropic.commander : store.settings.models.anthropic.specialist)
        result = await executeAgentWithProvider({
          provider: "anthropic",
          apiKey,
          model,
          agentId: options.agentId,
          incidentId: options.incidentId,
          prompt: options.prompt,
          maxTurns: options.maxTurns ?? (isCommander ? 30 : 12),
        })
      } else {
        // Fallback to Claude Agent SDK
        result = await runClaudeSdkSession(options)
      }
    } else {
      throw new Error(`Cannot run agent session in mode ${store.mode} / provider ${provider}`)
    }

    store.creditAgent(options.agentId, { input: result.usage.input, output: result.usage.output })
    store.setAgentState(options.agentId, {
      state: "reporting",
      activity: isCommander ? "Updating the operator view" : "Reporting back",
    })
    return result
  } catch (error) {
    if (error instanceof WorldResetError) throw error
    const detail = error instanceof Error ? error.message : String(error)
    store.log(`${options.agentId} session failed: ${detail}`, "error")
    store.setAgentState(options.agentId, { state: "blocked", activity: "Session failed" })
    throw error
  }
}

function liveHandler(agentId: string) {
  return async (context: HandlerContext): Promise<HandlerResult> => {
    const def = agentDef(agentId)
    const requester = context.fromAgentId ? agentDef(context.fromAgentId).callsign : "the operator"
    store.setAgentState(agentId, {
      state: "briefing",
      activity: `Briefed by ${requester}`,
      focusIncidentId: context.incidentId,
    })
    if (context.incidentId) {
      store.enrollAgent(agentId, context.incidentId)
      store.setAssignmentState(context.incidentId, agentId, "working")
    }

    const objective = typeof context.data.objective === "string" ? context.data.objective : context.text

    try {
      const result = await runAgentSession({
        agentId,
        incidentId: context.incidentId,
        prompt: specialistTask({ from: requester, objective, context: context.text }),
        maxTurns: def.class === "command" ? 24 : 12,
      })

      if (result.text.length > 0) store.creditAgent(agentId, { findings: 1 })
      if (context.incidentId) store.setAssignmentState(context.incidentId, agentId, "reporting")
      store.setAgentState(agentId, { state: "standby", activity: `Reported to ${requester}` })
      return { text: result.text || "No usable finding within the turn budget." }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      store.setAgentState(agentId, { state: "standby", activity: "Error during task execution" })
      return { text: `Agent task failed: ${errMsg}` }
    }
  }
}

export function registerLiveHandlers(): void {
  for (const def of ROSTER) registerHandler(def.id, liveHandler(def.id))
  store.mode = "live"

  const provider = store.activeProvider
  if (provider === "gemini") {
    store.commanderModel = store.settings.models.gemini.commander
    store.specialistModel = store.settings.models.gemini.specialist
  } else if (provider === "openai") {
    store.commanderModel = store.settings.models.openai.commander
    store.specialistModel = store.settings.models.openai.specialist
  } else if (provider === "anthropic") {
    store.commanderModel = store.settings.models.anthropic.commander
    store.specialistModel = store.settings.models.anthropic.specialist
  }
}
