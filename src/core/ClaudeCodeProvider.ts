import { AgentDiagnostics, ProviderId } from "./Types";
import {
  Provider,
  ProviderCapabilities,
  ProviderHealth,
  ProviderInvocation,
  ProviderResult
} from "./ProviderTypes";
import { eventType, extractTextFromEvent, parseJsonLines } from "../utils/jsonl";
import { redactDeep, redactText } from "../utils/redaction";
import { resultDiagnostics, runCommand } from "../utils/childProcess";

export interface ClaudeCodeProviderOptions {
  executable: string;
  timeoutMs: number;
  preferStreamJson: boolean;
  preferJson: boolean;
}

export interface ParsedProviderOutput {
  text: string;
  events: unknown[];
  fallbackUsed: boolean;
  warnings: string[];
}

function authLikely(text: string): boolean {
  return !/(login|auth|authenticate|not\s+authenticated|api\s+key|required)/i.test(text);
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

export function parseClaudeOutput(stdout: string, preferJson: boolean): ParsedProviderOutput {
  if (!preferJson || !stdout.trim().startsWith("{")) {
    return { text: stdout.trim(), events: [], fallbackUsed: true, warnings: [] };
  }

  const parsed = parseJsonLines(stdout);
  const textParts: string[] = [];
  for (const event of parsed.events) {
    const type = eventType(event);
    if (type.includes("error")) continue;
    const text = extractTextFromEvent(event);
    if (text.trim()) textParts.push(text);
  }

  const text = textParts.join("").trim();
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

  constructor(private readonly options: ClaudeCodeProviderOptions) {}

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
    const combined = `${version.stdout}\n${version.stderr}\n${help.stdout}\n${help.stderr}`;
    return {
      providerId: this.id,
      available: !version.failedToStart && (version.exitCode === 0 || help.exitCode === 0),
      configured: !version.failedToStart,
      authenticatedLikely: authLikely(combined),
      executable: this.options.executable,
      versionText: redactText(version.stdout || version.stderr).trim(),
      helpText: redactText(help.stdout || help.stderr).slice(0, 8000),
      capabilities: claudeCapabilities(help.stdout || help.stderr),
      warnings: version.failedToStart
        ? ["Claude CLI was not found. Run `claude` in a terminal and complete installation/login."]
        : [],
      error: version.failedToStart ? version.errorMessage : undefined,
      checkedAt: new Date().toISOString()
    };
  }

  async runTurn(invocation: ProviderInvocation): Promise<ProviderResult> {
    const started = Date.now();
    const args = ["-p"];
    if (this.options.preferStreamJson) {
      args.push("--output-format", "stream-json");
    } else if (this.options.preferJson) {
      args.push("--output-format", "json");
    }
    if (invocation.concreteModelName) {
      args.push("--model", invocation.concreteModelName);
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
    const parsed = parseClaudeOutput(result.stdout, this.options.preferJson || this.options.preferStreamJson);
    const diagnostics: AgentDiagnostics = {
      ...resultDiagnostics(result),
      rawEvents: parsed.events,
      fallbackUsed: parsed.fallbackUsed,
      warnings: parsed.warnings,
      error: result.errorMessage
    };

    return {
      providerId: this.id,
      virtualAgentId: invocation.virtualAgentId,
      status: result.cancelled ? "cancelled" : result.timedOut ? "timeout" : result.exitCode === 0 ? "complete" : "error",
      finalText: parsed.text || redactText(result.stderr || result.errorMessage || "Claude Code produced no output."),
      diagnostics,
      durationMs: Date.now() - started,
      fallbackUsed: parsed.fallbackUsed,
      warnings: parsed.warnings
    };
  }
}
