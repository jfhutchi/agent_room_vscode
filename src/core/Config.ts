import * as vscode from "vscode";
import { AgentRoomSettings } from "./Types";
import { resolveConfiguredOperatingMode } from "./OperatingMode";

function get<T>(config: vscode.WorkspaceConfiguration, key: string, fallback: T): T {
  return config.get<T>(key, fallback);
}

export function getAgentRoomSettings(): AgentRoomSettings {
  const config = vscode.workspace.getConfiguration("agentRoom");
  const operatingMode = resolveConfiguredOperatingMode(config.get<unknown>("operatingMode"));
  return {
    operatingMode: operatingMode.mode,
    invalidConfiguredOperatingMode: operatingMode.invalidValue,
    firstLaunchShowModePicker: get(config, "firstLaunch.showModePicker", true),
    workModeEnabled: get(config, "workMode.enabled", true),
    personalModeEnabled: get(config, "personalMode.enabled", true),
    requireTypedConfirmationOnSwitch: get(
      config,
      "modeSeparation.requireTypedConfirmationOnSwitch",
      true
    ),
    claudeExecutable: get(config, "claude.executable", "claude"),
    codexExecutable: get(config, "codex.executable", "codex"),
    defaultWorkflow: get(config, "defaultWorkflow", "manual"),
    defaultContextMode: get(config, "defaultContextMode", "lastMessages"),
    lastMessagesCount: get(config, "lastMessagesCount", 10),
    maxTranscriptChars: get(config, "maxTranscriptChars", 60000),
    maxPromptChars: get(config, "maxPromptChars", 120000),
    agentTimeoutSeconds: get(config, "agentTimeoutSeconds", 600),
    healthCheckTimeoutSeconds: get(config, "healthCheckTimeoutSeconds", 10),
    claudePreferStreamJson: get(config, "claude.preferStreamJson", true),
    claudePreferJson: get(config, "claude.preferJson", true),
    codexUseJson: get(config, "codex.useJson", true),
    codexSandbox: get(config, "codex.sandbox", "workspace-write"),
    codexApproval: get(config, "codex.approval", "on-request"),
    enableDangerousModes: get(config, "enableDangerousModes", false),
    transcriptStorage: get(config, "transcriptStorage", "workspace"),
    roomProfileStorage: get(config, "roomProfileStorage", "workspace"),
    showRawAgentEvents: get(config, "showRawAgentEvents", false),
    extraRoomInstructions: get(config, "extraRoomInstructions", ""),
    includeGitStatusByDefault: get(config, "includeGitStatusByDefault", true),
    includeCurrentFileByDefault: get(config, "includeCurrentFileByDefault", false),
    includeSelectionByDefault: get(config, "includeSelectionByDefault", true),
    loggingLevel: get(config, "logging.level", "error"),
    modelAdvisor: {
      enabled: get(config, "modelAdvisor.enabled", true),
      autoApply: get(config, "modelAdvisor.autoApply", false),
      showReasoning: get(config, "modelAdvisor.showReasoning", true),
      preferLowerCost: get(config, "modelAdvisor.preferLowerCost", true),
      preferSpeed: get(config, "modelAdvisor.preferSpeed", false),
      preferQuality: get(config, "modelAdvisor.preferQuality", false),
      confirmBeforeDeepReasoning: get(config, "modelAdvisor.confirmBeforeDeepReasoning", true)
    },
    models: {
      claude: {
        fast: get(config, "models.claude.fast", ""),
        balanced: get(config, "models.claude.balanced", ""),
        deepReasoning: get(config, "models.claude.deepReasoning", ""),
        coding: get(config, "models.claude.coding", "")
      },
      codex: {
        fast: get(config, "models.codex.fast", ""),
        balanced: get(config, "models.codex.balanced", ""),
        deepReasoning: get(config, "models.codex.deepReasoning", ""),
        coding: get(config, "models.codex.coding", "")
      },
      openAiWebSearch: {
        research: get(config, "models.openAiWebSearch.research", "")
      }
    },
    webResearch: {
      enabled: get(config, "webResearch.enabled", false),
      provider: get(config, "webResearch.provider", "openAiWebSearch"),
      model: get(config, "webResearch.model", ""),
      apiKeySource: get(config, "webResearch.apiKeySource", "environment"),
      apiKeyEnvironmentVariable: get(config, "webResearch.apiKeyEnvironmentVariable", "OPENAI_API_KEY"),
      maxResults: get(config, "webResearch.maxResults", 5),
      requireCitations: get(config, "webResearch.requireCitations", true),
      onlyWhenRequested: get(config, "webResearch.onlyWhenRequested", true),
      allowedDomains: get(config, "webResearch.allowedDomains", []),
      blockedDomains: get(config, "webResearch.blockedDomains", []),
      searchFreshness: get(config, "webResearch.searchFreshness", "auto")
    }
  };
}
