import { agentDef } from "./roster.ts"
import { commanderPrompt, specialistPrompt } from "./prompts.ts"
import { store } from "../store.ts"
import { getToolsForAgent, executeTool, type ToolSchema } from "../tools/dispatch.ts"
import type { ProviderName } from "../config.ts"

export interface ProviderResult {
  text: string
  toolCalls: number
  usage: { input: number; output: number }
}

function readableTool(name: string): string {
  return name.replace(/^mcp__esper__/, "").replace(/^mcp__phalanx__/, "").replace(/_/g, " ")
}

/* ---- Gemini Runner ------------------------------------------------------ */

async function runGemini(options: {
  apiKey: string
  model: string
  agentId: string
  incidentId: string | null
  prompt: string
  systemPrompt: string
  tools: ToolSchema[]
  maxTurns: number
}): Promise<ProviderResult> {
  const context = { agentId: options.agentId, incidentId: options.incidentId }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`

  const contents: Array<{
    role: "user" | "model" | "function"
    parts: Array<Record<string, unknown>>
  }> = [
    { role: "user", parts: [{ text: options.prompt }] },
  ]

  const functionDeclarations = options.tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))

  const generation = store.generation
  let finalText = ""
  let toolCalls = 0
  const usage = { input: 0, output: 0 }

  for (let turn = 0; turn < options.maxTurns; turn++) {
    store.assertGeneration(generation)
    const payload = {
      systemInstruction: { parts: [{ text: options.systemPrompt }] },
      contents,
      tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => "")
      throw new Error(`Gemini API error (${response.status}): ${errText.slice(0, 300)}`)
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<Record<string, unknown>>
        }
      }>
      usageMetadata?: {
        promptTokenCount?: number
        candidatesTokenCount?: number
      }
    }

    if (data.usageMetadata) {
      usage.input += Number(data.usageMetadata.promptTokenCount ?? 0)
      usage.output += Number(data.usageMetadata.candidatesTokenCount ?? 0)
    }

    const candidate = data.candidates?.[0]
    const parts = candidate?.content?.parts ?? []

    const calls = parts.filter((p) => p.functionCall && typeof (p.functionCall as { name?: string }).name === "string")
    const textPart = parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("").trim()
    if (textPart) finalText = textPart

    if (calls.length === 0) {
      break
    }

    // Append model message with calls
    contents.push({ role: "model", parts })

    // Execute functions
    const responseParts: Array<Record<string, unknown>> = []
    for (const item of calls) {
      toolCalls += 1
      const call = item.functionCall as { name: string; args?: Record<string, unknown> }
      store.setAgentState(options.agentId, {
        state: call.name.endsWith("a2a_send") ? "consulting" : "working",
        activity: readableTool(call.name),
      })

      const output = await executeTool(context, call.name, call.args ?? {})
      responseParts.push({
        functionResponse: {
          name: call.name,
          response: { output },
        },
      })
    }

    contents.push({ role: "function", parts: responseParts })
  }

  return { text: finalText, toolCalls, usage }
}

/* ---- OpenAI Runner ------------------------------------------------------ */

async function runOpenAI(options: {
  apiKey: string
  model: string
  agentId: string
  incidentId: string | null
  prompt: string
  systemPrompt: string
  tools: ToolSchema[]
  maxTurns: number
}): Promise<ProviderResult> {
  const context = { agentId: options.agentId, incidentId: options.incidentId }
  const url = "https://api.openai.com/v1/chat/completions"

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: options.systemPrompt },
    { role: "user", content: options.prompt },
  ]

  const openAITools = options.tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))

  const generation = store.generation
  let finalText = ""
  let toolCalls = 0
  const usage = { input: 0, output: 0 }

  for (let turn = 0; turn < options.maxTurns; turn++) {
    store.assertGeneration(generation)
    const payload: Record<string, unknown> = {
      model: options.model,
      messages,
      ...(openAITools.length > 0 ? { tools: openAITools } : {}),
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => "")
      throw new Error(`OpenAI API error (${response.status}): ${errText.slice(0, 300)}`)
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          role: string
          content?: string | null
          tool_calls?: Array<{
            id: string
            type: string
            function: { name: string; arguments: string }
          }>
        }
      }>
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
      }
    }

    if (data.usage) {
      usage.input += Number(data.usage.prompt_tokens ?? 0)
      usage.output += Number(data.usage.completion_tokens ?? 0)
    }

    const msg = data.choices?.[0]?.message
    if (!msg) break

    if (typeof msg.content === "string" && msg.content.trim().length > 0) {
      finalText = msg.content.trim()
    }

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      break
    }

    messages.push(msg)

    for (const call of msg.tool_calls) {
      toolCalls += 1
      store.setAgentState(options.agentId, {
        state: call.function.name.endsWith("a2a_send") ? "consulting" : "working",
        activity: readableTool(call.function.name),
      })

      let parsedArgs: Record<string, unknown> = {}
      try {
        parsedArgs = JSON.parse(call.function.arguments || "{}")
      } catch {
        parsedArgs = {}
      }

      const output = await executeTool(context, call.function.name, parsedArgs)
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: output,
      })
    }
  }

  return { text: finalText, toolCalls, usage }
}

/* ---- Anthropic Messages API Runner ------------------------------------- */

async function runAnthropic(options: {
  apiKey: string
  model: string
  agentId: string
  incidentId: string | null
  prompt: string
  systemPrompt: string
  tools: ToolSchema[]
  maxTurns: number
}): Promise<ProviderResult> {
  const context = { agentId: options.agentId, incidentId: options.incidentId }
  const url = "https://api.anthropic.com/v1/messages"

  const messages: Array<{
    role: "user" | "assistant"
    content: unknown
  }> = [
    { role: "user", content: options.prompt },
  ]

  const anthropicTools = options.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }))

  const generation = store.generation
  let finalText = ""
  let toolCalls = 0
  const usage = { input: 0, output: 0 }

  for (let turn = 0; turn < options.maxTurns; turn++) {
    store.assertGeneration(generation)
    const payload: Record<string, unknown> = {
      model: options.model,
      system: options.systemPrompt,
      max_tokens: 4096,
      messages,
      ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": options.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => "")
      throw new Error(`Anthropic API error (${response.status}): ${errText.slice(0, 300)}`)
    }

    const data = (await response.json()) as {
      content?: Array<{
        type: string
        text?: string
        id?: string
        name?: string
        input?: Record<string, unknown>
      }>
      stop_reason?: string
      usage?: {
        input_tokens?: number
        output_tokens?: number
      }
    }

    if (data.usage) {
      usage.input += Number(data.usage.input_tokens ?? 0)
      usage.output += Number(data.usage.output_tokens ?? 0)
    }

    const blocks = data.content ?? []
    const textChunk = blocks
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("")
      .trim()

    if (textChunk.length > 0) finalText = textChunk

    const toolUseBlocks = blocks.filter((b) => b.type === "tool_use" && typeof b.name === "string")
    if (toolUseBlocks.length === 0 || data.stop_reason === "end_turn") {
      break
    }

    messages.push({ role: "assistant", content: blocks })

    const toolResults: Array<{
      type: "tool_result"
      tool_use_id: string
      content: string
    }> = []

    for (const block of toolUseBlocks) {
      toolCalls += 1
      const toolName = block.name!
      store.setAgentState(options.agentId, {
        state: toolName.endsWith("a2a_send") ? "consulting" : "working",
        activity: readableTool(toolName),
      })

      const output = await executeTool(context, toolName, block.input ?? {})
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id!,
        content: output,
      })
    }

    messages.push({ role: "user", content: toolResults })
  }

  return { text: finalText, toolCalls, usage }
}

/* ---- Public Dispatcher -------------------------------------------------- */

export async function executeAgentWithProvider(options: {
  provider: ProviderName
  apiKey: string
  model: string
  agentId: string
  incidentId: string | null
  prompt: string
  maxTurns?: number
}): Promise<ProviderResult> {
  const def = agentDef(options.agentId)
  const isCommander = def.class === "command"
  const systemPrompt = isCommander ? commanderPrompt(def) : specialistPrompt(def)
  const tools = getToolsForAgent(options.agentId)
  const maxTurns = options.maxTurns ?? (isCommander ? 30 : 10)

  switch (options.provider) {
    case "gemini":
      return await runGemini({
        apiKey: options.apiKey,
        model: options.model,
        agentId: options.agentId,
        incidentId: options.incidentId,
        prompt: options.prompt,
        systemPrompt,
        tools,
        maxTurns,
      })
    case "openai":
      return await runOpenAI({
        apiKey: options.apiKey,
        model: options.model,
        agentId: options.agentId,
        incidentId: options.incidentId,
        prompt: options.prompt,
        systemPrompt,
        tools,
        maxTurns,
      })
    case "anthropic":
      return await runAnthropic({
        apiKey: options.apiKey,
        model: options.model,
        agentId: options.agentId,
        incidentId: options.incidentId,
        prompt: options.prompt,
        systemPrompt,
        tools,
        maxTurns,
      })
    default:
      throw new Error(`Unsupported live provider: ${options.provider}`)
  }
}

/* ---- Quick Key Validation ----------------------------------------------- */

export async function testProviderKey(options: {
  provider: "gemini" | "anthropic" | "openai"
  apiKey: string
  model?: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!options.apiKey || options.apiKey.trim().length === 0) {
      return { ok: false, error: "API key cannot be empty" }
    }

    if (options.provider === "gemini") {
      const model = options.model || "gemini-3.8-flash"
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] }),
      })
      if (res.ok) return { ok: true }
      const err = await res.text().catch(() => "")
      return { ok: false, error: `Gemini verification failed (${res.status}): ${err.slice(0, 150)}` }
    }

    if (options.provider === "openai") {
      const model = options.model || "gpt-5-mini"
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5,
        }),
      })
      if (res.ok) return { ok: true }
      const err = await res.text().catch(() => "")
      return { ok: false, error: `OpenAI verification failed (${res.status}): ${err.slice(0, 150)}` }
    }

    if (options.provider === "anthropic") {
      const model = options.model || "claude-haiku-4-5"
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": options.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 5,
          messages: [{ role: "user", content: "ping" }],
        }),
      })
      if (res.ok) return { ok: true }
      const err = await res.text().catch(() => "")
      return { ok: false, error: `Anthropic verification failed (${res.status}): ${err.slice(0, 150)}` }
    }

    return { ok: false, error: "Unknown provider" }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
