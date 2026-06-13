/**
 * Strict validation of messages crossing the webview boundary.
 * Unknown message types and malformed payloads are rejected; the webview is
 * treated as untrusted input.
 */

import { isOperatingMode, type OperatingMode } from "../core/OperatingMode";

export type WebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "sendMessage"; text: string; replyToMessageId?: string }
  | { type: "sendToVirtualAgent"; agentId: string; text: string; replyToMessageId?: string }
  | { type: "sendToRole"; roleId: string; text: string; replyToMessageId?: string }
  | { type: "runWorkflow"; workflowId: string; text: string }
  | { type: "stop" }
  | { type: "clearTranscript" }
  | { type: "exportTranscript"; format: "markdown" | "json" }
  | { type: "checkHealth" }
  | { type: "switchOperatingMode"; mode: OperatingMode }
  | {
      type: "updateUiState";
      state: {
        reaction?: { messageId: string; reaction: string };
        selectedWorkflowId?: string;
        safetyMode?: string;
        panelsOpen?: string[];
      };
    }
  | { type: "toggleContextChip"; chip: "selection" | "currentFile" | "gitStatus"; enabled: boolean }
  | { type: "updateRoleAssignment"; agentId: string; roleId: string; assigned: boolean }
  | { type: "saveRoomProfile" }
  | { type: "restoreDefaultProfile" }
  | { type: "exportRoomProfile" }
  | { type: "importRoomProfile" }
  | { type: "generateCopilotCustomAgents" }
  | { type: "previewCopilotCustomAgents" }
  | { type: "openCopilotCustomAgentsFolder" }
  | { type: "checkCopilotCapabilities" }
  | { type: "startOrchestratedBuild"; text: string }
  | { type: "createCustomRole"; name: string; description: string; instructions: string }
  | {
      type: "updateCustomRole";
      roleId: string;
      name?: string;
      description?: string;
      instructions?: string;
    }
  | { type: "deleteCustomRole"; roleId: string }
  | { type: "applyModelAdvisorRecommendation"; recommendationId: string }
  | { type: "ignoreModelAdvisorRecommendation"; recommendationId: string };

const MAX_TEXT = 200_000;
const MAX_ID = 200;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isShortString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= MAX_ID;
}

function isText(v: unknown): v is string {
  return typeof v === "string" && v.length <= MAX_TEXT;
}

function optionalShortString(v: unknown): boolean {
  return v === undefined || isShortString(v);
}

/**
 * Validate a raw message received from the webview.
 * Returns the typed message or `null` if it must be rejected.
 */
export function validateWebviewMessage(raw: unknown): WebviewToExtensionMessage | null {
  if (!isObject(raw) || typeof raw.type !== "string") return null;

  switch (raw.type) {
    case "ready":
    case "stop":
    case "clearTranscript":
    case "checkHealth":
    case "saveRoomProfile":
    case "restoreDefaultProfile":
    case "exportRoomProfile":
    case "importRoomProfile":
    case "generateCopilotCustomAgents":
    case "previewCopilotCustomAgents":
    case "openCopilotCustomAgentsFolder":
    case "checkCopilotCapabilities":
      return { type: raw.type };

    case "sendMessage":
      if (!isText(raw.text) || (raw.text as string).trim().length === 0) return null;
      if (!optionalShortString(raw.replyToMessageId)) return null;
      return {
        type: "sendMessage",
        text: raw.text as string,
        replyToMessageId: raw.replyToMessageId as string | undefined
      };

    case "startOrchestratedBuild":
      if (!isText(raw.text) || (raw.text as string).trim().length === 0) return null;
      return { type: "startOrchestratedBuild", text: raw.text as string };

    case "sendToVirtualAgent":
      if (!isShortString(raw.agentId) || !isText(raw.text)) return null;
      if (!optionalShortString(raw.replyToMessageId)) return null;
      return {
        type: "sendToVirtualAgent",
        agentId: raw.agentId,
        text: raw.text as string,
        replyToMessageId: raw.replyToMessageId as string | undefined
      };

    case "sendToRole":
      if (!isShortString(raw.roleId) || !isText(raw.text)) return null;
      if (!optionalShortString(raw.replyToMessageId)) return null;
      return {
        type: "sendToRole",
        roleId: raw.roleId,
        text: raw.text as string,
        replyToMessageId: raw.replyToMessageId as string | undefined
      };

    case "runWorkflow":
      if (!isShortString(raw.workflowId) || !isText(raw.text)) return null;
      return { type: "runWorkflow", workflowId: raw.workflowId, text: raw.text as string };

    case "exportTranscript":
      if (raw.format !== "markdown" && raw.format !== "json") return null;
      return { type: "exportTranscript", format: raw.format };

    case "switchOperatingMode":
      if (!isOperatingMode(raw.mode)) return null;
      return { type: "switchOperatingMode", mode: raw.mode };

    case "updateUiState": {
      if (!isObject(raw.state)) return null;
      const state: {
        reaction?: { messageId: string; reaction: string };
        selectedWorkflowId?: string;
        safetyMode?: string;
        panelsOpen?: string[];
      } = {};
      const s = raw.state as Record<string, unknown>;
      if (s.reaction !== undefined) {
        if (!isObject(s.reaction)) return null;
        const r = s.reaction as Record<string, unknown>;
        if (!isShortString(r.messageId) || !isShortString(r.reaction)) return null;
        state.reaction = { messageId: r.messageId, reaction: r.reaction };
      }
      if (s.selectedWorkflowId !== undefined) {
        if (!isShortString(s.selectedWorkflowId)) return null;
        state.selectedWorkflowId = s.selectedWorkflowId;
      }
      if (s.safetyMode !== undefined) {
        if (!isShortString(s.safetyMode)) return null;
        state.safetyMode = s.safetyMode;
      }
      if (s.panelsOpen !== undefined) {
        if (!Array.isArray(s.panelsOpen) || !s.panelsOpen.every(isShortString)) return null;
        state.panelsOpen = s.panelsOpen as string[];
      }
      return { type: "updateUiState", state };
    }

    case "toggleContextChip":
      if (raw.chip !== "selection" && raw.chip !== "currentFile" && raw.chip !== "gitStatus") {
        return null;
      }
      if (typeof raw.enabled !== "boolean") return null;
      return { type: "toggleContextChip", chip: raw.chip, enabled: raw.enabled };

    case "updateRoleAssignment":
      if (!isShortString(raw.agentId) || !isShortString(raw.roleId)) return null;
      if (typeof raw.assigned !== "boolean") return null;
      return {
        type: "updateRoleAssignment",
        agentId: raw.agentId,
        roleId: raw.roleId,
        assigned: raw.assigned
      };

    case "createCustomRole":
      if (!isShortString(raw.name)) return null;
      if (typeof raw.description !== "string" || raw.description.length > 2000) return null;
      if (typeof raw.instructions !== "string" || raw.instructions.length > 10_000) return null;
      return {
        type: "createCustomRole",
        name: raw.name,
        description: raw.description,
        instructions: raw.instructions
      };

    case "updateCustomRole":
      if (!isShortString(raw.roleId)) return null;
      if (raw.name !== undefined && !isShortString(raw.name)) return null;
      if (raw.description !== undefined && (typeof raw.description !== "string" || raw.description.length > 2000)) return null;
      if (raw.instructions !== undefined && (typeof raw.instructions !== "string" || raw.instructions.length > 10_000)) return null;
      return {
        type: "updateCustomRole",
        roleId: raw.roleId,
        name: raw.name as string | undefined,
        description: raw.description as string | undefined,
        instructions: raw.instructions as string | undefined
      };

    case "deleteCustomRole":
      if (!isShortString(raw.roleId)) return null;
      return { type: "deleteCustomRole", roleId: raw.roleId };

    case "applyModelAdvisorRecommendation":
    case "ignoreModelAdvisorRecommendation":
      if (!isShortString(raw.recommendationId)) return null;
      return { type: raw.type, recommendationId: raw.recommendationId };

    default:
      return null;
  }
}

/** Message types the extension is allowed to post into the webview. */
export type ExtensionToWebviewMessageType =
  | "hydrate"
  | "transcriptUpdated"
  | "messageAdded"
  | "messageUpdated"
  | "healthUpdated"
  | "runningStateChanged"
  | "error"
  | "settingsUpdated"
  | "exportComplete"
  | "profileUpdated"
  | "modelAdvisorRecommendation"
  | "copilotCapabilitiesUpdated";

export const EXTENSION_TO_WEBVIEW_TYPES: ReadonlySet<string> = new Set<string>([
  "hydrate",
  "transcriptUpdated",
  "messageAdded",
  "messageUpdated",
  "healthUpdated",
  "runningStateChanged",
  "error",
  "settingsUpdated",
  "exportComplete",
  "profileUpdated",
  "modelAdvisorRecommendation",
  "copilotCapabilitiesUpdated"
]);
