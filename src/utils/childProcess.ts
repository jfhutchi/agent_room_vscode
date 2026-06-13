/**
 * Safe child-process runner used for all CLI providers and git probes.
 *
 * Rules enforced here:
 *  - arguments are always passed as an array; never a shell command string
 *  - `shell: true` is never used
 *  - timeouts and user cancellation kill the process tree
 *  - stdout/stderr are captured, normalized and redacted for diagnostics
 *
 * Windows note: npm-installed CLIs (claude, codex) are `.cmd` shims which
 * Node refuses to spawn directly without a shell (CVE-2024-27980 hardening).
 * When a direct spawn fails with ENOENT/EINVAL on Windows we retry through
 * `cmd.exe /d /s /c` with conservative per-argument quoting and a strict
 * argument character allowlist. Prompts are passed via stdin wherever the
 * CLI supports it, so untrusted text never travels through cmd.exe quoting.
 */

import { spawn, SpawnOptionsWithoutStdio } from "child_process";
import { redactText, truncateForDiagnostics } from "./redaction";

export interface RunCommandOptions {
  executable: string;
  args: string[];
  cwd?: string;
  /** Text written to stdin then closed. */
  stdinInput?: string;
  timeoutMs: number;
  abortSignal?: AbortSignal;
  /** Called with each stdout chunk for streaming consumers. */
  onStdout?: (chunk: string) => void;
  /** Human-readable label used in diagnostics; defaults to the executable. */
  label?: string;
  env?: NodeJS.ProcessEnv;
}

export interface CommandResult {
  commandLabel: string;
  argsPreview: string[];
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
  failedToStart: boolean;
  errorMessage?: string;
}

/** Conservative allowlist for arguments routed through the cmd.exe fallback. */
const SAFE_WINDOWS_ARG = /^[A-Za-z0-9 _.,:;=@%+\\/-]*$/;

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function quoteForCmd(arg: string): string {
  // Arguments have already passed SAFE_WINDOWS_ARG, so plain quoting is enough.
  return `"${arg.replace(/"/g, "")}"`;
}

/**
 * Build the argv for the `cmd.exe` fallback. cmd.exe /S strips the FIRST and
 * LAST quote of everything after /C, so the per-argument-quoted line must be
 * wrapped in one more outer quote pair — otherwise `"codex" "--version"`
 * collapses to the garbled `codex" "--version` and cmd reports
 * "not recognized as an internal or external command".
 */
export function buildWindowsCmdArguments(executable: string, args: string[]): string[] {
  const commandLine = [quoteForCmd(executable), ...args.map(quoteForCmd)].join(" ");
  return ["/d", "/s", "/c", `"${commandLine}"`];
}

interface SpawnPlan {
  executable: string;
  args: string[];
  options: SpawnOptionsWithoutStdio;
}

function directPlan(opts: RunCommandOptions): SpawnPlan {
  return {
    executable: opts.executable,
    args: opts.args,
    options: {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      shell: false,
      windowsHide: true
    }
  };
}

function windowsCmdPlan(opts: RunCommandOptions): SpawnPlan | { error: string } {
  for (const a of [opts.executable, ...opts.args]) {
    if (!SAFE_WINDOWS_ARG.test(a)) {
      return {
        error:
          `Refusing to pass an argument containing shell metacharacters through cmd.exe: ${JSON.stringify(
            a.slice(0, 40)
          )}. ` + "Use stdin-based prompts or rename the executable path."
      };
    }
  }
  return {
    executable: process.env.ComSpec || "cmd.exe",
    args: buildWindowsCmdArguments(opts.executable, opts.args),
    options: {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      shell: false,
      windowsHide: true,
      windowsVerbatimArguments: true
    }
  };
}

function execute(plan: SpawnPlan, opts: RunCommandOptions): Promise<CommandResult> {
  const started = Date.now();
  const label = opts.label ?? opts.executable;
  const argsPreview = opts.args.map((a) =>
    redactText(a.length > 120 ? `${a.slice(0, 120)}…` : a)
  );

  return new Promise<CommandResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let cancelled = false;
    let settled = false;

    const child = spawn(plan.executable, plan.args, plan.options);

    const finish = (partial: Partial<CommandResult> & { failedToStart?: boolean }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.abortSignal?.removeEventListener("abort", onAbort);
      resolve({
        commandLabel: label,
        argsPreview,
        exitCode: partial.exitCode ?? null,
        signal: partial.signal ?? null,
        stdout: normalizeNewlines(stdout),
        stderr: normalizeNewlines(stderr),
        durationMs: Date.now() - started,
        timedOut,
        cancelled,
        failedToStart: partial.failedToStart ?? false,
        errorMessage: partial.errorMessage
      });
    };

    const kill = () => {
      try {
        if (process.platform === "win32" && child.pid) {
          // Kill the whole tree; cmd.exe fallback would otherwise orphan children.
          spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
        } else {
          child.kill("SIGTERM");
          setTimeout(() => {
            try {
              child.kill("SIGKILL");
            } catch {
              /* already exited */
            }
          }, 2000).unref();
        }
      } catch {
        /* process already gone */
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, Math.max(1, opts.timeoutMs));

    const onAbort = () => {
      cancelled = true;
      kill();
    };
    if (opts.abortSignal) {
      if (opts.abortSignal.aborted) onAbort();
      else opts.abortSignal.addEventListener("abort", onAbort, { once: true });
    }

    child.on("error", (err: NodeJS.ErrnoException) => {
      finish({ failedToStart: true, errorMessage: `${err.code ?? "ERR"}: ${err.message}` });
    });

    child.stdout?.on("data", (buf: Buffer) => {
      const text = buf.toString("utf8");
      stdout += text;
      try {
        opts.onStdout?.(normalizeNewlines(text));
      } catch {
        /* streaming consumer errors must not kill the run */
      }
    });
    child.stderr?.on("data", (buf: Buffer) => {
      stderr += buf.toString("utf8");
    });

    if (opts.stdinInput !== undefined) {
      child.stdin?.write(opts.stdinInput, () => child.stdin?.end());
      child.stdin?.on("error", () => {
        /* EPIPE when process exits early — captured via exit code */
      });
    } else {
      child.stdin?.end();
    }

    child.on("close", (code, signal) => {
      finish({ exitCode: code, signal });
    });
  });
}

const SPAWN_RETRY_CODES = new Set(["ENOENT", "EINVAL", "EACCES", "UNKNOWN"]);

/**
 * Run a command with timeout, cancellation, redaction and Windows fallback.
 * Never throws; failures are reported in the structured result.
 */
export async function runCommand(opts: RunCommandOptions): Promise<CommandResult> {
  const first = await execute(directPlan(opts), opts);
  const code = first.errorMessage?.split(":")[0];
  if (
    first.failedToStart &&
    process.platform === "win32" &&
    code !== undefined &&
    SPAWN_RETRY_CODES.has(code)
  ) {
    const fallback = windowsCmdPlan(opts);
    if ("error" in fallback) {
      return { ...first, errorMessage: `${first.errorMessage}; ${fallback.error}` };
    }
    const second = await execute(fallback, opts);
    if (!second.failedToStart) return second;
    // Keep the original error; it is usually the clearer one (ENOENT).
    return first;
  }
  return first;
}

/** Redacted, truncated diagnostics view of a command result. */
export function resultDiagnostics(result: CommandResult): {
  commandLabel: string;
  argsPreview: string[];
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  stderr: string;
  stdoutPreview: string;
  timedOut: boolean;
} {
  return {
    commandLabel: result.commandLabel,
    argsPreview: result.argsPreview,
    exitCode: result.exitCode,
    signal: result.signal,
    durationMs: result.durationMs,
    stderr: truncateForDiagnostics(redactText(result.stderr)),
    stdoutPreview: truncateForDiagnostics(redactText(result.stdout), 2000),
    timedOut: result.timedOut
  };
}
