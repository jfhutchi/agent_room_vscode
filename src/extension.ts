import * as vscode from "vscode";
import { registerCommands } from "./commands/registerCommands";
import { AgentRoomController } from "./core/AgentRoomController";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("Agent Room");
  context.subscriptions.push(output);
  const controller = await AgentRoomController.create(context, output);
  context.subscriptions.push({ dispose: () => controller.dispose() });
  registerCommands(context, controller);
}

export function deactivate(): void {
  // VS Code disposes subscriptions registered in activate.
}
