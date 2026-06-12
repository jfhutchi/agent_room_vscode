import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import { AgentRoomPanel } from "../webview/AgentRoomPanel";
import { WebviewToExtensionMessage } from "../utils/validation";
import { Logger } from "../utils/logging";
import { getAgentRoomSettings } from "./Config";
import { ClaudeCodeProvider } from "./ClaudeCodeProvider";
import { CodexCliProvider } from "./CodexCliProvider";
import { Conductor } from "./Conductor";
import { OpenAiWebSearchProvider } from "./OpenAiWebSearchProvider";
import { ProviderRegistry } from "./ProviderRegistry";
import { RoleRegistry } from "./RoleRegistry";
import { createDefaultRoomProfile, RoomProfileStore } from "./RoomProfileStore";
import { SafetyPolicy } from "./SafetyPolicy";
import { TranscriptStore, messageStatusFromProvider } from "./TranscriptStore";
import {
  AgentRoomMessage,
  AgentRoomSettings,
  ContextChipId,
  RoleDefinition,
  RoomContextSnapshot,
  RoomProfile,
  SafetyMode,
  VirtualAgent,
} from "./Types";
import { VirtualTeamRegistry } from "./VirtualTeamRegistry";
import { WorkflowRegistry } from "./WorkflowRegistry";
import { ModelAdvisor } from "./ModelAdvisor";
import { WorkflowRunner } from "./WorkflowRunner";
import { collectWorkspaceContext } from "./WorkspaceContext";
import { runAgentTurn } from "./AgentRunner";
import { checkProviderHealth } from "./HealthCheck";

export class AgentRoomController {
  private panel: AgentRoomPanel | undefined;
  private settings: AgentRoomSettings;
  private profile: RoomProfile = createDefaultRoomProfile();
  private profileStore: RoomProfileStore;
  private transcriptStore: TranscriptStore;
  private providerRegistry: ProviderRegistry;
  private health: Record<string, unknown> = {};
  private abortController: AbortController | undefined;
  private selectedWorkflowId = "manual";
  private safetyMode: SafetyMode = "workspaceWriteWithApproval";
  private contextChips: Record<ContextChipId, boolean> = {
    selection: true,
    currentFile: false,
    gitStatus: true
  };

  private constructor(
    private readonly context: vscode.ExtensionContext,
    output: vscode.OutputChannel
  ) {
    this.settings = getAgentRoomSettings();
    this.selectedWorkflowId = this.settings.defaultWorkflow;
    this.contextChips = {
      selection: this.settings.includeSelectionByDefault,
      currentFile: this.settings.includeCurrentFileByDefault,
      gitStatus: this.settings.includeGitStatusByDefault
    };
    const logger = new Logger(output);
    logger.setLevel(this.settings.loggingLevel);
    this.profileStore = this.createProfileStore();
    this.transcriptStore = this.createTranscriptStore();
    this.providerRegistry = this.createProviderRegistry();
  }

  static async create(
    context: vscode.ExtensionContext,
    output: vscode.OutputChannel
  ): Promise<AgentRoomController> {
    const controller = new AgentRoomController(context, output);
    controller.profile = await controller.profileStore.load();
    controller.applySettingsToProfile();
    return controller;
  }

  dispose(): void {
    this.abortController?.abort();
    this.panel?.dispose();
  }

  async open(): Promise<void> {
    if (!this.panel) {
      this.panel = new AgentRoomPanel(this.context.extensionUri, (message) =>
        this.handleWebviewMessage(message)
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    } else {
      this.panel.reveal();
    }
    await this.ensureTranscript();
    await this.hydrate();
  }

  async openRoomSetup(): Promise<void> {
    await this.open();
    await this.panel?.post({ type: "settingsUpdated", openSetup: true });
  }

  async checkCliHealth(): Promise<void> {
    await this.open();
    this.health = await checkProviderHealth(this.providerRegistry);
    await this.panel?.post({ type: "healthUpdated", health: this.health });
  }

  async resetRoleAssignments(): Promise<void> {
    this.profile = createDefaultRoomProfile();
    this.applySettingsToProfile();
    await this.profileStore.save(this.profile);
    await this.hydrate();
  }

  async exportRoomProfile(): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: this.workspaceUri("agent-room-profile.json"),
      filters: { JSON: ["json"] }
    });
    if (!uri) return;
    await fs.writeFile(uri.fsPath, JSON.stringify(this.profile, null, 2), "utf8");
  }

  async importRoomProfile(): Promise<void> {
    const files = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { JSON: ["json"] }
    });
    const file = files?.[0];
    if (!file) return;
    const text = await fs.readFile(file.fsPath, "utf8");
    this.profile = this.profileStore.parseImported(text);
    this.applySettingsToProfile();
    await this.profileStore.save(this.profile);
    await this.hydrate();
  }

  async sendCurrentSelectionToAgent(agentId: string): Promise<void> {
    await this.open();
    const text = this.selectedTextOrActiveFilePrompt();
    await this.sendToAgent(agentId, await text);
  }

  async sendCurrentSelectionToRole(roleId: string): Promise<void> {
    await this.open();
    const team = new VirtualTeamRegistry(this.profile.virtualAgents);
    const agent = team.agentsWithAnyRole([roleId])[0];
    if (!agent) {
      await this.addConductorMessage(`No enabled team member currently has role: ${roleId}.`, "error");
      return;
    }
    await this.sendToAgent(agent.id, await this.selectedTextOrActiveFilePrompt());
  }

  async runWorkflowOnCurrentFile(workflowId: string): Promise<void> {
    await this.open();
    await this.runWorkflow(workflowId, await this.selectedTextOrActiveFilePrompt());
  }

  async exportTranscript(format: "markdown" | "json"): Promise<void> {
    const transcript = this.transcriptStore.current();
    if (!transcript) return;
    const extension = format === "markdown" ? "md" : "json";
    const uri = await vscode.window.showSaveDialog({
      defaultUri: this.workspaceUri(`agent-room-transcript.${extension}`),
      filters: format === "markdown" ? { Markdown: ["md"] } : { JSON: ["json"] }
    });
    if (!uri) return;
    const body =
      format === "markdown"
        ? this.transcriptStore.exportMarkdown(transcript.id)
        : this.transcriptStore.exportJson(transcript.id);
    await fs.writeFile(uri.fsPath, body, "utf8");
    await this.panel?.post({ type: "exportComplete", path: uri.fsPath });
  }

  async clearTranscript(): Promise<void> {
    await this.transcriptStore.clearCurrent();
    await this.hydrate();
  }

  private async handleWebviewMessage(message: WebviewToExtensionMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        await this.hydrate();
        return;
      case "sendMessage":
        await this.handleUserMessage(message.text, message.replyToMessageId);
        return;
      case "sendToVirtualAgent":
        await this.sendToAgent(message.agentId, message.text, message.replyToMessageId);
        return;
      case "sendToRole":
        await this.sendCurrentSelectionToRole(message.roleId);
        return;
      case "runWorkflow":
        await this.runWorkflow(message.workflowId, message.text);
        return;
      case "stop":
        this.abortController?.abort();
        await this.panel?.post({ type: "runningStateChanged", running: false });
        return;
      case "clearTranscript":
        await this.clearTranscript();
        return;
      case "exportTranscript":
        await this.exportTranscript(message.format);
        return;
      case "checkHealth":
        await this.checkCliHealth();
        return;
      case "updateUiState":
        this.updateUiState(message.state);
        return;
      case "toggleContextChip":
        this.contextChips[message.chip] = message.enabled;
        return;
      case "updateRoleAssignment":
        await this.updateRoleAssignment(message.agentId, message.roleId, message.assigned);
        return;
      case "saveRoomProfile":
        await this.profileStore.save(this.profile);
        return;
      case "restoreDefaultProfile":
        await this.resetRoleAssignments();
        return;
      case "exportRoomProfile":
        await this.exportRoomProfile();
        return;
      case "importRoomProfile":
        await this.importRoomProfile();
        return;
      case "createCustomRole":
        await this.createCustomRole(message.name, message.description, message.instructions);
        return;
      case "updateCustomRole":
        await this.updateCustomRole(message.roleId, message);
        return;
      case "deleteCustomRole":
        await this.deleteCustomRole(message.roleId);
        return;
      case "applyModelAdvisorRecommendation":
      case "ignoreModelAdvisorRecommendation":
        return;
    }
  }

  private async handleUserMessage(text: string, replyToMessageId?: string): Promise<void> {
    await this.ensureTranscript();
    await this.appendUserMessage(text, replyToMessageId);
    if (this.settings.modelAdvisor.enabled) {
      const advisor = this.createAdvisor();
      const recommendation = advisor.recommend(text);
      await this.addConductorMessage(new Conductor().recommendationText(recommendation));
      await this.panel?.post({ type: "modelAdvisorRecommendation", recommendation });
      if (this.settings.modelAdvisor.autoApply && !recommendation.requiresConfirmation) {
        await this.runWorkflow(recommendation.workflowId, text, false);
      }
    }
    await this.hydrate();
  }

  private async sendToAgent(agentId: string, text: string, replyToMessageId?: string): Promise<void> {
    await this.ensureTranscript();
    await this.appendUserMessage(text, replyToMessageId);
    const team = new VirtualTeamRegistry(this.profile.virtualAgents);
    const agent = team.get(agentId);
    if (!agent) {
      await this.addConductorMessage(`Team member not found: ${agentId}.`, "error");
      return;
    }
    await this.runAgent(agent, text, { workflowName: "Manual" });
    await this.hydrate();
  }

  private async runWorkflow(workflowId: string, text: string, appendUser = true): Promise<void> {
    await this.ensureTranscript();
    if (appendUser) await this.appendUserMessage(text);
    const runner = this.createWorkflowRunner();
    const validation = runner.validateWorkflow(workflowId, this.safetyMode);
    if (validation.blocked) {
      await this.addConductorMessage(validation.errors.join("\n"), "error");
      await this.hydrate();
      return;
    }
    if (validation.warnings.length) {
      await this.addConductorMessage(validation.warnings.join("\n"));
    }

    for (const planned of validation.plan.steps) {
      if (this.abortController?.signal.aborted) break;
      if (planned.step.speaker === "conductor") {
        await this.addConductorMessage(new Conductor().summarize(this.currentMessages()), "complete", workflowId, planned.step.id);
        continue;
      }
      if (!planned.agent) {
        if (!planned.step.optional) {
          await this.addConductorMessage(`No agent matched step: ${planned.step.name}.`, "error", workflowId, planned.step.id);
        }
        continue;
      }
      await this.runAgent(planned.agent, text, {
        workflowId,
        workflowName: validation.plan.workflow.name,
        stepId: planned.step.id,
        stepName: planned.step.name,
        stepInstructions: planned.step.instructions,
        expectedOutput: planned.step.expectedOutput
      });
    }
    await this.hydrate();
  }

  private async runAgent(
    agent: VirtualAgent,
    text: string,
    options: {
      workflowId?: string;
      workflowName: string;
      stepId?: string;
      stepName?: string;
      stepInstructions?: string;
      expectedOutput?: string;
    }
  ): Promise<void> {
    const transcript = await this.ensureTranscript();
    const provider = this.profile.providers.find((entry) => entry.id === agent.providerId);
    if (!provider || provider.kind === "human" || provider.kind === "internal") {
      await this.addConductorMessage(`${agent.displayName} is not backed by a runnable provider.`, "error");
      return;
    }
    const roles = this.rolesForAgent(agent);
    const pending = await this.transcriptStore.appendMessage(transcript.id, {
      participantKind: "virtualAgent",
      participantId: agent.id,
      displayName: agent.displayName,
      providerId: agent.providerId,
      roleIds: roles.map((role) => role.id),
      roleNames: roles.map((role) => role.name),
      workflowId: options.workflowId,
      workflowStepId: options.stepId,
      status: "running",
      content: ""
    });
    await this.hydrate();

    this.abortController = new AbortController();
    await this.panel?.post({ type: "runningStateChanged", running: true });
    const safety = new SafetyPolicy({
      enableDangerousModes: this.settings.enableDangerousModes,
      dangerousModeSelected: this.safetyMode === "dangerous",
      dangerousModeConfirmed: false
    });

    try {
      const result = await runAgentTurn({
        providerRegistry: this.providerRegistry,
        agent,
        provider,
        roles,
        participants: this.participants(),
        transcript: this.currentMessages().filter((message) => message.id !== pending.id),
        latestUserMessage: text,
        context: await this.collectContext(),
        workflowName: options.workflowName,
        stepName: options.stepName,
        stepInstructions: options.stepInstructions,
        expectedOutput: options.expectedOutput,
        safetyMode: this.safetyMode,
        safetyInstruction: safety.instructionFor(this.safetyMode),
        timeoutMs: this.settings.agentTimeoutSeconds * 1000,
        maxPromptChars: this.settings.maxPromptChars,
        abortSignal: this.abortController.signal
      });
      await this.transcriptStore.updateMessage(transcript.id, pending.id, {
        status: messageStatusFromProvider(result.status),
        content: result.finalText,
        diagnostics: result.diagnostics
      });
    } catch (error) {
      await this.transcriptStore.updateMessage(transcript.id, pending.id, {
        status: "error",
        content: error instanceof Error ? error.message : String(error)
      });
    } finally {
      this.abortController = undefined;
      await this.panel?.post({ type: "runningStateChanged", running: false });
    }
  }

  private async ensureTranscript() {
    const current = this.transcriptStore.current();
    if (current) return current;
    const context = await this.collectContext();
    return this.transcriptStore.create({
      workspacePath: context.workspacePath,
      workspaceName: context.workspaceName,
      gitBranch: context.gitBranch,
      roomProfileSnapshot: this.profile,
      workflowId: this.selectedWorkflowId,
      settingsSnapshot: this.settings as unknown as Record<string, unknown>
    });
  }

  private async appendUserMessage(text: string, replyToMessageId?: string): Promise<AgentRoomMessage> {
    const transcript = await this.ensureTranscript();
    return this.transcriptStore.appendMessage(transcript.id, {
      participantKind: "user",
      participantId: "user",
      displayName: "User",
      providerId: "human",
      roleIds: ["productOwner", "finalApprover"],
      roleNames: ["Product Owner", "Final Approver"],
      status: "complete",
      content: text,
      replyToMessageId
    });
  }

  private async addConductorMessage(
    text: string,
    status: "complete" | "error" = "complete",
    workflowId?: string,
    workflowStepId?: string
  ): Promise<void> {
    const transcript = await this.ensureTranscript();
    await this.transcriptStore.appendMessage(transcript.id, {
      participantKind: "conductor",
      participantId: "conductor",
      displayName: "Conductor",
      providerId: "internalConductor",
      roleIds: ["moderator", "workflowCoordinator", "modelAdvisor"],
      roleNames: ["Moderator", "Workflow Coordinator", "Model Advisor"],
      workflowId,
      workflowStepId,
      status,
      content: text
    });
  }

  private async hydrate(): Promise<void> {
    await this.panel?.post({
      type: "hydrate",
      profile: this.profile,
      transcript: this.transcriptStore.current(),
      settings: this.settings,
      health: this.health,
      selectedWorkflowId: this.selectedWorkflowId,
      safetyMode: this.safetyMode,
      contextChips: this.contextChips
    });
  }

  private createProfileStore(): RoomProfileStore {
    return new RoomProfileStore({
      mode: this.settings.roomProfileStorage,
      workspaceRoot: this.workspaceRoot(),
      globalStore: this.context.globalState
    });
  }

  private createTranscriptStore(): TranscriptStore {
    return new TranscriptStore({
      mode: this.settings.transcriptStorage,
      workspaceRoot: this.workspaceRoot(),
      globalStore: this.context.globalState
    });
  }

  private createProviderRegistry(): ProviderRegistry {
    return new ProviderRegistry([
      new ClaudeCodeProvider({
        executable: this.settings.claudeExecutable,
        timeoutMs: this.settings.healthCheckTimeoutSeconds * 1000,
        preferJson: this.settings.claudePreferJson,
        preferStreamJson: this.settings.claudePreferStreamJson
      }),
      new CodexCliProvider({
        executable: this.settings.codexExecutable,
        timeoutMs: this.settings.healthCheckTimeoutSeconds * 1000,
        useJson: this.settings.codexUseJson,
        sandbox: this.settings.codexSandbox,
        approval: this.settings.codexApproval
      }),
      new OpenAiWebSearchProvider({
        enabled: this.settings.webResearch.enabled,
        settings: this.settings.webResearch,
        secretReader: this.context.secrets
      })
    ]);
  }

  private createWorkflowRunner(): WorkflowRunner {
    return new WorkflowRunner({
      team: new VirtualTeamRegistry(this.profile.virtualAgents),
      roles: new RoleRegistry(this.profile.roles),
      workflows: new WorkflowRegistry(this.profile.workflows),
      providers: this.profile.providers
    });
  }

  private createAdvisor(): ModelAdvisor {
    return new ModelAdvisor({
      team: new VirtualTeamRegistry(this.profile.virtualAgents),
      roles: new RoleRegistry(this.profile.roles),
      workflows: new WorkflowRegistry(this.profile.workflows),
      settings: this.settings.modelAdvisor
    });
  }

  private rolesForAgent(agent: VirtualAgent): RoleDefinition[] {
    return new RoleRegistry(this.profile.roles).getMany(agent.assignedRoleIds);
  }

  private participants() {
    return this.profile.virtualAgents.map((agent) => {
      const provider = this.profile.providers.find((entry) => entry.id === agent.providerId);
      return {
        displayName: agent.displayName,
        providerName: provider?.displayName ?? agent.providerId,
        roleNames: this.rolesForAgent(agent).map((role) => role.name)
      };
    });
  }

  private currentMessages(): AgentRoomMessage[] {
    return this.transcriptStore.current()?.messages ?? [];
  }

  private async collectContext(): Promise<RoomContextSnapshot> {
    return collectWorkspaceContext({
      includeSelection: this.contextChips.selection,
      includeCurrentFile: this.contextChips.currentFile,
      includeGitStatus: this.contextChips.gitStatus
    });
  }

  private workspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private workspaceUri(fileName: string): vscode.Uri | undefined {
    const root = this.workspaceRoot();
    return root ? vscode.Uri.file(path.join(root, fileName)) : undefined;
  }

  private applySettingsToProfile(): void {
    for (const provider of this.profile.providers) {
      if (provider.id === "claudeCodeCli") provider.executable = this.settings.claudeExecutable;
      if (provider.id === "codexCli") provider.executable = this.settings.codexExecutable;
      if (provider.id === "openAiWebSearch") provider.enabled = this.settings.webResearch.enabled;
    }
    const scout = this.profile.virtualAgents.find((agent) => agent.id === "scout");
    if (scout) scout.enabled = this.settings.webResearch.enabled;
  }

  private updateUiState(state: {
    selectedWorkflowId?: string;
    safetyMode?: string;
    panelsOpen?: string[];
  }): void {
    if (state.selectedWorkflowId) this.selectedWorkflowId = state.selectedWorkflowId;
    if (
      state.safetyMode === "readOnly" ||
      state.safetyMode === "workspaceWriteWithApproval" ||
      state.safetyMode === "dangerous"
    ) {
      this.safetyMode = state.safetyMode;
    }
  }

  private async updateRoleAssignment(agentId: string, roleId: string, assigned: boolean): Promise<void> {
    const agent = this.profile.virtualAgents.find((entry) => entry.id === agentId);
    if (!agent) throw new Error(`Team member not found: ${agentId}`);
    if (assigned && !agent.assignedRoleIds.includes(roleId)) agent.assignedRoleIds.push(roleId);
    if (!assigned) agent.assignedRoleIds = agent.assignedRoleIds.filter((id) => id !== roleId);
    await this.profileStore.save(this.profile);
    await this.hydrate();
  }

  private async createCustomRole(name: string, description: string, instructions: string): Promise<void> {
    const registry = new RoleRegistry(this.profile.roles);
    const role = registry.createCustomRole({ name, description, instructions });
    this.profile.roles = registry.all();
    await this.profileStore.save(this.profile);
    await this.panel?.post({ type: "profileUpdated", role });
    await this.hydrate();
  }

  private async updateCustomRole(
    roleId: string,
    patch: { name?: string; description?: string; instructions?: string }
  ): Promise<void> {
    const registry = new RoleRegistry(this.profile.roles);
    registry.updateCustomRole(roleId, patch);
    this.profile.roles = registry.all();
    await this.profileStore.save(this.profile);
    await this.hydrate();
  }

  private async deleteCustomRole(roleId: string): Promise<void> {
    const registry = new RoleRegistry(this.profile.roles);
    registry.deleteRole(roleId);
    this.profile.roles = registry.all();
    for (const agent of this.profile.virtualAgents) {
      agent.assignedRoleIds = agent.assignedRoleIds.filter((id) => id !== roleId);
    }
    await this.profileStore.save(this.profile);
    await this.hydrate();
  }

  private async selectedTextOrActiveFilePrompt(): Promise<string> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return "No active editor is open. Use the workspace context available.";
    const selection = editor.selection.isEmpty ? "" : editor.document.getText(editor.selection);
    if (selection.trim()) return selection;
    return `Current file: ${editor.document.uri.fsPath}\n\n${editor.document.getText()}`;
  }
}
