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
import { SafetyPolicy } from "./SafetyPolicy";
import { SafetyMode } from "./Types";

export interface CodexCliProviderOptions {
  executable: string;
  timeoutMs: number;
  useJson: boolean;
  sandbox: "read-only" | "workspace-write";
  approval: "untrusted" | "on-request" | "never";
}

/** Canonical §12 friendly string. */
export const CODEX_NOT_AVAILABLE_MESSAGE =
  "Codex is not available. Run `codex` once in a terminal to finish setup.";

export interface BuiltCodexArgs {
  args: string[];
  /** True when --json made it into the args, so output is parsed as JSONL. */
  json: boolean;
  warnings: string[];
}

/**
 * Degradation ladder (SPEC §8). Preferred shape:
 *   codex exec --cd <root> --sandbox <mode> --ask-for-approval <policy> --json -
 * Unsupported flags (per `codex --help` capabilities) are omitted: without
 * --cd the runner's cwd carries the workspace; without --json the plain text
 * output is parsed instead. With no capability information yet, the full
 * preferred shape is used. The sandbox value is resolved through SafetyPolicy
 * so a read-only safety mode always yields a read-only sandbox.
 */
export function buildCodexArgs(
  options: Pick<CodexCliProviderOptions, "useJson" | "sandbox" | "approval">,
  capabilities: ProviderCapabilities | undefined,
  invocation: { workspaceRoot?: string; concreteModelName?: string; safetyMode: SafetyMode }
): BuiltCodexArgs {
  const supports = (flag: boolean | undefined) => !capabilities || flag === true;
  const args: string[] = [];
  const warnings: string[] = [];

  if (supports(capabilities?.exec)) {
    args.push("exec");
  } else {
    warnings.push("This Codex CLI does not list an `exec` subcommand; invoking it directly.");
  }
  if (invocation.workspaceRoot && supports(capabilities?.cd)) {
    args.push("--cd", invocation.workspaceRoot);
  }
  const safety = new SafetyPolicy({
    enableDangerousModes: false,
    dangerousModeSelected: false,
    dangerousModeConfirmed: false
  });
  if (supports(capabilities?.sandbox)) {
    args.push("--sandbox", safety.codexSandboxFor(invocation.safetyMode, options.sandbox));
  }
  if (supports(capabilities?.askForApproval)) {
    args.push("--ask-for-approval", options.approval);
  }
  let json = false;
  if (options.useJson) {
    if (supports(capabilities?.jsonl)) {
      args.push("--json");
      json = true;
    } else {
      warnings.push("--json is not supported by this Codex CLI; parsing plain text output.");
    }
  }
  if (invocation.concreteModelName) {
    if (supports(capabilities?.model)) {
      args.push("--model", invocation.concreteModelName);
    } else {
      warnings.push(
        `This Codex CLI does not expose a --model flag; using the provider default instead of "${invocation.concreteModelName}".`
      );
    }
  }
  args.push("-");
  return { args, json, warnings };
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

/**
 * Only treat the CLI as logged-out on a concrete signal — not on `--help`
 * text, which documents auth flags and uses words like "required". See the
 * matching note in ClaudeCodeProvider.
 */
const LOGGED_OUT = /(not\s+(logged\s*in|authenticated|signed\s*in)|please\s+(log|sign)\s*in|invalid\s+api\s+key|unauthorized|authentication\s+(failed|required))/i;

function authLikely(text: string): boolean {
  return !LOGGED_OUT.test(text);
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

  /** Capabilities detected by the last health check; consulted by runTurn. */
  private capabilities: ProviderCapabilities | undefined;

  constructor(private readonly options: CodexCliProviderOptions) {}

  cachedCapabilities(): ProviderCapabilities | undefined {
    return this.capabilities;
  }

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
    // Probe only the version invocation's output for a logged-out signal; --help
    // documents auth flags and would false-trip the heuristic.
    const authProbe = `${version.stdout}\n${version.stderr}`;
    this.capabilities = codexCapabilities(help.stdout || help.stderr);
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
      warnings: available ? [] : [CODEX_NOT_AVAILABLE_MESSAGE],
      error: version.failedToStart ? version.errorMessage : undefined,
      checkedAt: new Date().toISOString()
    };
  }

  async runTurn(invocation: ProviderInvocation): Promise<ProviderResult> {
    const started = Date.now();
    const built = buildCodexArgs(this.options, this.capabilities, {
      workspaceRoot: invocation.workspaceRoot,
      concreteModelName: invocation.concreteModelName,
      safetyMode: invocation.safetyMode
    });
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
      label: "codex",
      onStdout: invocation.onPartialText
    });
    const parsed = parseCodexOutput(result.stdout, built.json);
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
            (result.failedToStart ? CODEX_NOT_AVAILABLE_MESSAGE : "Codex CLI produced no output.")
        ),
      diagnostics,
      durationMs: Date.now() - started,
      fallbackUsed: parsed.fallbackUsed,
      warnings
    };
  }
}
