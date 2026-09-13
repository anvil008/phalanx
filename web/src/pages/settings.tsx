import { useEffect, useState } from "react"
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  KeyRound,
  Loader2,
  Radio,
  RefreshCw,
  Save,
  ShieldCheck,
  Cpu,
  XCircle,
} from "lucide-react"
import { Badge } from "@foundry/ui/components/badge"
import { Button } from "@foundry/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@foundry/ui/components/card"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { phalanxApi, usePhalanx } from "@/lib/store"
import type { PublicSettings } from "@/lib/model"

export function SettingsPage() {
  const state = usePhalanx()
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // API key edits (masked/blank unless edited)
  const [geminiKey, setGeminiKey] = useState("")
  const [anthropicKey, setAnthropicKey] = useState("")
  const [openaiKey, setOpenAIKey] = useState("")

  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [showAnthropicKey, setShowAnthropicKey] = useState(false)
  const [showOpenAIKey, setShowOpenAIKey] = useState(false)

  // Selected mode & active provider
  const [selectedMode, setSelectedMode] = useState<"live" | "replay">("replay")
  const [selectedProvider, setSelectedProvider] = useState<"gemini" | "anthropic" | "openai" | "replay">("gemini")

  // Models
  const [geminiCommander, setGeminiCommander] = useState("gemini-3.1-pro")
  const [geminiSpecialist, setGeminiSpecialist] = useState("gemini-3.8-flash")
  const [anthropicCommander, setAnthropicCommander] = useState("claude-sonnet-5")
  const [anthropicSpecialist, setAnthropicSpecialist] = useState("claude-haiku-4-5")
  const [openaiCommander, setOpenaiCommander] = useState("gpt-5")
  const [openaiSpecialist, setOpenaiSpecialist] = useState("gpt-5-mini")

  // Testing status
  const [testingGemini, setTestingGemini] = useState(false)
  const [geminiTestResult, setGeminiTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const [testingAnthropic, setTestingAnthropic] = useState(false)
  const [anthropicTestResult, setAnthropicTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const [testingOpenAI, setTestingOpenAI] = useState(false)
  const [openaiTestResult, setOpenaiTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const current = await phalanxApi.getSettings()
        setSettings(current)
        setSelectedMode(current.mode)
        setSelectedProvider(current.activeProvider)
        setGeminiCommander(current.models.gemini.commander)
        setGeminiSpecialist(current.models.gemini.specialist)
        setAnthropicCommander(current.models.anthropic.commander)
        setAnthropicSpecialist(current.models.anthropic.specialist)
        setOpenaiCommander(current.models.openai.commander)
        setOpenaiSpecialist(current.models.openai.specialist)
      } catch {
        setErrorMessage("Failed to load settings from server.")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  async function handleSave() {
    setSaving(true)
    setSavedMessage(null)
    setErrorMessage(null)

    const payload: Partial<PublicSettings> & {
      apiKeys?: { gemini?: string; anthropic?: string; openai?: string }
    } = {
      mode: selectedMode,
      activeProvider: selectedProvider,
      models: {
        gemini: { commander: geminiCommander, specialist: geminiSpecialist },
        anthropic: { commander: anthropicCommander, specialist: anthropicSpecialist },
        openai: { commander: openaiCommander, specialist: openaiSpecialist },
      },
    }

    const apiKeys: { gemini?: string; anthropic?: string; openai?: string } = {}
    if (geminiKey.trim()) apiKeys.gemini = geminiKey.trim()
    if (anthropicKey.trim()) apiKeys.anthropic = anthropicKey.trim()
    if (openaiKey.trim()) apiKeys.openai = openaiKey.trim()
    payload.apiKeys = apiKeys

    try {
      const res = await phalanxApi.updateSettings(payload)
      if (res.ok && res.settings) {
        setSettings(res.settings)
        setGeminiKey("")
        setAnthropicKey("")
        setOpenAIKey("")
        setSavedMessage("Settings saved successfully! Swarm updated.")
        setTimeout(() => setSavedMessage(null), 5000)
      } else {
        setErrorMessage(res.reason || "Failed to save settings.")
      }
    } catch {
      setErrorMessage("Failed to save settings to server.")
    } finally {
      setSaving(false)
    }
  }

  async function testKey(provider: "gemini" | "anthropic" | "openai") {
    let key = ""
    let model = ""
    if (provider === "gemini") {
      key = geminiKey
      model = geminiSpecialist
      setTestingGemini(true)
      setGeminiTestResult(null)
    } else if (provider === "anthropic") {
      key = anthropicKey
      model = anthropicSpecialist
      setTestingAnthropic(true)
      setAnthropicTestResult(null)
    } else if (provider === "openai") {
      key = openaiKey
      model = openaiSpecialist
      setTestingOpenAI(true)
      setOpenaiTestResult(null)
    }

    const res = await phalanxApi.testKey(provider, key, model)
    const result = {
      ok: res.ok,
      message: res.ok ? "Connection verified! Model responded cleanly." : res.error || "Connection failed.",
    }

    if (provider === "gemini") {
      setTestingGemini(false)
      setGeminiTestResult(result)
    } else if (provider === "anthropic") {
      setTestingAnthropic(false)
      setAnthropicTestResult(result)
    } else if (provider === "openai") {
      setTestingOpenAI(false)
      setOpenaiTestResult(result)
    }
  }

  return (
    <PageContent className="phalanx-page-scroll-fade">
      <PageHeader
        title="Model & API Settings"
        subtitle={state.mode === "live" ? `Live Swarm (${state.activeProvider})` : "Deterministic Replay"}
        actions={
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-1.5 shadow-sm"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>Save & Apply</span>
          </Button>
        }
      />

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-1 pt-2 pb-36">
        {savedMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{savedMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
            <XCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Mode & Active Provider Selection */}
        <Card className="border-border/60 bg-card/70 backdrop-blur">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Swarm Execution Mode</CardTitle>
                <CardDescription className="mt-1 text-xs text-muted-foreground">
                  Choose between deterministic replay or real-time live LLM agent orchestration
                </CardDescription>
              </div>
              <Badge variant={selectedMode === "live" ? "default" : "secondary"}>
                {selectedMode === "live" ? "Live Swarm" : "Replay Simulation"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div
                onClick={() => setSelectedMode("replay")}
                className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-4 transition-all ${
                  selectedMode === "replay"
                    ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                    : "border-border/60 bg-muted/20 hover:border-border hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Replay Mode</span>
                  </div>
                  {selectedMode === "replay" && <CheckCircle2 className="h-4 w-4 text-primary" />}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Runs pre-recorded realistic incident scenarios. Zero API keys or credits required. Ideal for quick demos, test suites, and offline review.
                </p>
              </div>

              <div
                onClick={() => setSelectedMode("live")}
                className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-4 transition-all ${
                  selectedMode === "live"
                    ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                    : "border-border/60 bg-muted/20 hover:border-border hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-emerald-400" />
                    <span className="text-sm font-semibold">Live Agent Swarm</span>
                  </div>
                  {selectedMode === "live" && <CheckCircle2 className="h-4 w-4 text-primary" />}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Executes genuine multi-agent sessions with Google Gemini, Anthropic Claude, or OpenAI. Agents make real tool calls and communicate over A2A.
                </p>
              </div>
            </div>

            {selectedMode === "live" && (
              <div className="mt-4 rounded-lg border border-border/80 bg-muted/20 p-4">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Active Live LLM Provider
                </label>
                <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {(["gemini", "anthropic", "openai"] as const).map((prov) => {
                    const isConfigured = settings?.providers[prov]?.configured
                    const isSelected = selectedProvider === prov
                    const label = prov === "gemini" ? "Google Gemini" : prov === "anthropic" ? "Anthropic Claude" : "OpenAI"
                    return (
                      <button
                        key={prov}
                        type="button"
                        onClick={() => setSelectedProvider(prov)}
                        className={`flex items-center justify-between rounded-md border px-3.5 py-2.5 text-left text-sm transition-all ${
                          isSelected
                            ? "border-primary bg-primary/15 font-semibold text-foreground shadow-sm ring-1 ring-primary/30"
                            : "border-border/60 bg-background/50 hover:bg-accent/40"
                        }`}
                      >
                        <div className="flex flex-col">
                          <span>{label}</span>
                          <span className="mt-0.5 text-[11px] text-muted-foreground">
                            {isConfigured ? "Key Configured" : "Key Not Set"}
                          </span>
                        </div>
                        {isSelected ? (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        ) : (
                          <div className={`h-2 w-2 rounded-full ${isConfigured ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gemini Provider Card */}
        <Card className={`border-border/60 bg-card/70 transition-all ${selectedProvider === "gemini" && selectedMode === "live" ? "ring-1 ring-primary/40" : ""}`}>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Cpu className="h-5 w-5 text-indigo-400" />
                <CardTitle className="text-base font-semibold">Google Gemini API</CardTitle>
                {settings?.providers.gemini.configured && (
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px]">
                    Configured
                  </Badge>
                )}
                {selectedProvider === "gemini" && selectedMode === "live" && (
                  <Badge variant="default" className="text-[10px]">
                    Active
                  </Badge>
                )}
              </div>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <span>Get API Key</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <CardDescription className="mt-1 text-xs text-muted-foreground">
              Supports Gemini 3.1 Pro and Gemini 3.8 Flash with native function calling and streaming.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">Gemini API Key</label>
                {settings?.providers.gemini.configured && (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    Current: {settings.providers.gemini.preview}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showGeminiKey ? "text" : "password"}
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder={settings?.providers.gemini.configured ? "Enter new key to replace existing" : "AIzaSy..."}
                    className="h-9 w-full rounded-md border border-input/70 bg-background/60 px-3 py-2 text-xs font-mono text-foreground shadow-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testKey("gemini")}
                  disabled={testingGemini || (!geminiKey && !settings?.providers.gemini.configured)}
                  className="h-9 text-xs"
                >
                  {testingGemini ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />}
                  Test Connection
                </Button>
              </div>
              {geminiTestResult && (
                <div className={`mt-2 flex items-center gap-1.5 text-xs ${geminiTestResult.ok ? "text-emerald-400" : "text-rose-400"}`}>
                  {geminiTestResult.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                  <span>{geminiTestResult.message}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Incident Commander Model</label>
                <input
                  type="text"
                  value={geminiCommander}
                  onChange={(e) => setGeminiCommander(e.target.value)}
                  className="h-9 w-full rounded-md border border-input/70 bg-background/60 px-3 py-2 text-xs font-mono text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[11px] text-muted-foreground">Default: gemini-3.1-pro</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Specialist Agent Model</label>
                <input
                  type="text"
                  value={geminiSpecialist}
                  onChange={(e) => setGeminiSpecialist(e.target.value)}
                  className="h-9 w-full rounded-md border border-input/70 bg-background/60 px-3 py-2 text-xs font-mono text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[11px] text-muted-foreground">Default: gemini-3.8-flash</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Anthropic Claude Provider Card */}
        <Card className={`border-border/60 bg-card/70 transition-all ${selectedProvider === "anthropic" && selectedMode === "live" ? "ring-1 ring-primary/40" : ""}`}>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Flame className="h-5 w-5 text-amber-500" />
                <CardTitle className="text-base font-semibold">Anthropic Claude API</CardTitle>
                {settings?.providers.anthropic.configured && (
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px]">
                    Configured
                  </Badge>
                )}
                {selectedProvider === "anthropic" && selectedMode === "live" && (
                  <Badge variant="default" className="text-[10px]">
                    Active
                  </Badge>
                )}
              </div>
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <span>Get API Key</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <CardDescription className="mt-1 text-xs text-muted-foreground">
              Direct Claude Sonnet 5 / Haiku 4.5 tool-calling API or local Claude CLI agent profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">Anthropic API Key</label>
                {settings?.providers.anthropic.configured && (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    Current: {settings.providers.anthropic.preview}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showAnthropicKey ? "text" : "password"}
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    placeholder={settings?.providers.anthropic.configured ? "Enter new key to replace existing" : "sk-ant-api03-..."}
                    className="h-9 w-full rounded-md border border-input/70 bg-background/60 px-3 py-2 text-xs font-mono text-foreground shadow-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    {showAnthropicKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testKey("anthropic")}
                  disabled={testingAnthropic || (!anthropicKey && !settings?.providers.anthropic.configured)}
                  className="h-9 text-xs"
                >
                  {testingAnthropic ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />}
                  Test Connection
                </Button>
              </div>
              {anthropicTestResult && (
                <div className={`mt-2 flex items-center gap-1.5 text-xs ${anthropicTestResult.ok ? "text-emerald-400" : "text-rose-400"}`}>
                  {anthropicTestResult.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                  <span>{anthropicTestResult.message}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Incident Commander Model</label>
                <input
                  type="text"
                  value={anthropicCommander}
                  onChange={(e) => setAnthropicCommander(e.target.value)}
                  className="h-9 w-full rounded-md border border-input/70 bg-background/60 px-3 py-2 text-xs font-mono text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[11px] text-muted-foreground">Default: claude-sonnet-5</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Specialist Agent Model</label>
                <input
                  type="text"
                  value={anthropicSpecialist}
                  onChange={(e) => setAnthropicSpecialist(e.target.value)}
                  className="h-9 w-full rounded-md border border-input/70 bg-background/60 px-3 py-2 text-xs font-mono text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[11px] text-muted-foreground">Default: claude-haiku-4-5</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* OpenAI Provider Card */}
        <Card className={`border-border/60 bg-card/70 transition-all ${selectedProvider === "openai" && selectedMode === "live" ? "ring-1 ring-primary/40" : ""}`}>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <KeyRound className="h-5 w-5 text-emerald-400" />
                <CardTitle className="text-base font-semibold">OpenAI API</CardTitle>
                {settings?.providers.openai.configured && (
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px]">
                    Configured
                  </Badge>
                )}
                {selectedProvider === "openai" && selectedMode === "live" && (
                  <Badge variant="default" className="text-[10px]">
                    Active
                  </Badge>
                )}
              </div>
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <span>Get API Key</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <CardDescription className="mt-1 text-xs text-muted-foreground">
              Supports GPT-5, GPT-5 mini, and o3 with tool execution.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">OpenAI API Key</label>
                {settings?.providers.openai.configured && (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    Current: {settings.providers.openai.preview}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showOpenAIKey ? "text" : "password"}
                    value={openaiKey}
                    onChange={(e) => setOpenAIKey(e.target.value)}
                    placeholder={settings?.providers.openai.configured ? "Enter new key to replace existing" : "sk-proj-..."}
                    className="h-9 w-full rounded-md border border-input/70 bg-background/60 px-3 py-2 text-xs font-mono text-foreground shadow-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    {showOpenAIKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testKey("openai")}
                  disabled={testingOpenAI || (!openaiKey && !settings?.providers.openai.configured)}
                  className="h-9 text-xs"
                >
                  {testingOpenAI ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />}
                  Test Connection
                </Button>
              </div>
              {openaiTestResult && (
                <div className={`mt-2 flex items-center gap-1.5 text-xs ${openaiTestResult.ok ? "text-emerald-400" : "text-rose-400"}`}>
                  {openaiTestResult.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                  <span>{openaiTestResult.message}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Incident Commander Model</label>
                <input
                  type="text"
                  value={openaiCommander}
                  onChange={(e) => setOpenaiCommander(e.target.value)}
                  className="h-9 w-full rounded-md border border-input/70 bg-background/60 px-3 py-2 text-xs font-mono text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[11px] text-muted-foreground">Default: gpt-5</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Specialist Agent Model</label>
                <input
                  type="text"
                  value={openaiSpecialist}
                  onChange={(e) => setOpenaiSpecialist(e.target.value)}
                  className="h-9 w-full rounded-md border border-input/70 bg-background/60 px-3 py-2 text-xs font-mono text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[11px] text-muted-foreground">Default: gpt-5-mini</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save & Apply Footer Bar */}
        <div className="mt-2 flex items-center justify-between rounded-xl border border-border/80 bg-card/80 p-4 shadow-md backdrop-blur">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs font-medium">
              Target: {selectedMode === "live" ? `Live (${selectedProvider})` : "Deterministic Replay"}
            </Badge>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Changes take effect immediately across all active agent listeners.
            </span>
          </div>
          <Button onClick={handleSave} disabled={saving || loading} className="flex items-center gap-1.5 shadow-sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span>Save & Apply Settings</span>
          </Button>
        </div>
      </div>
    </PageContent>
  )
}
