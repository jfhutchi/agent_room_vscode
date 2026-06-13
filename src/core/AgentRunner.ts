import { buildPrompt } from "./PromptBuilder";
import { ProviderRegistry } from "./ProviderRegistry";
import { EffortLevel, ProviderProfile, RoleDefinition, SafetyMode, VirtualAgent } from "./Types";
import { AgentRoomMessage, RoomContextSnapshot } from "./Types";
import type { OperatingMode } from "./OperatingMode";

export interface AgentRunnerInput {
  providerRegistry: ProviderRegistry;
  agent: VirtualAgent;
  provider: ProviderProfile;
  roles: RoleDefinition[];
  participants: { displayName: string; providerName: string; roleNames: string[] }[];
  transcript: AgentRoomMessage[];
  latestUserMessage: string;
  context: RoomContextSnapshot;
  workflowName: string;
  stepName?: string;
  stepInstructions?: string;
  expectedOutput?: string;
  safetyMode: SafetyMode;
  safetyInstruction: string;
  operatingMode?: OperatingMode;
  effortLevel?: EffortLevel;
  /** Resolved from the user's tier mappings; undefined = provider default. */
  concreteModelName?: string;
  providerWarnings?: string[];
  timeoutMs: number;
  maxPromptChars: number;
  abortSignal?: AbortSignal;
}

export async function runAgentTurn(input: AgentRunnerInput) {
  const built = buildPrompt({
    agent: input.agent,
    provider: input.provider,
    roles: input.roles,
    participants: input.participants,
    workflowName: input.workflowName,
    stepName: input.stepName,
    stepInstructions: input.stepInstructions,
    expectedOutput: input.expectedOutput,
    safetyMode: input.safetyMode,
    safetyInstruction: input.safetyInstruction,
    modelTier: input.agent.preferredModelTier ?? "providerDefault",
    operatingMode: input.operatingMode,
    effortLevel: input.effortLevel,
    providerWarnings: input.providerWarnings,
    contextChips: input.context.contextChips,
    transcript: input.transcript,
    latestUserMessage: input.latestUserMessage,
    workspace: {
      path: input.context.workspacePath,
      name: input.context.workspaceName,
      gitBranch: input.context.gitBranch,
      gitStatusSummary: input.context.gitStatusSummary
    },
    currentFile: {
      path: input.context.currentFilePath,
      languageId: input.context.currentFileLanguageId,
      selection: input.context.selection,
      contents: input.context.currentFileContents
    },
    maxPromptChars: input.maxPromptChars
  });

  return input.providerRegistry.runTurn({
    providerId: input.provider.id,
    virtualAgentId: input.agent.id,
    operatingMode: input.operatingMode,
    prompt: built.prompt,
    workspaceRoot: input.context.workspacePath,
    safetyMode: input.safetyMode,
    modelTier: input.agent.preferredModelTier ?? "providerDefault",
    effortLevel: input.effortLevel,
    concreteModelName: input.concreteModelName,
    timeoutMs: input.timeoutMs,
    abortSignal: input.abortSignal,
    context: { truncationNotes: built.truncationNotes }
  });
}
