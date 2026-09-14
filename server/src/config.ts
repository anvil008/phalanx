import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export type ProviderName = "gemini" | "anthropic" | "openai" | "replay"

export interface ProviderModels {
  commander: string
  specialist: string
}

export interface PhalanxSettings {
  mode: "live" | "replay"
  activeProvider: ProviderName
  apiKeys: {
    gemini: string
    anthropic: string
    openai: string
  }
  models: {
    gemini: ProviderModels
    anthropic: ProviderModels
    openai: ProviderModels
  }
}

export interface PublicSettings {
  mode: "live" | "replay"
  activeProvider: ProviderName
  providers: {
    gemini: { configured: boolean; preview: string }
    anthropic: { configured: boolean; preview: string }
    openai: { configured: boolean; preview: string }
  }
  models: {
    gemini: ProviderModels
    anthropic: ProviderModels
    openai: ProviderModels
  }
}

const CONFIG_FILE = join(process.cwd(), ".phalanx.config.json")

export const DEFAULT_MODELS: Record<"gemini" | "anthropic" | "openai", ProviderModels> = {
  gemini: {
    commander: "gemini-3.1-pro",
    specialist: "gemini-3.8-flash",
  },
  anthropic: {
    commander: "claude-sonnet-5",
    specialist: "claude-haiku-4-5",
  },
  openai: {
    commander: "gpt-5",
    specialist: "gpt-5-mini",
  },
}

function maskKey(key: string): string {
  if (!key || key.trim().length === 0) return ""
  const trimmed = key.trim()
  if (trimmed.length <= 8) return "••••"
  return `${trimmed.slice(0, 3)}••••${trimmed.slice(-4)}`
}

export function loadSettings(): PhalanxSettings {
  const settings: PhalanxSettings = {
    mode: "replay",
    activeProvider: "replay",
    apiKeys: {
      gemini: process.env.GEMINI_API_KEY ?? "",
      anthropic: process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? "",
      openai: process.env.OPENAI_API_KEY ?? "",
    },
    models: {
      gemini: { ...DEFAULT_MODELS.gemini },
      anthropic: { ...DEFAULT_MODELS.anthropic },
      openai: { ...DEFAULT_MODELS.openai },
    },
  }

  let explicitProvider = false
  if (existsSync(CONFIG_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as Partial<PhalanxSettings>
      if (parsed.apiKeys) {
        if (parsed.apiKeys.gemini) settings.apiKeys.gemini = parsed.apiKeys.gemini
        if (parsed.apiKeys.anthropic) settings.apiKeys.anthropic = parsed.apiKeys.anthropic
        if (parsed.apiKeys.openai) settings.apiKeys.openai = parsed.apiKeys.openai
      }
      if (parsed.models) {
        if (parsed.models.gemini) settings.models.gemini = { ...settings.models.gemini, ...parsed.models.gemini }
        if (parsed.models.anthropic) settings.models.anthropic = { ...settings.models.anthropic, ...parsed.models.anthropic }
        if (parsed.models.openai) settings.models.openai = { ...settings.models.openai, ...parsed.models.openai }
      }
      if (parsed.activeProvider) {
        settings.activeProvider = parsed.activeProvider
        explicitProvider = true
      }
      if (parsed.mode) settings.mode = parsed.mode
    } catch {
      // Ignore unparseable file
    }
  }

  // Environment variable overrides
  const envMode = (process.env.PHALANX_MODE ?? "").toLowerCase()
  if (envMode === "live" || envMode === "replay") settings.mode = envMode

  const envProvider = (process.env.PHALANX_PROVIDER ?? "").toLowerCase()
  if (["gemini", "anthropic", "openai", "replay"].includes(envProvider)) {
    settings.activeProvider = envProvider as ProviderName
    explicitProvider = true
  }

  // Automatic provider resolution only if provider was not explicitly chosen
  if (!explicitProvider && settings.activeProvider === "replay") {
    if (settings.apiKeys.anthropic) {
      settings.activeProvider = "anthropic"
      settings.mode = "live"
    } else if (settings.apiKeys.gemini) {
      settings.activeProvider = "gemini"
      settings.mode = "live"
    } else if (settings.apiKeys.openai) {
      settings.activeProvider = "openai"
      settings.mode = "live"
    }
  }

  return settings
}

export function saveSettings(settings: PhalanxSettings): void {
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(settings, null, 2), { encoding: "utf8", mode: 0o600 })
  } catch (error) {
    process.stderr.write(`Warning: Failed to save .phalanx.config.json: ${String(error)}\n`)
  }
}

export function toPublicSettings(settings: PhalanxSettings): PublicSettings {
  return {
    mode: settings.mode,
    activeProvider: settings.activeProvider,
    providers: {
      gemini: {
        configured: Boolean(settings.apiKeys.gemini && settings.apiKeys.gemini.trim().length > 0),
        preview: maskKey(settings.apiKeys.gemini),
      },
      anthropic: {
        configured: Boolean(settings.apiKeys.anthropic && settings.apiKeys.anthropic.trim().length > 0),
        preview: maskKey(settings.apiKeys.anthropic),
      },
      openai: {
        configured: Boolean(settings.apiKeys.openai && settings.apiKeys.openai.trim().length > 0),
        preview: maskKey(settings.apiKeys.openai),
      },
    },
    models: settings.models,
  }
}
