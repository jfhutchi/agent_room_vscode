/**
 * Pure logic for the @agent-room chat participant (SPEC §7 Level 2).
 *
 * Allowed behaviors only: open Agent Room, explain current state, recommend
 * a workflow, route selected context to Agent Room, generate custom agents.
 * The participant never claims to control Copilot internals, never touches
 * private APIs, and never reads the Copilot transcript.
 *
 * The vscode wiring lives in extension.ts; this module stays free of the
 * `vscode` import so the §18 tests can run against it.
 */

export const CHAT_PARTICIPANT_ID = "agent-room";

export const CHAT_PARTICIPANT_DISABLED_MESSAGE =
  "The @agent-room participant is currently disabled. Enable " +
  "`agentRoom.copilotIntegration.registerChatParticipant` in settings to use it.";

export interface ChatParticipantStatus {
  /** Mode title like "Agent Room — Work Mode", or undefined before mode selection. */
  modeTitle?: string;
  modeDescription?: string;
  /** Model Advisor workflow recommendation text for the prompt, if available. */
  recommendationText?: string;
}

/**
 * The participant handler is registered whenever the public API exists so
 * that invoking @agent-room never hits a "no handler" error; the setting
 * gates the Level 2 behaviors at request time instead.
 */
export function chatParticipantReply(input: {
  settingEnabled: boolean;
  prompt: string;
  status: ChatParticipantStatus;
}): string {
  if (!input.settingEnabled) {
    return CHAT_PARTICIPANT_DISABLED_MESSAGE;
  }
  const lines: string[] = [
    "**Agent Room** coordinates a virtual team (Atlas, Forge, Sentinel, Gauge, Scout, " +
      "Conductor) inside VS Code."
  ];
  if (input.status.modeTitle) {
    lines.push(`Current state: ${input.status.modeTitle} — ${input.status.modeDescription ?? ""}`.trim());
  } else {
    lines.push(
      "No operating mode is selected for this workspace yet. Open Agent Room to choose " +
        "Work Mode or Personal Mode."
    );
  }
  if (input.status.recommendationText) {
    lines.push(`Workflow recommendation: ${input.status.recommendationText}`);
  }
  lines.push(
    "I do not control Copilot internals or read the Copilot conversation; use the buttons " +
      "below to work with Agent Room."
  );
  return lines.join("\n\n");
}
