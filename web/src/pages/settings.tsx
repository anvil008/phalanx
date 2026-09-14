import { useEffect, useState } from "react"
import { CheckCircle2, ExternalLink, Eye, EyeOff, Loader2, XCircle } from "lucide-react"
import { ClaudeLogo, GeminiLogo, OpenAILogo } from "@/components/provider-logos"
import { Button } from "@foundry/ui/components/button"
import { PageContent, PageHeader } from "@foundry/ui/components/page-chrome"
import { phalanxApi, usePhalanx } from "@/lib/store"
import type { PublicSettings } from "@/lib/model"

/* Model & API settings.
   Hairline sections rather than cards: an eyebrow, a serif heading, the prose
   that explains the choice, then the fields. The current selection is a 1px
   accent rule on the left, never a lit border. */

const FIELD =
  "h-8 w-full rounded-[0.125rem] border border-rule bg-transparent px-2.5 font-mono text-xs text-ink placeholder:text-muted-soft focus:outline-none"

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
        setSavedMessage("Settings saved. The swarm picked them up.")
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
      message: res.ok ? "Connection verified. The model answered." : res.error || "Connection failed.",
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
        subtitle={state.mode === "live" ? `live swarm · ${state.activeProvider}` : "deterministic replay"}
        actions={
          <Button size="sm" className="button-ink gap-1.5" onClick={handleSave} disabled={saving || loading}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            <span>Save</span>
          </Button>
        }
      />

      <div className="flex w-full max-w-4xl flex-col gap-10 pb-24">
        {savedMessage ? <Notice tone="positive" message={savedMessage} /> : null}
        {errorMessage ? <Notice tone="negative" message={errorMessage} /> : null}

        {/* ---------------------------------------------------------- mode */}
        <section className="flex flex-col gap-4">
          <SectionLabel eyebrow="Execution mode" meta={selectedMode === "live" ? "Live swarm" : "Replay simulation"} />
          <p className="prose-serif max-w-[62ch]">
            Choose between deterministic replay and real-time orchestration of live LLM agents.
          </p>

          <div className="flex flex-col">
            <ModeRow
              selected={selectedMode === "replay"}
              onClick={() => setSelectedMode("replay")}
              name="Replay"
              description="Runs pre-recorded incident scenarios. No API keys or credits. Suits quick demos, test suites, and offline review."
            />
            <ModeRow
              selected={selectedMode === "live"}
              onClick={() => setSelectedMode("live")}
              name="Live agent swarm"
              description="Runs genuine multi-agent sessions against Google Gemini, Anthropic Claude, or OpenAI. Agents make real tool calls and talk over A2A."
            />
          </div>

          {selectedMode === "live" ? (
            <div className="flex flex-col gap-2 pt-2">
              <span className="eyebrow">Active provider</span>
              {(["gemini", "anthropic", "openai"] as const).map((prov) => {
                const isConfigured = settings?.providers[prov]?.configured
                const label = prov === "gemini" ? "Google Gemini" : prov === "anthropic" ? "Anthropic Claude" : "OpenAI"
                return (
                  <button
                    key={prov}
                    type="button"
                    onClick={() => setSelectedProvider(prov)}
                    className={`rule-row w-full grid-cols-[minmax(0,1fr)_auto] items-center border-l-2 text-left ${
                      selectedProvider === prov ? "border-l-[var(--accent)]" : "border-l-transparent"
                    }`}
                    style={{ paddingLeft: "0.75rem" }}
                  >
                    <span className="flex items-center gap-2.5">
                      {prov === "gemini" ? <GeminiLogo className="size-4 shrink-0 text-muted-foreground" /> : null}
                      {prov === "anthropic" ? <ClaudeLogo className="size-4 shrink-0 text-muted-foreground" /> : null}
                      {prov === "openai" ? <OpenAILogo className="size-4 shrink-0 text-muted-foreground" /> : null}
                      <span className={`title-serif text-base ${selectedProvider === prov ? "" : "opacity-70"}`}>
                        {label}
                      </span>
                    </span>
                    <span className="meta-mono">{isConfigured ? "Key configured" : "Key not set"}</span>
                  </button>
                )
              })}
            </div>
          ) : null}
        </section>

        {/* -------------------------------------------------------- gemini */}
        <section className="flex flex-col gap-4">
          <SectionLabel
            eyebrow="Provider"
            meta={
              <>
                {settings?.providers.gemini.configured ? <Tag tone="positive">Configured</Tag> : null}
                {selectedProvider === "gemini" && selectedMode === "live" ? <Tag tone="info">Active</Tag> : null}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 hover:text-ink!"
                >
                  <span>Get API key</span>
                  <ExternalLink className="size-3" />
                </a>
              </>
            }
          />

          <h2 className="title-serif flex items-center gap-2.5 text-[1.375rem]">
            <GeminiLogo className="size-4 text-muted-foreground" />
            Google Gemini
          </h2>
          <p className="prose-serif max-w-[62ch]">
            Supports Gemini 3.1 Pro and Gemini 3.8 Flash with native function calling and streaming.
          </p>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <label className="eyebrow" htmlFor="gemini-key">
                API key
              </label>
              {settings?.providers.gemini.configured ? (
                <span className="meta-mono">Current {settings.providers.gemini.preview}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  id="gemini-key"
                  type={showGeminiKey ? "text" : "password"}
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder={settings?.providers.gemini.configured ? "Enter a new key to replace the existing one" : "AIzaSy..."}
                  className={`${FIELD} pr-8`}
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  className="absolute right-2 top-2 text-muted-foreground hover:text-ink!"
                  aria-label={showGeminiKey ? "Hide key" : "Show key"}
                >
                  {showGeminiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => testKey("gemini")}
                disabled={testingGemini || (!geminiKey && !settings?.providers.gemini.configured)}
                className="h-8 shrink-0 gap-1.5"
              >
                {testingGemini ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Test connection
              </Button>
            </div>
            {geminiTestResult ? <TestResult result={geminiTestResult} /> : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ModelField
              label="Commander model"
              value={geminiCommander}
              onChange={setGeminiCommander}
              hint="Default gemini-3.1-pro"
            />
            <ModelField
              label="Specialist model"
              value={geminiSpecialist}
              onChange={setGeminiSpecialist}
              hint="Default gemini-3.8-flash"
            />
          </div>
        </section>

        {/* ----------------------------------------------------- anthropic */}
        <section className="flex flex-col gap-4">
          <SectionLabel
            eyebrow="Provider"
            meta={
              <>
                {settings?.providers.anthropic.configured ? <Tag tone="positive">Configured</Tag> : null}
                {selectedProvider === "anthropic" && selectedMode === "live" ? <Tag tone="info">Active</Tag> : null}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 hover:text-ink!"
                >
                  <span>Get API key</span>
                  <ExternalLink className="size-3" />
                </a>
              </>
            }
          />

          <h2 className="title-serif flex items-center gap-2.5 text-[1.375rem]">
            <ClaudeLogo className="size-4 text-muted-foreground" />
            Anthropic Claude
          </h2>
          <p className="prose-serif max-w-[62ch]">
            Claude Sonnet 5 and Haiku 4.5 over the tool-calling API, or a local Claude CLI agent profile.
          </p>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <label className="eyebrow" htmlFor="anthropic-key">
                API key
              </label>
              {settings?.providers.anthropic.configured ? (
                <span className="meta-mono">Current {settings.providers.anthropic.preview}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  id="anthropic-key"
                  type={showAnthropicKey ? "text" : "password"}
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder={settings?.providers.anthropic.configured ? "Enter a new key to replace the existing one" : "sk-ant-api03-..."}
                  className={`${FIELD} pr-8`}
                />
                <button
                  type="button"
                  onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                  className="absolute right-2 top-2 text-muted-foreground hover:text-ink!"
                  aria-label={showAnthropicKey ? "Hide key" : "Show key"}
                >
                  {showAnthropicKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => testKey("anthropic")}
                disabled={testingAnthropic || (!anthropicKey && !settings?.providers.anthropic.configured)}
                className="h-8 shrink-0 gap-1.5"
              >
                {testingAnthropic ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Test connection
              </Button>
            </div>
            {anthropicTestResult ? <TestResult result={anthropicTestResult} /> : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ModelField
              label="Commander model"
              value={anthropicCommander}
              onChange={setAnthropicCommander}
              hint="Default claude-sonnet-5"
            />
            <ModelField
              label="Specialist model"
              value={anthropicSpecialist}
              onChange={setAnthropicSpecialist}
              hint="Default claude-haiku-4-5"
            />
          </div>
        </section>

        {/* -------------------------------------------------------- openai */}
        <section className="flex flex-col gap-4">
          <SectionLabel
            eyebrow="Provider"
            meta={
              <>
                {settings?.providers.openai.configured ? <Tag tone="positive">Configured</Tag> : null}
                {selectedProvider === "openai" && selectedMode === "live" ? <Tag tone="info">Active</Tag> : null}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 hover:text-ink!"
                >
                  <span>Get API key</span>
                  <ExternalLink className="size-3" />
                </a>
              </>
            }
          />

          <h2 className="title-serif flex items-center gap-2.5 text-[1.375rem]">
            <OpenAILogo className="size-4 text-muted-foreground" />
            OpenAI
          </h2>
          <p className="prose-serif max-w-[62ch]">
            Supports GPT-5, GPT-5 mini, and o3 with tool execution.
          </p>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <label className="eyebrow" htmlFor="openai-key">
                API key
              </label>
              {settings?.providers.openai.configured ? (
                <span className="meta-mono">Current {settings.providers.openai.preview}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  id="openai-key"
                  type={showOpenAIKey ? "text" : "password"}
                  value={openaiKey}
                  onChange={(e) => setOpenAIKey(e.target.value)}
                  placeholder={settings?.providers.openai.configured ? "Enter a new key to replace the existing one" : "sk-proj-..."}
                  className={`${FIELD} pr-8`}
                />
                <button
                  type="button"
                  onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                  className="absolute right-2 top-2 text-muted-foreground hover:text-ink!"
                  aria-label={showOpenAIKey ? "Hide key" : "Show key"}
                >
                  {showOpenAIKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => testKey("openai")}
                disabled={testingOpenAI || (!openaiKey && !settings?.providers.openai.configured)}
                className="h-8 shrink-0 gap-1.5"
              >
                {testingOpenAI ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Test connection
              </Button>
            </div>
            {openaiTestResult ? <TestResult result={openaiTestResult} /> : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ModelField
              label="Commander model"
              value={openaiCommander}
              onChange={setOpenaiCommander}
              hint="Default gpt-5"
            />
            <ModelField
              label="Specialist model"
              value={openaiSpecialist}
              onChange={setOpenaiSpecialist}
              hint="Default gpt-5-mini"
            />
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
          <div className="flex flex-col gap-0.5">
            <span className="meta-mono">
              Target {selectedMode === "live" ? `live · ${selectedProvider}` : "deterministic replay"}
            </span>
            <span className="prose-serif">Changes take effect immediately across all active agent listeners.</span>
          </div>
          <Button className="button-ink gap-1.5" onClick={handleSave} disabled={saving || loading}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            <span>Save</span>
          </Button>
        </div>
      </div>
    </PageContent>
  )
}

function SectionLabel({ eyebrow, meta }: { eyebrow: string; meta?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-rule pb-1.5">
      <span className="eyebrow flex-1">{eyebrow}</span>
      {meta ? <div className="meta-mono flex items-center gap-2">{meta}</div> : null}
    </div>
  )
}

function ModeRow({
  selected,
  onClick,
  name,
  description,
}: {
  selected: boolean
  onClick: () => void
  name: string
  description: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rule-row w-full gap-1! border-l-2 text-left ${selected ? "border-l-[var(--accent)]" : "border-l-transparent"}`}
      style={{ paddingLeft: "0.75rem" }}
    >
      <span className={`title-serif text-base ${selected ? "" : "opacity-70"}`}>{name}</span>
      <span className="prose-serif max-w-[62ch]">{description}</span>
    </button>
  )
}

function ModelField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  hint: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="eyebrow">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={FIELD} />
      <p className="meta-mono">{hint}</p>
    </div>
  )
}

function TestResult({ result }: { result: { ok: boolean; message: string } }) {
  return (
    <div
      className="meta-mono flex items-center gap-1.5"
      style={{ color: result.ok ? "var(--positive)" : "var(--negative)" }}
    >
      {result.ok ? <CheckCircle2 className="size-3.5 shrink-0" /> : <XCircle className="size-3.5 shrink-0" />}
      <span>{result.message}</span>
    </div>
  )
}

function Notice({ tone, message }: { tone: "positive" | "negative"; message: string }) {
  return (
    <div
      className="meta-mono flex items-center gap-2 border-l-2 py-2 pl-3"
      style={{ borderColor: `var(--${tone})`, color: `var(--${tone})` }}
    >
      {tone === "positive" ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />}
      <span>{message}</span>
    </div>
  )
}

function Tag({ tone, children }: { tone: "positive" | "info"; children: React.ReactNode }) {
  return (
    <span className="sev-tag" data-tone={tone}>
      {children}
    </span>
  )
}
