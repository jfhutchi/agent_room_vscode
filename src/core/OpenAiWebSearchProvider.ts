import { ProviderId, WebResearchSettings } from "./Types";
import { Provider, ProviderHealth, ProviderInvocation, ProviderResult } from "./ProviderTypes";
import { redactText } from "../utils/redaction";

export interface SecretReader {
  get(key: string): Thenable<string | undefined> | Promise<string | undefined>;
}

export interface OpenAiWebSearchProviderOptions {
  enabled: boolean;
  settings: WebResearchSettings;
  secretReader?: SecretReader;
}

function extractResponseText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const obj = value as Record<string, unknown>;
  if (typeof obj.output_text === "string") return obj.output_text;
  const output = obj.output;
  if (!Array.isArray(output)) return "";
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const piece of content) {
      if (piece && typeof piece === "object") {
        const text = (piece as Record<string, unknown>).text;
        if (typeof text === "string") parts.push(text);
      }
    }
  }
  return parts.join("\n").trim();
}

export class OpenAiWebSearchProvider implements Provider {
  readonly id: ProviderId = "openAiWebSearch";
  readonly displayName = "OpenAI Web Search";
  readonly kind = "apiResearch";
  readonly enabled: boolean;
  readonly supportedModes = ["personalLocal"] as const;

  constructor(private readonly options: OpenAiWebSearchProviderOptions) {
    this.enabled = options.enabled;
  }

  async healthCheck(): Promise<ProviderHealth> {
    const key = await this.apiKey();
    return {
      providerId: this.id,
      available: this.enabled,
      configured: Boolean(this.enabled && key && this.options.settings.model),
      authenticatedLikely: Boolean(key),
      capabilities: { json: true },
      warnings: this.enabled
        ? key
          ? []
          : ["Scout is enabled but no OpenAI API key is configured for web research."]
        : ["Scout is disabled by default."],
      checkedAt: new Date().toISOString()
    };
  }

  async runTurn(invocation: ProviderInvocation): Promise<ProviderResult> {
    const started = Date.now();
    const key = await this.apiKey();
    if (!this.enabled || !key || !this.options.settings.model) {
      return {
        providerId: this.id,
        virtualAgentId: invocation.virtualAgentId,
        status: "error",
        finalText:
          "Scout is disabled or not configured. Enable Web Research and configure a user-owned OpenAI API key and model.",
        diagnostics: { durationMs: Date.now() - started },
        durationMs: Date.now() - started,
        fallbackUsed: false,
        warnings: ["Web research is disabled or missing configuration."]
      };
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: invocation.concreteModelName || this.options.settings.model,
        tools: [{ type: "web_search_preview" }],
        input:
          invocation.prompt +
          `\n\nReturn at most ${this.options.settings.maxResults} cited source results.`
      }),
      signal: invocation.abortSignal
    });
    const bodyText = await response.text();
    let body: unknown = {};
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = {};
    }
    const finalText = extractResponseText(body) || redactText(bodyText);

    return {
      providerId: this.id,
      virtualAgentId: invocation.virtualAgentId,
      status: response.ok ? "complete" : "error",
      finalText,
      diagnostics: {
        commandLabel: "OpenAI Responses API",
        exitCode: response.ok ? 0 : 1,
        durationMs: Date.now() - started,
        stderr: response.ok ? "" : redactText(bodyText)
      },
      durationMs: Date.now() - started,
      fallbackUsed: false,
      warnings: response.ok ? [] : [`OpenAI API returned HTTP ${response.status}.`]
    };
  }

  private async apiKey(): Promise<string | undefined> {
    if (this.options.settings.apiKeySource === "environment") {
      return process.env[this.options.settings.apiKeyEnvironmentVariable];
    }
    return this.options.secretReader?.get("agentRoom.webResearch.openAiApiKey");
  }
}
