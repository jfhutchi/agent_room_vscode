import { AgentDiagnostics, ProviderId } from "./Types";
import {
  Provider,
  ProviderCapabilities,
  ProviderHealth,
  ProviderInvocation,
  ProviderResult
} from "./ProviderTypes";
import { parseJsonLines } from "../utils/jsonl";
import { redactDeep, redactText } from "../utils/redaction";
import { resultDiagnostics, runCommand } from "../utils/childProcess";
import { SafetyPolicy } from "./SafetyPolicy";

export interface ClaudeCodeProviderOptions {
  executable: string;
  timeoutMs: number;
  preferStreamJson: boolean;
  preferJson: boolean;
}

/** Canonical §12 friendly string. */
export const CLAUDE_NOT_AVAILABLE_MESSAGE =
  "Claude Code is not available. Run `claude` once in a terminal to finish setup.";

export type ClaudeOutputFormat = "stream-json" | "json" | "plain";

export interface BuiltClaudeArgs {
  args: string[];
  format: ClaudeOutputFormat;
  warnings: string[];
}

/**
 * Degradation ladder (SPEC §8): stream-json → json → plain, driven by the
 * capabilities detected from `claude --help`. With no capability information
 * yet (health check not run), the user's preferences are trusted as before.
 */
export function buildClaudeArgs(
  options: Pick<ClaudeCodeProviderOptions, "preferStreamJson" | "preferJson">,
  capabilities: ProviderCapabilities | undefined,
  concreteModelName?: string
): BuiltClaudeArgs {
  const args = ["-p"];
  const warnings: string[] = [];
  const canStreamJson = capabilities ? Boolean(capabilities.outputFormat && capabilities.streamJson) : true;
  const canJson = capabilities ? Boolean(capabilities.outputFormat && capabilities.json) : true;

  let format: ClaudeOutputFormat = "plain";
  if (options.preferStreamJson && canStreamJson) {
    // `claude -p --output-format stream-json` requires --verbose (the CLI errors otherwise).
    args.push("--output-format", "stream-json", "--verbose");
    format = "stream-json";
  } else if ((options.preferJson || options.preferStreamJson) && canJson) {
    args.push("--output-format", "json");
    format = "json";
    if (options.preferStreamJson) {
      warnings.push("stream-json is not supported by this Claude CLI; degraded to json output.");
    }
  } else if (options.preferStreamJson || options.preferJson) {
    if (capabilities) {
      warnings.push("Structured output is not supported by this Claude CLI; using plain text output.");
    }
  }

  if (concreteModelName) {
    if (!capabilities || capabilities.model) {
      args.push("--model", concreteModelName);
    } else {
      warnings.push(
        `This Claude CLI does not expose a --model flag; using the provider default instead of "${concreteModelName}".`
      );
    }
  }
  return { args, format, warnings };
}

export interface ParsedProviderOutput {
  text: string;
  events: unknown[];
  fallbackUsed: boolean;
  warnings: string[];
}

/**
 * Only treat the CLI as logged-out on a concrete signal. `--version` and
 * `--help` describe auth flags and use words like "required"/"API key", so
 * scanning them produced false "needs auth" reports; we look only for an
 * explicit logged-out phrase, and only in the version invocation's output.
 */
const LOGGED_OUT = /(not\s+(logged\s*in|authenticated|signed\s*in)|please\s+(log|sign)\s*in|invalid\s+api\s+key|unauthorized|authentication\s+(failed|required))/i;

export function authLikely(text: string): boolean {
  return !LOGGED_OUT.test(text);
}

function claudeCapabilities(help: string): ProviderCapabilities {
  return {
    print: /(^|\s)(-p|--print)(\s|,|$)/i.test(help),
    outputFormat: /--output-format/i.test(help),
    streamJson: /stream-json/i.test(help),
    json: /\bjson\b/i.test(help),
    model: /(^|\s)(-m|--model)(\s|,|$)/i.test(help),
    stdinPrompt: true
  };
}

/**
 * Pull the real answer out of Claude's stream-json. ONLY assistant-message
 * content (and the final `result` as a fallback) — never `system`/`hook_*`
 * events, whose `output`/`stderr` fields otherwise leak hook noise (e.g.
 * "Bun not found", SDK metrics) into the displayed reply.
 */
function claudeAssistantText(events: unknown[]): string {
  const parts: string[] = [];
  let result = "";
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const obj = event as Record<string, unknown>;
    const type = typeof obj.type === "string" ? obj.type : "";
    if (type === "assistant") {
      const message = obj.message as Record<string, unknown> | undefined;
      const content = message?.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item && typeof item === "object") {
            const itemText = (item as Record<string, unknown>).text;
            if (typeof itemText === "string") parts.push(itemText);
          }
        }
      }
    } else if (type === "result" && typeof obj.result === "string") {
      result = obj.result;
    }
  }
  const joined = parts.join("").trim();
  return joined || result.trim();
}

export function parseClaudeOutput(stdout: string, preferJson: boolean): ParsedProviderOutput {
  if (!preferJson || !stdout.trim().startsWith("{")) {
    return { text: stdout.trim(), events: [], fallbackUsed: true, warnings: [] };
  }

  const parsed = parseJsonLines(stdout);
  const text = claudeAssistantText(parsed.events);
  if (!text) {
    return {
      text: parsed.plainLines.join("\n").trim() || stdout.trim(),
      events: parsed.events.map((event) => redactDeep(event)),
      fallbackUsed: true,
      warnings: parsed.invalidLines ? [`${parsed.invalidLines} output lines were not JSON.`] : []
    };
  }

  return {
    text,
    events: parsed.events.map((event) => redactDeep(event)),
    fallbackUsed: parsed.invalidLines > 0,
    warnings: parsed.invalidLines ? [`${parsed.invalidLines} output lines were not JSON.`] : []
  };
}

export class ClaudeCodeProvider implements Provider {
  readonly id: ProviderId = "claudeCodeCli";
  readonly displayName = "Claude Code";
  readonly kind = "localCli";
  readonly enabled = true;
  readonly supportedModes = ["personalLocal"] as const;

  /** Capabilities detected by the last health check; consulted by runTurn. */
  private capabilities: ProviderCapabilities | undefined;

  constructor(private readonly options: ClaudeCodeProviderOptions) {}

  cachedCapabilities(): ProviderCapabilities | undefined {
    return this.capabilities;
  }

  async healthCheck(): Promise<ProviderHealth> {
    const version = await runCommand({
      executable: this.options.executable,
      args: ["--version"],
      timeoutMs: this.options.timeoutMs,
      label: "claude --version"
    });
    const help = await runCommand({
      executable: this.options.executable,
      args: ["--help"],
      timeoutMs: this.options.timeoutMs,
      label: "claude --help"
    });
    // Auth status cannot be read from --help (it documents auth flags); probe
    // only the version invocation's own output for an explicit logged-out signal.
    const authProbe = `${version.stdout}\n${version.stderr}`;
    this.capabilities = claudeCapabilities(help.stdout || help.stderr);
    const available = !version.failedToStart && (version.exitCode === 0 || help.exitCode === 0);
    return {
      providerId: this.id,
      available,
      configured: available,
      authenticatedLikely: authLikely(authProbe),
      executable: this.options.executable,
      versionText: redactText(version.stdout || version.stderr).trim(),
      helpText: redactText(help.stdout || help.stderr).slice(0, 8000),
      capabilities: this.capabilities,
      warnings: available ? [] : [CLAUDE_NOT_AVAILABLE_MESSAGE],
      error: version.failedToStart ? version.errorMessage : undefined,
      checkedAt: new Date().toISOString()
    };
  }

  async runTurn(invocation: ProviderInvocation): Promise<ProviderResult> {
    const started = Date.now();
    const built = buildClaudeArgs(this.options, this.capabilities, invocation.concreteModelName);
    const { args } = built;

    // SPEC §17: dangerous flags never reach the CLI without every gate open.
    const safety = new SafetyPolicy({
      enableDangerousModes: false,
      dangerousModeSelected: false,
      dangerousModeConfirmed: false
    });
    const decision = safety.checkArgs(args, invocation.safetyMode);
    if (!decision.allowed) {
      return {
        providerId: this.id,
        virtualAgentId: invocation.virtualAgentId,
        status: "error",
        finalText: decision.reason ?? "Blocked by safety policy.",
        diagnostics: { warnings: built.warnings },
        durationMs: Date.now() - started,
        fallbackUsed: false,
        warnings: built.warnings
      };
    }

    const result = await runCommand({
      executable: this.options.executable,
      args,
      cwd: invocation.workspaceRoot,
      stdinInput: invocation.prompt,
      timeoutMs: invocation.timeoutMs,
      abortSignal: invocation.abortSignal,
      label: "claude",
      onStdout: invocation.onPartialText
    });
    const parsed = parseClaudeOutput(result.stdout, built.format !== "plain");
    const warnings = [...built.warnings, ...parsed.warnings];
    const diagnostics: AgentDiagnostics = {
      ...resultDiagnostics(result),
      rawEvents: parsed.events,
      fallbackUsed: parsed.fallbackUsed,
      warnings,
      error: result.errorMessage
    };

    return {
      providerId: this.id,
      virtualAgentId: invocation.virtualAgentId,
      status: result.cancelled ? "cancelled" : result.timedOut ? "timeout" : result.exitCode === 0 ? "complete" : "error",
      finalText:
        parsed.text ||
        redactText(
          result.stderr ||
            result.errorMessage ||
            (result.failedToStart ? CLAUDE_NOT_AVAILABLE_MESSAGE : "Claude Code produced no output.")
        ),
      diagnostics,
      durationMs: Date.now() - started,
      fallbackUsed: parsed.fallbackUsed,
      warnings
    };
  }
}
