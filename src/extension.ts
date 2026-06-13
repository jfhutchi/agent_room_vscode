import * as vscode from "vscode";
import { registerCommands } from "./commands/registerCommands";
import { AgentRoomController } from "./core/AgentRoomController";
import { CHAT_PARTICIPANT_ID, chatParticipantReply } from "./core/ChatParticipant";
import { getAgentRoomSettings } from "./core/Config";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("Agent Room");
  context.subscriptions.push(output);
  const controller = await AgentRoomController.create(context, output);
  context.subscriptions.push({ dispose: () => controller.dispose() });
  registerCommands(context, controller);
  registerChatParticipant(context, controller);
}

/**
 * @agent-room chat participant (SPEC §7 Level 2). The handler is attached
 * whenever the public Chat Participant API exists so an invocation never
 * hits a "no handler" error; the Level 2 behaviors themselves are gated by
 * agentRoom.copilotIntegration.registerChatParticipant (default false) at
 * request time — when disabled the participant only explains how to enable
 * it. It never touches Copilot internals or the Copilot transcript.
 */
function registerChatParticipant(
  context: vscode.ExtensionContext,
  controller: AgentRoomController
): void {
  // Verified in @types/vscode 1.91.0:
  // `export function createChatParticipant(id: string, handler: ChatRequestHandler): ChatParticipant;`
  if (typeof vscode.chat?.createChatParticipant !== "function") return;

  const participant = vscode.chat.createChatParticipant(
    CHAT_PARTICIPANT_ID,
    async (request, _chatContext, stream) => {
      const settings = getAgentRoomSettings();
      const enabled =
        settings.copilotIntegration.enabled &&
        settings.copilotIntegration.registerChatParticipant;
      stream.markdown(
        chatParticipantReply({
          settingEnabled: enabled,
          prompt: request.prompt,
          status: enabled ? controller.chatParticipantStatus(request.prompt) : {}
        })
      );
      if (enabled) {
        stream.button({ command: "agentRoom.open", title: "Open Agent Room" });
        stream.button({
          command: "agentRoom.sendSelectionToAssignedPlanner",
          title: "Send Selection to Planner"
        });
        stream.button({
          command: "agentRoom.generateCopilotCustomAgents",
          title: "Generate Copilot Custom Agents"
        });
      }
      return {};
    }
  );
  context.subscriptions.push(participant);
}

export function deactivate(): void {
  // VS Code disposes subscriptions registered in activate.
}
