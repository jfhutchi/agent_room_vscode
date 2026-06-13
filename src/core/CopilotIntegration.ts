/**
 * Copilot capability detection (SPEC §7, §0.4, §3.2).
 *
 * Every flag here follows "honest false beats fake true": a capability is
 * true only when the public API surface was verified against the installed
 * `node_modules/@types/vscode` typings (1.91.0, matching engines.vscode
 * ^1.91.0) plus runtime extension detection. Where a flag is hard-false the
 * comment states what was (not) found in the typings.
 *
 * The detection inputs are injected so this module never imports `vscode`
 * and the §18 capability-detection tests can run against it directly; the
 * controller supplies the real `vscode.extensions.getExtension` etc.
 */

export const COPILOT_EXTENSION_ID = "GitHub.copilot";
export const COPILOT_CHAT_EXTENSION_ID = "GitHub.copilot-chat";

/** Canonical limitation strings (SPEC §3.2). */
export const DIRECT_SESSION_LIMITATION =
  "Direct Copilot Agent Session orchestration is not exposed through public APIs in this " +
  "environment. Agent Room can still generate Copilot custom agents and use approved Work " +
  "Mode features.";
export const ORG_POLICY_LIMITATION =
  "This model or agent is not available under your organization's GitHub Copilot policy.";

/** SPEC §7 capability interface, field for field. */
export interface CopilotIntegrationCapabilities {
  available: boolean;
  copilotExtensionDetected: boolean;
  copilotChatDetected: boolean;
  canCreateCustomAgents: boolean; // true if workspace files can be generated
  canRegisterChatParticipant: boolean; // true only via public VS Code API (verify typings)
  canInvokeCopilotAgentSession: boolean; // false unless public API verified
  canInvokeThirdPartyAgentSession: boolean; // false unless public API verified
  canReadAgentSessionTranscript: boolean; // false unless public API verified
  canRenderAgentSessionInCustomWebview: boolean; // false unless public API verified
  canManageCopilotCliSessions: boolean; // false unless public API verified
  limitations: string[];
  checkedAt: string;
}

/**
 * Detection inputs gathered by the caller from the real environment.
 * The controller fills these from `vscode.extensions.getExtension`,
 * `typeof vscode.chat?.createChatParticipant === "function"`,
 * `typeof vscode.lm?.selectChatModels === "function"`, and
 * `vscode.workspace.workspaceFolders`.
 */
export interface CopilotDetectionInput {
  copilotExtensionDetected: boolean;
  copilotChatDetected: boolean;
  /** `vscode.chat.createChatParticipant` exists (typings line 18943 in @types/vscode 1.91.0). */
  chatParticipantApiAvailable: boolean;
  /** `vscode.lm.selectChatModels` exists (typings line 19235 in @types/vscode 1.91.0). */
  languageModelApiAvailable: boolean;
  workspaceOpen: boolean;
}

export function detectCopilotCapabilities(input: CopilotDetectionInput): CopilotIntegrationCapabilities {
  const limitations: string[] = [];

  // @types/vscode 1.91.0 was searched for any agent-session API; there are
  // zero declarations matching agent sessions. The public surface ends at
  // `vscode.chat.createChatParticipant(id, handler)` and
  // `vscode.lm.selectChatModels(selector?)` — neither invokes, reads, nor
  // renders Copilot agent sessions. Every session flag is therefore false,
  // and the canonical limitation always applies (SPEC §7 Level 3, §3.2).
  limitations.push(DIRECT_SESSION_LIMITATION);

  if (!input.copilotExtensionDetected) {
    limitations.push(
      "GitHub Copilot extension not detected. Work Mode Copilot features need the " +
        "company-approved Copilot extension installed and signed in."
    );
  }
  if (!input.copilotChatDetected) {
    limitations.push(
      "GitHub Copilot Chat extension not detected. Copilot chat models are exposed " +
        "through Copilot Chat; without it no models are available."
    );
  }
  if (!input.workspaceOpen) {
    limitations.push("No workspace folder is open, so custom agent files cannot be generated.");
  }

  return {
    available: input.copilotExtensionDetected || input.copilotChatDetected,
    copilotExtensionDetected: input.copilotExtensionDetected,
    copilotChatDetected: input.copilotChatDetected,
    // Custom agent generation only writes workspace markdown files; it needs
    // a workspace, not any Copilot API.
    canCreateCustomAgents: input.workspaceOpen,
    // `export function createChatParticipant(id: string, handler: ChatRequestHandler): ChatParticipant;`
    // exists in @types/vscode 1.91.0 — the flag mirrors the runtime check.
    canRegisterChatParticipant: input.chatParticipantApiAvailable,
    // No `invokeAgentSession`-shaped API exists in @types/vscode 1.91.0.
    canInvokeCopilotAgentSession: false,
    // No third-party agent session API exists in @types/vscode 1.91.0.
    canInvokeThirdPartyAgentSession: false,
    // No API exposes another participant's chat transcript in 1.91.0.
    canReadAgentSessionTranscript: false,
    // No API renders Copilot sessions into a custom webview in 1.91.0.
    canRenderAgentSessionInCustomWebview: false,
    // No Copilot CLI session management API exists in 1.91.0.
    canManageCopilotCliSessions: false,
    limitations,
    checkedAt: new Date().toISOString()
  };
}

/** Human-readable one-paragraph summary for messages and the transcript. */
export function describeCopilotCapabilities(capabilities: CopilotIntegrationCapabilities): string {
  const yes = (flag: boolean) => (flag ? "yes" : "no");
  return (
    `Copilot integration check — Copilot extension: ${yes(capabilities.copilotExtensionDetected)}; ` +
    `Copilot Chat: ${yes(capabilities.copilotChatDetected)}; ` +
    `custom agent generation: ${yes(capabilities.canCreateCustomAgents)}; ` +
    `chat participant API: ${yes(capabilities.canRegisterChatParticipant)}; ` +
    `direct agent session orchestration: no (not exposed through public APIs).`
  );
}
