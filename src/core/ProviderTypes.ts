/**
 * Provider abstraction. A provider is a backend that can run a turn
 * (Claude Code CLI, Codex CLI, OpenAI Web Search, the human user, or
 * the internal Conductor). Virtual team members reference providers by id.
 */

import {
  AgentDiagnostics,
  ModelTier,
  ProviderId,
  ProviderKind,
  SafetyMode,
  VirtualAgentId
} from "./Types";

/** Capabilities detected from non-invasive `--help` probing. */
export interface ProviderCapabilities {
  /** Claude: `-p` / `--print` non-interactive mode detected. */
  print?: boolean;
  /** Claude: `--output-format` flag detected. */
  outputFormat?: boolean;
  /** Claude: `stream-json` output format mentioned. */
  streamJson?: boolean;
  /** Claude: `json` output format mentioned. */
  json?: boolean;
  /** Codex: `exec` subcommand detected. */
  exec?: boolean;
  /** Codex: `--cd` flag detected. */
  cd?: boolean;
  /** Codex: `--sandbox` flag detected. */
  sandbox?: boolean;
  /** Codex: `--ask-for-approval` flag detected. */
  askForApproval?: boolean;
  /** Codex: `--json` (JSONL event stream) detected. */
  jsonl?: boolean;
  /** Prompt can be passed on stdin (`-` or documented stdin support). */
  stdinPrompt?: boolean;
  /** `--model` / `-m` flag detected. */
  model?: boolean;
}

export interface ProviderHealth {
  providerId: ProviderId;
  /** Executable found and runnable. */
  available: boolean;
  /** Provider has the configuration it needs (e.g. API key for web research). */
  configured: boolean;
  /** Best-effort guess: CLI did not print obvious login/setup errors. */
  authenticatedLikely: boolean;
  executable?: string;
  versionText?: string;
  helpText?: string;
  capabilities: ProviderCapabilities;
  warnings: string[];
  error?: string;
  checkedAt: string;
}

export interface ProviderInvocation {
  providerId: ProviderId;
  virtualAgentId: VirtualAgentId;
  prompt: string;
  workspaceRoot?: string;
  safetyMode: SafetyMode;
  modelTier: ModelTier;
  /** Resolved from the user's tier mappings; undefined = provider default. */
  concreteModelName?: string;
  timeoutMs: number;
  context?: Record<string, unknown>;
  abortSignal?: AbortSignal;
  /** Optional streaming hook; providers call it with accumulated text. */
  onPartialText?: (textSoFar: string) => void;
}

export type ProviderRunStatus = "complete" | "error" | "cancelled" | "timeout";

export interface ProviderResult {
  providerId: ProviderId;
  virtualAgentId: VirtualAgentId;
  status: ProviderRunStatus;
  finalText: string;
  diagnostics: AgentDiagnostics;
  durationMs: number;
  fallbackUsed: boolean;
  warnings: string[];
}

export interface Provider {
  id: ProviderId;
  displayName: string;
  kind: ProviderKind;
  enabled: boolean;
  healthCheck(): Promise<ProviderHealth>;
  runTurn(invocation: ProviderInvocation): Promise<ProviderResult>;
}

export function emptyHealth(providerId: ProviderId): ProviderHealth {
  return {
    providerId,
    available: false,
    configured: false,
    authenticatedLikely: false,
    capabilities: {},
    warnings: [],
    checkedAt: new Date().toISOString()
  };
}
