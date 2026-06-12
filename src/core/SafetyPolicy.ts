/**
 * Conservative safety posture for everything Agent Room runs.
 *
 * The extension never parses agent output and executes commands itself; the
 * only processes launched are the provider CLIs, git probes, and health
 * checks. This module decides which provider flags and instructions are
 * permitted for a given safety mode.
 */

import { SafetyMode } from "./Types";

/** Flags that are never passed to a CLI unless dangerous mode is fully armed. */
export const DANGEROUS_FLAG_PATTERNS: RegExp[] = [
  /--dangerously-skip-permissions/i,
  /--dangerously-bypass-approvals-and-sandbox/i,
  /--yolo/i,
  /--full-auto/i,
  /bypass.?approvals/i,
  /bypass.?sandbox/i
];

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
