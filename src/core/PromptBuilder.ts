/**
 * Builds the role-aware, team-aware, workflow-aware prompt envelope that
 * every provider turn receives, and enforces the prompt character budget.
 *
 * Truncation priority (highest kept first):
 *   1. latest user message
 *   2. role instructions
 *   3. workflow step instruction
 *   4. current selection
 *   5. recent transcript (older messages dropped first)
 *   6. current file contents (dropped entirely if needed)
 */

import {
  AgentRoomMessage,
  EffortLevel,
  ModelTier,
  ProviderProfile,
  RoleDefinition,
  SafetyMode,
  VirtualAgent
} from "./Types";
import { modeName, type OperatingMode } from "./OperatingMode";

export interface PromptParticipantSummary {
  displayName: string;
  providerName: string;
  roleNames: string[];
}

export interface PromptBuildInput {
  agent: VirtualAgent;
  provider: ProviderProfile;
  roles: RoleDefinition[];
  participants: PromptParticipantSummary[];
  workflowName: string;
  stepName?: string;
  stepInstructions?: string;
  expectedOutput?: string;
  safetyMode: SafetyMode;
  safetyInstruction: string;
  modelTier: ModelTier;
  /** Operating mode of the room (SPEC §11: every turn states it). */
  operatingMode?: OperatingMode;
  /** Advisory effort level (SPEC §6): prompt text where no real control exists. */
  effortLevel?: EffortLevel;
  /** Provider/mode warnings surfaced to the agent (SPEC §11). */
  providerWarnings?: string[];
  contextChips: string[];
  /** Oldest -> newest; must NOT include the latest user message. */
  transcript: AgentRoomMessage[];
  latestUserMessage: string;
  replyTo?: { displayName: string; roleNames: string[]; content: string };
  workspace: {
    path?: string;
    name?: string;
    gitBranch?: string;
    gitStatusSummary?: string;
  };
  currentFile?: {
    path?: string;
    languageId?: string;
    selection?: string;
    contents?: string;
  };
  extraRoomInstructions?: string;
  maxPromptChars: number;
}

export interface BuiltPrompt {
  prompt: string;
  truncated: boolean;
  /** Sections dropped or shortened, for diagnostics. */
  truncationNotes: string[];
}

const TRUNCATION_NOTE = "[Context truncated by Agent Room to fit configured prompt budget.]";

const EFFORT_ADVISORY: Record<EffortLevel, string> = {
  low: "Effort level is LOW: prefer a quick, concise answer over exhaustive analysis.",
  medium: "Effort level is MEDIUM: balance thoroughness with brevity.",
  high: "Effort level is HIGH: think carefully, be thorough, and double-check your conclusions.",
  max: "Effort level is MAX: apply maximum care and rigor; do not cut corners."
};

const RULES = `Rules:
- Be honest about what you can and cannot see.
- Do not pretend you directly communicated with another agent outside the transcript provided.
- Do not claim another agent said something unless it appears in the transcript.
- Do not claim files were changed unless you actually changed files.
- If you changed files, list exact files changed.
- If you only reviewed, say you only reviewed.
- Follow all assigned roles.
- If roles conflict, prioritize safety, correctness, and the latest user request.
- Do not perform destructive actions unless explicitly requested and permitted by safety mode.
- Do not expose secrets.
- Do not print environment variables.
- Keep output readable for a professional shared chat transcript.`;

function or(value: string | undefined, fallback = "unavailable"): string {
  return value && value.trim() ? value : fallback;
}

function transcriptEntry(m: AgentRoomMessage): string {
  const roles = m.roleNames.length ? ` (${m.roleNames.join(", ")})` : "";
  return `${m.displayName}${roles}:\n${m.content}`;
}

export function buildPrompt(input: PromptBuildInput): BuiltPrompt {
  const truncationNotes: string[] = [];

  const participantLines = input.participants
    .map((p) => `- ${p.displayName} — ${p.providerName} — ${p.roleNames.join(", ") || "no roles"}`)
    .join("\n");

  const roleInstructionBlock = input.roles
    .map((r) => `${r.name}:\n${r.instructions}`)
    .join("\n\n");

  const header = [
    "You are participating in a shared VS Code Agent Room.",
    ...(input.operatingMode
      ? [
          `Operating mode: ${modeName(input.operatingMode)}` +
            (input.operatingMode === "workCopilotNative"
              ? " — company-approved Copilot capabilities only; local personal CLI providers do not exist here."
              : " — local Claude Code / Codex CLI logins; no GitHub Copilot dependency.")
        ]
      : []),
    "",
    "Participants:",
    participantLines,
    "",
    `You are: ${input.agent.displayName}`,
    `Your backend provider: ${input.provider.displayName}`,
    "",
    `Your assigned roles for this turn: ${
      input.roles.map((r) => r.name).join(", ") || "none"
    }`,
    "",
    "Role instructions:",
    roleInstructionBlock || "none",
    ...(input.agent.systemInstructions
      ? ["", "Team member instructions:", input.agent.systemInstructions]
      : [])
  ].join("\n");

  const workspaceBlock = [
    "Workspace:",
    `- Path: ${or(input.workspace.path)}`,
    `- Name: ${or(input.workspace.name)}`,
    `- Git branch: ${or(input.workspace.gitBranch)}`,
    `- Git status summary: ${or(input.workspace.gitStatusSummary)}`
  ].join("\n");

  const workflowBlock = [
    `Current workflow:\n${input.workflowName}`,
    "",
    `Current workflow step:\n${
      input.stepName ? `${input.stepName} — ${or(input.stepInstructions, "")}` : "none"
    }`
  ].join("\n");

  const modeBlock = [
    `Safety mode:\n${input.safetyMode}`,
    input.safetyInstruction,
    "",
    `Model tier:\n${input.modelTier === "providerDefault" ? "provider default" : input.modelTier}`,
    ...(input.effortLevel ? ["", EFFORT_ADVISORY[input.effortLevel]] : []),
    ...(input.providerWarnings?.length
      ? ["", "Warnings:", ...input.providerWarnings.map((warning) => `- ${warning}`)]
      : []),
    "",
    `Active context:\n${input.contextChips.length ? input.contextChips.join(", ") : "none"}`
  ].join("\n");

  const replyBlock = input.replyTo
    ? [
        `The user is replying specifically to this message from ${input.replyTo.displayName}` +
          (input.replyTo.roleNames.length ? ` (${input.replyTo.roleNames.join(", ")})` : "") +
          ":",
        input.replyTo.content
      ].join("\n")
    : "";

  const extraBlock = `Extra room instructions:\n${or(input.extraRoomInstructions, "none")}`;

  const latestBlock = `Latest user message:\n${input.latestUserMessage}`;

  const expectedBlock = `Expected output:\n${or(
    input.expectedOutput,
    "A clear, professional response appropriate to your roles."
  )}`;

  const fileHeader = [
    `Current file:\n${or(input.currentFile?.path, "none")}`,
    "",
    `Current selection:\n${or(input.currentFile?.selection, "none")}`
  ].join("\n");

  // --- Assemble with budget -------------------------------------------------
  const fixedSections = [
    header,
    workspaceBlock,
    workflowBlock,
    modeBlock,
    ...(replyBlock ? [replyBlock] : []),
    fileHeader,
    extraBlock,
    RULES,
    latestBlock,
    expectedBlock
  ];
  const SEP = "\n\n";
  const fixedLength = fixedSections.reduce((n, s) => n + s.length + SEP.length, 0);

  let budget = input.maxPromptChars - fixedLength;

  // Current file contents: lowest priority — include only if it fits in half
  // the remaining budget.
  let fileContentsBlock = "";
  if (input.currentFile?.contents) {
    const block = `Current file contents:\n${input.currentFile.contents}`;
    if (block.length + SEP.length <= budget / 2) {
      fileContentsBlock = block;
      budget -= block.length + SEP.length;
    } else {
      truncationNotes.push("current file contents omitted (prompt budget)");
    }
  }

  // Transcript: include newest-first until the budget runs out.
  const included: string[] = [];
  let transcriptTruncated = false;
  let used = 0;
  for (let i = input.transcript.length - 1; i >= 0; i--) {
    const entry = transcriptEntry(input.transcript[i]);
    if (used + entry.length + 2 > budget) {
      transcriptTruncated = true;
      break;
    }
    included.unshift(entry);
    used += entry.length + 2;
  }
  if (transcriptTruncated) {
    truncationNotes.push("older transcript messages dropped (prompt budget)");
  }
  const transcriptBlock = [
    "Conversation so far:",
    transcriptTruncated ? TRUNCATION_NOTE : "",
    included.length ? included.join("\n\n") : "(no prior messages)"
  ]
    .filter((s) => s !== "")
    .join("\n");

  const prompt = [
    header,
    workspaceBlock,
    workflowBlock,
    modeBlock,
    transcriptBlock,
    ...(replyBlock ? [replyBlock] : []),
    fileHeader,
    ...(fileContentsBlock ? [fileContentsBlock] : []),
    extraBlock,
    RULES,
    latestBlock,
    expectedBlock
  ].join(SEP);

  // Final hard clamp: never exceed the configured budget even if the fixed
  // sections alone are oversized. The latest user message lives at the end,
  // so we trim from the middle (transcript) which is already minimized, then
  // as a last resort keep head+tail.
  if (prompt.length > input.maxPromptChars) {
    truncationNotes.push("hard clamp applied");
    const keepTail = Math.min(
      prompt.length,
      latestBlock.length + expectedBlock.length + RULES.length + 6
    );
    const keepHead = Math.max(0, input.maxPromptChars - keepTail - TRUNCATION_NOTE.length - 4);
    const clamped =
      prompt.slice(0, keepHead) + "\n" + TRUNCATION_NOTE + "\n" + prompt.slice(prompt.length - keepTail);
    return { prompt: clamped, truncated: true, truncationNotes };
  }

  return { prompt, truncated: truncationNotes.length > 0, truncationNotes };
}
