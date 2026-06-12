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

export interface CodexCliProviderOptions {
  executable: string;
  timeoutMs: number;
  useJson: boolean;
  sandbox: "read-only" | "workspace-write";
  approval: "untrusted" | "on-request" | "never";
}

export interface ParsedCodexOutput {
  text: string;
  events: unknown[];
  fallbackUsed: boolean;
  warnings: string[];
}

function codexCapabilities(help: string): ProviderCapabilities {
  return {
    exec: /\bexec\b/i.test(help),
    cd: /--cd\b/i.test(help),
    sandbox: /--sandbox\b/i.test(help),
    askForApproval: /--ask-for-approval\b/i.test(help),
    jsonl: /--json\b/i.test(help),
    model: /(^|\s)(-m|--model)(\s|,|$)/i.test(help),
    stdinPrompt: true
  };
}

function authLikely(text: string): boolean {
  return !/(login|auth|authenticate|not\s+authenticated|required)/i.test(text);
}

export function parseCodexOutput(stdout: string, preferJson: boolean): ParsedCodexOutput {
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

  const text = textParts.join("\n").trim();
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

export class CodexCliProvider implements Provider {
  readonly id: ProviderId = "codexCli";
  readonly displayName = "Codex CLI";
  readonly kind = "localCli";
  readonly enabled = true;
  readonly supportedModes = ["personalLocal"] as const;

  constructor(private readonly options: CodexCliProviderOptions) {}

  async healthCheck(): Promise<ProviderHealth> {
    const version = await runCommand({
      executable: this.options.executable,
      args: ["--version"],
      timeoutMs: this.options.timeoutMs,
      label: "codex --version"
    });
    const help = await runCommand({
      executable: this.options.executable,
      args: ["--help"],
      timeoutMs: this.options.timeoutMs,
      label: "codex --help"
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
      capabilities: codexCapabilities(help.stdout || help.stderr),
      warnings: version.failedToStart
        ? ["Codex CLI was not found. Run `codex` in a terminal and complete installation/login."]
        : [],
      error: version.failedToStart ? version.errorMessage : undefined,
      checkedAt: new Date().toISOString()
    };
  }

  async runTurn(invocation: ProviderInvocation): Promise<ProviderResult> {
    const started = Date.now();
    const args = ["exec"];
    if (invocation.workspaceRoot) args.push("--cd", invocation.workspaceRoot);
    args.push("--sandbox", this.options.sandbox, "--ask-for-approval", this.options.approval);
    if (this.options.useJson) args.push("--json");
    if (invocation.concreteModelName) args.push("--model", invocation.concreteModelName);
    args.push("-");

    const result = await runCommand({
      executable: this.options.executable,
      args,
      cwd: invocation.workspaceRoot,
      stdinInput: invocation.prompt,
      timeoutMs: invocation.timeoutMs,
      abortSignal: invocation.abortSignal,
      label: "codex",
      onStdout: invocation.onPartialText
    });
    const parsed = parseCodexOutput(result.stdout, this.options.useJson);
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
      finalText: parsed.text || redactText(result.stderr || result.errorMessage || "Codex CLI produced no output."),
      diagnostics,
      durationMs: Date.now() - started,
      fallbackUsed: parsed.fallbackUsed,
      warnings: parsed.warnings
    };
  }
}
