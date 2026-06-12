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
import {
  FIRST_LAUNCH_MODE_PICKER_ITEMS,
  OperatingModeManager,
  SWITCH_MODE_PICKER_ITEMS,
  WORK_TO_PERSONAL_CONFIRMATION_TEXT,
  WORK_TO_PERSONAL_WARNING,
  modeChangedMessage,
  modeDescription,
  modeName,
  modeTitle,
  resolveControllerStartupMode,
  type ModePickerItem,
  type OperatingMode
} from "./OperatingMode";

export class AgentRoomController {
  private panel: AgentRoomPanel | undefined;
  private settings: AgentRoomSettings;
  private operatingMode: OperatingMode | undefined;
  private operatingModeManager: OperatingModeManager;
  private profile: RoomProfile | undefined;
  private profileStore: RoomProfileStore | undefined;
  private transcriptStore: TranscriptStore;
  private providerRegistry: ProviderRegistry | undefined;
  private health: Record<string, unknown> = {};
  private abortController: AbortController | undefined;
  private isRunning = false;
  private runGeneration = 0;
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
    this.operatingModeManager = new OperatingModeManager({
      workspaceState: this.context.workspaceState,
      configuredMode: this.settings.operatingMode,
      invalidConfiguredMode: this.settings.invalidConfiguredOperatingMode,
      requireTypedConfirmationOnSwitch: this.settings.requireTypedConfirmationOnSwitch
    });
    this.operatingMode = resolveControllerStartupMode(
      this.operatingModeManager,
      this.settings.firstLaunchShowModePicker
    );
    if (this.operatingMode) this.settings.operatingMode = this.operatingMode;
    this.selectedWorkflowId = this.settings.defaultWorkflow;
    this.contextChips = {
      selection: this.settings.includeSelectionByDefault,
      currentFile: this.settings.includeCurrentFileByDefault,
      gitStatus: this.settings.includeGitStatusByDefault
    };
    const logger = new Logger(output);
    logger.setLevel(this.settings.loggingLevel);
    this.transcriptStore = this.createTranscriptStore();
  }

  static async create(
    context: vscode.ExtensionContext,
    output: vscode.OutputChannel
  ): Promise<AgentRoomController> {
    const controller = new AgentRoomController(context, output);
    if (controller.operatingMode) {
      await controller.initializeModeResources(controller.operatingMode);
    }
    return controller;
  }

  /**
   * Builds every mode-scoped resource (profile store, profile, provider
   * registry) for the given mode. Nothing mode-scoped exists before the
   * workspace's mode is known (SPEC §3.4).
   */
  private async initializeModeResources(mode: OperatingMode): Promise<void> {
    this.operatingMode = mode;
    this.settings.operatingMode = mode;
    this.profileStore = this.createProfileStore(mode);
    this.profile = await this.profileStore.load();
    this.applySettingsToProfile();
    this.providerRegistry = this.createProviderRegistry(mode);
  }

  private requireOperatingMode(): OperatingMode {
    if (!this.operatingMode) {
      throw new Error("Agent Room operating mode has not been selected for this workspace yet.");
    }
    return this.operatingMode;
  }

  private requireProfile(): RoomProfile {
    if (!this.profile) {
      throw new Error("Agent Room profile is not loaded. Choose an operating mode first.");
    }
    return this.profile;
  }

  private requireProfileStore(): RoomProfileStore {
    if (!this.profileStore) {
      throw new Error("Agent Room profile store is not ready. Choose an operating mode first.");
    }
    return this.profileStore;
  }

  private requireProviderRegistry(): ProviderRegistry {
    if (!this.providerRegistry) {
      throw new Error("Agent Room providers are not ready. Choose an operating mode first.");
    }
    return this.providerRegistry;
  }

  dispose(): void {
    this.abortController?.abort();
    this.panel?.dispose();
  }

  async open(): Promise<boolean> {
    const modeSelected = await this.ensureFirstLaunchMode();
    if (!modeSelected) return false;
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
    return true;
  }

  async openRoomSetup(): Promise<void> {
    if (!(await this.open())) return;
    await this.panel?.post({ type: "settingsUpdated", openSetup: true });
  }

  async checkCliHealth(): Promise<void> {
    if (!(await this.open())) return;
    this.health = await checkProviderHealth(this.requireProviderRegistry());
    await this.panel?.post({ type: "healthUpdated", health: this.health });
  }

  async switchOperatingMode(targetMode?: OperatingMode): Promise<void> {
    const selected = targetMode ?? (await this.pickSwitchMode());
    if (!selected) return;
    if (!this.allowedModes().includes(selected)) {
      await vscode.window.showWarningMessage(
        `${modeName(selected)} is disabled by your Agent Room settings.`
      );
      return;
    }

    let typedConfirmation: string | undefined;
    if (
      this.operatingMode === "workCopilotNative" &&
      selected === "personalLocal" &&
      this.operatingModeManager.hasEverBeenInWorkMode() &&
      this.settings.requireTypedConfirmationOnSwitch
    ) {
      typedConfirmation = await vscode.window.showInputBox({
        title: "Confirm Personal Mode",
        prompt: `${WORK_TO_PERSONAL_WARNING} Type "${WORK_TO_PERSONAL_CONFIRMATION_TEXT}" to continue.`,
        ignoreFocusOut: true,
        validateInput: (value) =>
          value === WORK_TO_PERSONAL_CONFIRMATION_TEXT
            ? undefined
            : `Type "${WORK_TO_PERSONAL_CONFIRMATION_TEXT}" to continue.`
      });
      if (typedConfirmation === undefined) return;
    }

    const result = await this.operatingModeManager.switchMode(selected, {
      typedConfirmation,
      cancelActiveProviderSessions: () => this.cancelActiveProviderSessions(),
      clearRunningState: () => this.clearRunningState(),
      startTranscriptSegment: async (mode) => {
        await this.setOperatingMode(mode);
        await this.startModeTranscriptSegment(mode);
      },
      showModeChangedMessage: async (mode) => {
        await this.addConductorMessage(modeChangedMessage(mode));
      }
    });

    if (!result.changed) {
      if (result.warningText) {
        await vscode.window.showWarningMessage(result.warningText);
      }
      return;
    }
    await this.hydrate();
  }

  async resetRoleAssignments(): Promise<void> {
    if (!(await this.open())) return;
    this.profile = createDefaultRoomProfile(this.requireOperatingMode());
    this.applySettingsToProfile();
    await this.requireProfileStore().save(this.requireProfile());
    await this.hydrate();
  }

  async exportRoomProfile(): Promise<void> {
    if (!(await this.open())) return;
    const uri = await vscode.window.showSaveDialog({
      defaultUri: this.workspaceUri("agent-room-profile.json"),
      filters: { JSON: ["json"] }
    });
    if (!uri) return;
    await fs.writeFile(uri.fsPath, JSON.stringify(this.requireProfile(), null, 2), "utf8");
  }

  async importRoomProfile(): Promise<void> {
    if (!(await this.open())) return;
    const files = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { JSON: ["json"] }
    });
    const file = files?.[0];
    if (!file) return;
    const text = await fs.readFile(file.fsPath, "utf8");
    this.profile = this.requireProfileStore().parseImported(text);
    this.applySettingsToProfile();
    await this.requireProfileStore().save(this.requireProfile());
    await this.hydrate();
  }

  async sendCurrentSelectionToAgent(agentId: string): Promise<void> {
    if (!(await this.open())) return;
    const text = this.selectedTextOrActiveFilePrompt();
    await this.sendToAgent(agentId, await text);
  }

  async sendCurrentSelectionToRole(roleId: string): Promise<void> {
    if (!(await this.open())) return;
    const team = new VirtualTeamRegistry(this.requireProfile().virtualAgents);
    const agent = team.agentsWithAnyRole([roleId])[0];
    if (!agent) {
      await this.addConductorMessage(`No enabled team member currently has role: ${roleId}.`, "error");
      return;
    }
    await this.sendToAgent(agent.id, await this.selectedTextOrActiveFilePrompt());
  }

  async runWorkflowOnCurrentFile(workflowId: string): Promise<void> {
    if (!(await this.open())) return;
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
    if (!this.operatingMode) return;
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
        this.cancelActiveProviderSessions();
        await this.clearRunningState();
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
      case "switchOperatingMode":
        await this.switchOperatingMode(message.mode);
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
        await this.requireProfileStore().save(this.requireProfile());
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
    const team = new VirtualTeamRegistry(this.requireProfile().virtualAgents);
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

    const workflowGeneration = this.runGeneration;
    const workflowOperatingMode = this.operatingMode;
    for (const planned of validation.plan.steps) {
      if (
        workflowGeneration !== this.runGeneration ||
        workflowOperatingMode !== this.operatingMode ||
        this.abortController?.signal.aborted
      ) {
        break;
      }
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
    const provider = this.requireProfile().providers.find((entry) => entry.id === agent.providerId);
    if (!provider || provider.kind === "human" || provider.kind === "internal") {
      await this.addConductorMessage(`${agent.displayName} is not backed by a runnable provider.`, "error");
      return;
    }
    const providerRegistry = this.requireProviderRegistry();
    if (!providerRegistry.has(agent.providerId)) {
      // SPEC §3.4: never substitute providers across the Work/Personal
      // partition; explain instead of falling back.
      await this.addConductorMessage(
        `${agent.displayName} needs the ${provider.displayName} provider, which is not available in ${modeName(this.requireOperatingMode())}. Agent Room never substitutes providers across the Work/Personal partition.`,
        "error"
      );
      return;
    }
    const roles = this.rolesForAgent(agent);
    const pending = await this.transcriptStore.appendMessage(transcript.id, {
      participantKind: "virtualAgent",
      participantId: agent.id,
      displayName: agent.displayName,
      providerId: agent.providerId,
      operatingMode: this.operatingMode,
      roleIds: roles.map((role) => role.id),
      roleNames: roles.map((role) => role.name),
      workflowId: options.workflowId,
      workflowStepId: options.stepId,
      status: "running",
      content: ""
    });
    await this.hydrate();

    const runAbortController = new AbortController();
    const runGeneration = this.runGeneration;
    const runOperatingMode = this.operatingMode;
    this.abortController = runAbortController;
    this.isRunning = true;
    await this.panel?.post({ type: "runningStateChanged", running: true });
    const safety = new SafetyPolicy({
      enableDangerousModes: this.settings.enableDangerousModes,
      dangerousModeSelected: this.safetyMode === "dangerous",
      dangerousModeConfirmed: false
    });

    try {
      const result = await runAgentTurn({
        providerRegistry,
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
        abortSignal: runAbortController.signal
      });
      if (
        runGeneration !== this.runGeneration ||
        runOperatingMode !== this.operatingMode ||
        runAbortController.signal.aborted
      ) {
        await this.transcriptStore.updateMessage(transcript.id, pending.id, {
          status: "cancelled",
          content: "Cancelled because the operating mode changed or the run was stopped."
        });
        return;
      }
      await this.transcriptStore.updateMessage(transcript.id, pending.id, {
        status: messageStatusFromProvider(result.status),
        content: result.finalText,
        diagnostics: result.diagnostics
      });
    } catch (error) {
      if (
        runGeneration !== this.runGeneration ||
        runOperatingMode !== this.operatingMode ||
        runAbortController.signal.aborted
      ) {
        await this.transcriptStore.updateMessage(transcript.id, pending.id, {
          status: "cancelled",
          content: "Cancelled because the operating mode changed or the run was stopped."
        });
        return;
      }
      await this.transcriptStore.updateMessage(transcript.id, pending.id, {
        status: "error",
        content: error instanceof Error ? error.message : String(error)
      });
    } finally {
      if (this.abortController === runAbortController) {
        this.abortController = undefined;
        this.isRunning = false;
        await this.panel?.post({ type: "runningStateChanged", running: false });
      }
    }
  }

  private async ensureTranscript() {
    const current = this.transcriptStore.current();
    if (current) return current;
    const context = await this.collectContext();
    return this.transcriptStore.create({
      operatingMode: this.requireOperatingMode(),
      workspacePath: context.workspacePath,
      workspaceName: context.workspaceName,
      gitBranch: context.gitBranch,
      roomProfileSnapshot: this.requireProfile(),
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
      operatingMode: this.operatingMode,
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
      operatingMode: this.operatingMode,
      roleIds: ["moderator", "workflowCoordinator", "modelAdvisor"],
      roleNames: ["Moderator", "Workflow Coordinator", "Model Advisor"],
      workflowId,
      workflowStepId,
      status,
      content: text
    });
  }

  private async hydrate(): Promise<void> {
    // The panel only exists after a mode was selected, but guard anyway: a
    // hydrate before mode selection has nothing meaningful to render.
    if (!this.panel || !this.operatingMode || !this.profile) return;
    await this.panel.post({
      type: "hydrate",
      profile: this.profile,
      transcript: this.transcriptStore.current(),
      settings: this.settings,
      operatingMode: this.operatingMode,
      operatingModeTitle: modeTitle(this.operatingMode),
      operatingModeDescription: modeDescription(this.operatingMode),
      health: this.health,
      selectedWorkflowId: this.selectedWorkflowId,
      safetyMode: this.safetyMode,
      running: this.isRunning,
      contextChips: this.contextChips
    });
  }

  private async ensureFirstLaunchMode(): Promise<boolean> {
    const result = await this.operatingModeManager.ensureModeSelectedForOpen({
      firstLaunchPickerRequired: this.settings.firstLaunchShowModePicker,
      pickMode: () => this.pickFirstLaunchMode(),
      showInfoMessage: async (message) => {
        await vscode.window.showInformationMessage(message);
      }
    });
    if (!result.canOpen) return false;
    if (result.mode) await this.setOperatingMode(result.mode);
    return true;
  }

  /**
   * Modes selectable under agentRoom.workMode.enabled /
   * agentRoom.personalMode.enabled. Disabling both would lock the user out,
   * so that combination falls back to offering both modes.
   */
  private allowedModes(): OperatingMode[] {
    const allowed: OperatingMode[] = [];
    if (this.settings.workModeEnabled) allowed.push("workCopilotNative");
    if (this.settings.personalModeEnabled) allowed.push("personalLocal");
    return allowed.length > 0 ? allowed : ["workCopilotNative", "personalLocal"];
  }

  private filterPickerItems(items: readonly ModePickerItem[]): ModePickerItem[] {
    const allowed = this.allowedModes();
    return items.filter((item) => !item.mode || allowed.includes(item.mode));
  }

  private async pickFirstLaunchMode(): Promise<OperatingMode | undefined> {
    const items = this.filterPickerItems(FIRST_LAUNCH_MODE_PICKER_ITEMS);
    while (true) {
      const picked = await vscode.window.showQuickPick(items, {
        title: "Choose Agent Room mode for this workspace",
        placeHolder:
          "Work Mode and Personal Mode are fully separated. Mode can be changed later only through Agent Room: Switch Operating Mode.",
        ignoreFocusOut: true
      });
      if (!picked) return undefined;
      if (picked.learnMore) {
        await vscode.window.showInformationMessage(
          "Agent Room has no Hybrid Mode. Work Mode and Personal Mode are fully separated, and mode can be changed later only through Agent Room: Switch Operating Mode."
        );
        continue;
      }
      return picked.mode;
    }
  }

  private async pickSwitchMode(): Promise<OperatingMode | undefined> {
    const picked = await vscode.window.showQuickPick(this.filterPickerItems(SWITCH_MODE_PICKER_ITEMS), {
      title: "Agent Room: Switch Operating Mode",
      placeHolder: "Choose Work / Copilot Native or Personal / Local CLI.",
      ignoreFocusOut: true
    });
    return picked?.mode;
  }

  private async setOperatingMode(mode: OperatingMode): Promise<void> {
    await this.initializeModeResources(mode);
  }

  private async startModeTranscriptSegment(mode: OperatingMode): Promise<void> {
    const context = await this.collectContext();
    await this.transcriptStore.create({
      operatingMode: mode,
      workspacePath: context.workspacePath,
      workspaceName: context.workspaceName,
      gitBranch: context.gitBranch,
      roomProfileSnapshot: this.requireProfile(),
      workflowId: this.selectedWorkflowId,
      settingsSnapshot: this.settings as unknown as Record<string, unknown>
    });
  }

  private cancelActiveProviderSessions(): void {
    this.runGeneration += 1;
    this.abortController?.abort();
    this.abortController = undefined;
  }

  private async clearRunningState(): Promise<void> {
    this.isRunning = false;
    await this.panel?.post({ type: "runningStateChanged", running: false });
  }

  private createProfileStore(operatingMode: OperatingMode): RoomProfileStore {
    return new RoomProfileStore({
      mode: this.settings.roomProfileStorage,
      operatingMode,
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

  private createProviderRegistry(operatingMode: OperatingMode): ProviderRegistry {
    if (operatingMode === "workCopilotNative") {
      // SPEC §3.4: in Work Mode the personal providers (claudeCodeCli,
      // codexCli, openAiWebSearch) are never constructed or registered.
      // Runnable Copilot providers arrive in a later phase, so the Work Mode
      // registry is honestly empty rather than faking Copilot execution.
      return new ProviderRegistry([], operatingMode);
    }
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
    ], operatingMode);
  }

  private createWorkflowRunner(): WorkflowRunner {
    const profile = this.requireProfile();
    return new WorkflowRunner({
      team: new VirtualTeamRegistry(profile.virtualAgents),
      roles: new RoleRegistry(profile.roles),
      workflows: new WorkflowRegistry(profile.workflows),
      providers: profile.providers
    });
  }

  private createAdvisor(): ModelAdvisor {
    const profile = this.requireProfile();
    return new ModelAdvisor({
      team: new VirtualTeamRegistry(profile.virtualAgents),
      roles: new RoleRegistry(profile.roles),
      workflows: new WorkflowRegistry(profile.workflows),
      settings: this.settings.modelAdvisor
    });
  }

  private rolesForAgent(agent: VirtualAgent): RoleDefinition[] {
    return new RoleRegistry(this.requireProfile().roles).getMany(agent.assignedRoleIds);
  }

  private participants() {
    const profile = this.requireProfile();
    return profile.virtualAgents.map((agent) => {
      const provider = profile.providers.find((entry) => entry.id === agent.providerId);
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
    const profile = this.requireProfile();
    for (const provider of profile.providers) {
      if (provider.id === "claudeCodeCli") provider.executable = this.settings.claudeExecutable;
      if (provider.id === "codexCli") provider.executable = this.settings.codexExecutable;
      if (provider.id === "openAiWebSearch") provider.enabled = this.settings.webResearch.enabled;
    }
    // Scout is provider-backed by openAiWebSearch only in Personal Mode.
    const scout = profile.virtualAgents.find((agent) => agent.id === "scout");
    if (scout && scout.providerId === "openAiWebSearch") {
      scout.enabled = this.settings.webResearch.enabled;
    }
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
    const profile = this.requireProfile();
    const agent = profile.virtualAgents.find((entry) => entry.id === agentId);
    if (!agent) throw new Error(`Team member not found: ${agentId}`);
    if (assigned && !agent.assignedRoleIds.includes(roleId)) agent.assignedRoleIds.push(roleId);
    if (!assigned) agent.assignedRoleIds = agent.assignedRoleIds.filter((id) => id !== roleId);
    await this.requireProfileStore().save(profile);
    await this.hydrate();
  }

  private async createCustomRole(name: string, description: string, instructions: string): Promise<void> {
    const profile = this.requireProfile();
    const registry = new RoleRegistry(profile.roles);
    const role = registry.createCustomRole({ name, description, instructions });
    profile.roles = registry.all();
    await this.requireProfileStore().save(profile);
    await this.panel?.post({ type: "profileUpdated", role });
    await this.hydrate();
  }

  private async updateCustomRole(
    roleId: string,
    patch: { name?: string; description?: string; instructions?: string }
  ): Promise<void> {
    const profile = this.requireProfile();
    const registry = new RoleRegistry(profile.roles);
    registry.updateCustomRole(roleId, patch);
    profile.roles = registry.all();
    await this.requireProfileStore().save(profile);
    await this.hydrate();
  }

  private async deleteCustomRole(roleId: string): Promise<void> {
    const profile = this.requireProfile();
    const registry = new RoleRegistry(profile.roles);
    registry.deleteRole(roleId);
    profile.roles = registry.all();
    for (const agent of profile.virtualAgents) {
      agent.assignedRoleIds = agent.assignedRoleIds.filter((id) => id !== roleId);
    }
    await this.requireProfileStore().save(profile);
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
