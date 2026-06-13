/**
 * Core data model for Agent Room.
 *
 * Everything in this file is plain TypeScript with no dependency on the
 * `vscode` module so it can be exercised directly by unit tests.
 */

import type { OperatingMode } from "./OperatingMode";

export type ProviderKind = "localCli" | "apiResearch" | "copilot" | "human" | "internal";

/** Well-known provider ids plus room for user-defined providers. */
export type ProviderId =
  | "claudeCodeCli"
  | "codexCli"
  | "openAiWebSearch"
  | "copilotNative"
  | "copilotCustomAgent"
  | "copilotAgentSession"
  | "human"
  | "internalConductor"
  | (string & {});

export type VirtualAgentId = string;
export type RoleId = string;
export type WorkflowId = string;

export type ParticipantKind = "user" | "virtualAgent" | "conductor" | "system";

export type ModelTier =
  | "providerDefault"
  | "fast"
  | "balanced"
  | "deepReasoning"
  | "coding"
  | "review"
  | "testing"
  | "research"
  | "userSelected";

export type SafetyMode = "readOnly" | "workspaceWriteWithApproval" | "dangerous";

export type ContextMode =
  | "currentPromptOnly"
  | "transcriptSummary"
  | "lastMessages"
  | "fullTranscriptBudgeted";

export interface RoleDefinition {
  id: RoleId;
  name: string;
  description: string;
  instructions: string;
  isBuiltIn: boolean;
  allowedProviderKinds?: ProviderKind[];
}

export interface ProviderProfile {
  id: ProviderId;
  displayName: string;
  kind: ProviderKind;
  enabled: boolean;
  executable?: string;
  configuration?: Record<string, unknown>;
}

export interface VirtualAgent {
  id: VirtualAgentId;
  displayName: string;
  description: string;
  providerId: ProviderId;
  enabled: boolean;
  assignedRoleIds: RoleId[];
  systemInstructions?: string;
  preferredModelTier?: ModelTier;
}

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  /**
   * The agent chosen for this step must hold at least one of these roles.
   * An empty list means the step is spoken by the Conductor itself.
   */
  anyOfRoleIds: RoleId[];
  preferredAgentId?: VirtualAgentId;
  /** Restrict the step to agents backed by a specific provider (Roundtable). */
  preferredProviderId?: ProviderId;
  instructions: string;
  expectedOutput?: string;
  allowsFileChanges: boolean;
  requiresReviewAfter?: boolean;
  /** Optional steps are skipped (with a system note) when no agent matches. */
  optional: boolean;
  speaker: "agent" | "conductor";
}

export interface WorkflowDefinition {
  id: WorkflowId;
  name: string;
  description: string;
  isBuiltIn: boolean;
  steps: WorkflowStep[];
}

export interface RoomProfile {
  id: string;
  name: string;
  description?: string;
  providers: ProviderProfile[];
  virtualAgents: VirtualAgent[];
  roles: RoleDefinition[];
  workflows: WorkflowDefinition[];
  defaultWorkflowId: WorkflowId;
  extraRoomInstructions?: string;
}

export type MessageStatus =
  | "pending"
  | "running"
  | "streaming"
  | "complete"
  | "error"
  | "cancelled";

export type ReactionKind =
  | "thumbsUp"
  | "thumbsDown"
  | "needsWork"
  | "accepted"
  | "question";

export interface MessageReaction {
  kind: ReactionKind;
  /** Participant id of whoever reacted (currently always the user). */
  by: string;
  at: string;
}

export interface AgentDiagnostics {
  commandLabel?: string;
  argsPreview?: string[];
  exitCode?: number | null;
  signal?: string | null;
  durationMs?: number;
  stderr?: string;
  stdoutPreview?: string;
  rawEvents?: unknown[];
  parsedEvents?: unknown[];
  timedOut?: boolean;
  fallbackUsed?: boolean;
  warnings?: string[];
  error?: string;
}

export interface AgentRoomMessage {
  id: string;
  participantKind: ParticipantKind;
  participantId: string;
  displayName: string;
  providerId?: ProviderId;
  operatingMode?: OperatingMode;
  roleIds: RoleId[];
  roleNames: string[];
  workflowId?: WorkflowId;
  workflowStepId?: string;
  createdAt: string;
  updatedAt?: string;
  status: MessageStatus;
  content: string;
  diagnostics?: AgentDiagnostics;
  reactions?: MessageReaction[];
  replyToMessageId?: string;
  metadata?: Record<string, unknown>;
}

export interface Transcript {
  id: string;
  createdAt: string;
  updatedAt: string;
  workspacePath?: string;
  workspaceName?: string;
  gitBranch?: string;
  operatingMode?: OperatingMode;
  roomProfileSnapshot: RoomProfile;
  workflowId?: WorkflowId;
  messages: AgentRoomMessage[];
  settingsSnapshot: Record<string, unknown>;
}

export type TaskCategory =
  | "quickQuestion"
  | "codeExplanation"
  | "planning"
  | "architecture"
  | "implementation"
  | "debugging"
  | "refactor"
  | "testing"
  | "securityReview"
  | "documentation"
  | "webResearch"
  | "claimVerification"
  | "fullBuildCycle"
  | "adversarialReview";

export interface AdvisorAgentPlanEntry {
  agentId: VirtualAgentId;
  displayName: string;
  providerId: ProviderId;
  roleNames: string[];
  modelTier: ModelTier;
}

export interface ModelAdvisorRecommendation {
  id: string;
  category: TaskCategory;
  workflowId: WorkflowId;
  workflowName: string;
  agentPlan: AdvisorAgentPlanEntry[];
  contextLevel: ContextMode;
  safetyMode: SafetyMode;
  useWebResearch: boolean;
  reasoning: string;
  warnings: string[];
  requiresConfirmation: boolean;
}

/** Model tier -> concrete model name mappings from user settings. */
export interface ModelTierMappings {
  claude: { fast: string; balanced: string; deepReasoning: string; coding: string };
  codex: { fast: string; balanced: string; deepReasoning: string; coding: string };
  openAiWebSearch: { research: string };
}

export interface ModelAdvisorSettings {
  enabled: boolean;
  autoApply: boolean;
  showReasoning: boolean;
  preferLowerCost: boolean;
  preferSpeed: boolean;
  preferQuality: boolean;
  confirmBeforeDeepReasoning: boolean;
}

/** agentRoom.copilotIntegration.* settings (SPEC §15). */
export interface CopilotIntegrationSettings {
  enabled: boolean;
  generateCustomAgents: boolean;
  customAgentsDirectory: string;
  registerChatParticipant: boolean;
  enableDirectAgentSessions: boolean;
  requirePublicApisOnly: boolean;
  neverScrapeCopilotUi: boolean;
}

export interface WebResearchSettings {
  enabled: boolean;
  provider: string;
  model: string;
  apiKeySource: "environment" | "vscodeSecretStorage";
  apiKeyEnvironmentVariable: string;
  maxResults: number;
  requireCitations: boolean;
  onlyWhenRequested: boolean;
  allowedDomains: string[];
  blockedDomains: string[];
  searchFreshness: "auto" | "latest" | "stableDocs";
}

/** Snapshot of all agentRoom.* settings as plain data. */
export interface AgentRoomSettings {
  operatingMode?: OperatingMode;
  invalidConfiguredOperatingMode?: string;
  firstLaunchShowModePicker: boolean;
  workModeEnabled: boolean;
  personalModeEnabled: boolean;
  requireTypedConfirmationOnSwitch: boolean;
  claudeExecutable: string;
  codexExecutable: string;
  defaultWorkflow: string;
  defaultContextMode: ContextMode;
  lastMessagesCount: number;
  maxTranscriptChars: number;
  maxPromptChars: number;
  agentTimeoutSeconds: number;
  healthCheckTimeoutSeconds: number;
  claudePreferStreamJson: boolean;
  claudePreferJson: boolean;
  codexUseJson: boolean;
  codexSandbox: "read-only" | "workspace-write";
  codexApproval: "untrusted" | "on-request" | "never";
  enableDangerousModes: boolean;
  transcriptStorage: "memory" | "workspace" | "global";
  roomProfileStorage: "workspace" | "global";
  showRawAgentEvents: boolean;
  extraRoomInstructions: string;
  includeGitStatusByDefault: boolean;
  includeCurrentFileByDefault: boolean;
  includeSelectionByDefault: boolean;
  loggingLevel: "error" | "info" | "debug" | "trace";
  modelAdvisor: ModelAdvisorSettings;
  models: ModelTierMappings;
  webResearch: WebResearchSettings;
  copilotIntegration: CopilotIntegrationSettings;
}

/** Editor/workspace context captured for a turn. */
export interface RoomContextSnapshot {
  workspacePath?: string;
  workspaceName?: string;
  gitBranch?: string;
  gitStatusSummary?: string;
  currentFilePath?: string;
  currentFileLanguageId?: string;
  currentFileDirty?: boolean;
  selection?: string;
  currentFileContents?: string;
  contextChips: string[];
}

export type ContextChipId = "selection" | "currentFile" | "gitStatus";

export interface AgentActivity {
  agentId: string;
  displayName: string;
  /** e.g. "planning", "coding", "reviewing", "researching", "summarizing" */
  activity: string;
}

export interface PresenceEntry {
  agentId: string;
  displayName: string;
  providerId: ProviderId;
  state:
    | "available"
    | "running"
    | "waiting"
    | "error"
    | "missingCli"
    | "disabled"
    | "needsConfiguration";
  detail?: string;
}

let counter = 0;

/** Sortable, collision-resistant id without external dependencies. */
export function newId(prefix: string): string {
  counter = (counter + 1) % 10000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${rand}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
