/**
 * Conservative safety posture for everything Agent Room runs.
 *
 * The extension never parses agent output and executes commands itself; the
 * only processes launched are the provider CLIs, git probes, and health
 * checks. This module decides which provider flags and instructions are
 * permitted for a given safety mode.
 */

import { ProviderId, SafetyMode } from "./Types";
import {
  isProviderValidForMode,
  modeName,
  separationGuardMessage,
  type OperatingMode
} from "./OperatingMode";

/** Flags that are never passed to a CLI unless dangerous mode is fully armed. */
export const DANGEROUS_FLAG_PATTERNS: RegExp[] = [
  /--dangerously-skip-permissions/i,
  /--dangerously-bypass-approvals-and-sandbox/i,
  /--yolo/i,
  /--full-auto/i,
  /bypass.?approvals/i,
  /bypass.?sandbox/i
];

/**
 * Integration techniques Agent Room never uses, in any mode, under any
 * setting (SPEC §17). There is intentionally no flag, mode, or confirmation
 * that unblocks these.
 */
export const FORBIDDEN_INTEGRATION_TECHNIQUES = [
  "copilotChatScraping",
  "copilotUiAutomation",
  "privateVsCodeApi",
  "terminalScreenScraping",
  "orgPolicyBypass",
  "chatGptUiAutomation"
] as const;

export type ForbiddenIntegrationTechnique = (typeof FORBIDDEN_INTEGRATION_TECHNIQUES)[number];

export interface SafetyDecision {
  allowed: boolean;
  reason?: string;
}

export interface SafetyContext {
  enableDangerousModes: boolean;
  /** True only when the user picked dangerous mode in the UI this session. */
  dangerousModeSelected: boolean;
  /** True only after the user confirmed the modal warning. */
  dangerousModeConfirmed: boolean;
}

export class SafetyPolicy {
  constructor(private readonly ctx: SafetyContext) {}

  /** Effective mode: dangerous is downgraded unless every gate is open. */
  effectiveMode(requested: SafetyMode): SafetyMode {
    if (requested !== "dangerous") return requested;
    if (
      this.ctx.enableDangerousModes &&
      this.ctx.dangerousModeSelected &&
      this.ctx.dangerousModeConfirmed
    ) {
      return "dangerous";
    }
    return "workspaceWriteWithApproval";
  }

  /**
   * Cross-partition fallback block (SPEC §3.4, §17). A provider on the other
   * side of the Work/Personal partition is never a permitted fallback; no
   * safety context, setting, or confirmation can open this gate.
   */
  checkProviderForMode(providerId: ProviderId, operatingMode: OperatingMode): SafetyDecision {
    if (isProviderValidForMode(providerId, operatingMode)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason:
        `Provider ${providerId} is blocked in ${modeName(operatingMode)}. ` +
        separationGuardMessage(operatingMode)
    };
  }

  /**
   * Forbidden integration techniques (SPEC §17) are blocked unconditionally:
   * no Copilot Chat scraping, no Copilot/ChatGPT UI automation, no private
   * VS Code APIs, no terminal screen-scraping, no org-policy bypass.
   */
  checkIntegrationTechnique(technique: string): SafetyDecision {
    if ((FORBIDDEN_INTEGRATION_TECHNIQUES as readonly string[]).includes(technique)) {
      return {
        allowed: false,
        reason: `Integration technique "${technique}" is forbidden in every mode and cannot be enabled.`
      };
    }
    return { allowed: true };
  }

  /** Validate a CLI argument list against the dangerous-flag blocklist. */
  checkArgs(args: string[], mode: SafetyMode): SafetyDecision {
    const effective = this.effectiveMode(mode);
    for (const arg of args) {
      if (DANGEROUS_FLAG_PATTERNS.some((p) => p.test(arg))) {
        if (effective !== "dangerous") {
          return {
            allowed: false,
            reason:
              `Blocked dangerous flag "${arg}". Enable agentRoom.enableDangerousModes, ` +
              "select dangerous mode explicitly, and confirm the warning to use it."
          };
        }
      }
    }
    return { allowed: true };
  }

  /** Codex sandbox value for a safety mode. */
  codexSandboxFor(mode: SafetyMode, configured: "read-only" | "workspace-write"): string {
    switch (this.effectiveMode(mode)) {
      case "readOnly":
        return "read-only";
      case "dangerous":
      case "workspaceWriteWithApproval":
        return configured;
    }
  }

  /** Role-level instruction injected into every prompt for the mode. */
  instructionFor(mode: SafetyMode): string {
    switch (this.effectiveMode(mode)) {
      case "readOnly":
        return (
          "Safety mode is READ-ONLY: review and explain only. Do not modify, create, or " +
          "delete any files. Do not run commands that change state."
        );
      case "workspaceWriteWithApproval":
        return (
          "Safety mode is WORKSPACE-WRITE WITH APPROVAL: you may edit files inside this " +
          "workspace when the task requires it. Avoid destructive changes, ask before " +
          "deleting anything significant, and list every file you changed."
        );
      case "dangerous":
        return (
          "Safety mode is DANGEROUS (explicitly enabled by the user for this run). Still " +
          "avoid irreversible damage and list every file you changed."
        );
    }
  }

  /**
   * Pre-flight check for workflows that include file-changing steps.
   * Returns human-readable warnings (not hard blocks, except read-only).
   */
  checkWorkflowFileChanges(input: {
    mode: SafetyMode;
    hasCoder: boolean;
    hasReviewer: boolean;
    hasTester: boolean;
  }): { blocked: boolean; warnings: string[] } {
    const warnings: string[] = [];
    const effective = this.effectiveMode(input.mode);
    if (effective === "readOnly") {
      return {
        blocked: true,
        warnings: [
          "This workflow includes file-changing steps, but safety mode is read-only. " +
            "Switch to workspace-write to allow implementation steps."
        ]
      };
    }
    if (!input.hasCoder) {
      warnings.push("No team member holds the Coder role, so file changes cannot be assigned.");
    }
    if (!input.hasReviewer) {
      warnings.push("No Reviewer is assigned — changes will not get a review pass.");
    }
    if (!input.hasTester) {
      warnings.push("No Tester is assigned — test coverage will not be checked.");
    }
    return { blocked: false, warnings };
  }
}

export function defaultSafetyMode(): SafetyMode {
  return "workspaceWriteWithApproval";
}
