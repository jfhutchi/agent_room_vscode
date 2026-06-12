import * as vscode from "vscode";
import { getAgentRoomHtml } from "./html";
import { validateWebviewMessage, WebviewToExtensionMessage } from "../utils/validation";

export class AgentRoomPanel {
  private readonly panel: vscode.WebviewPanel;

  constructor(
    extensionUri: vscode.Uri,
    onMessage: (message: WebviewToExtensionMessage) => void | Promise<void>
  ) {
    this.panel = vscode.window.createWebviewPanel(
      "agentRoom",
      "Agent Room",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")]
      }
    );
    this.panel.iconPath = undefined;
    this.panel.webview.html = getAgentRoomHtml(this.panel.webview, extensionUri);
    this.panel.webview.onDidReceiveMessage(async (raw: unknown) => {
      const message = validateWebviewMessage(raw);
      if (!message) {
        await this.post({ type: "error", message: "Rejected malformed webview message." });
        return;
      }
      await onMessage(message);
    });
  }

  reveal(): void {
    this.panel.reveal(vscode.ViewColumn.Beside);
  }

  onDidDispose(callback: () => void): vscode.Disposable {
    return this.panel.onDidDispose(callback);
  }

  async post(message: Record<string, unknown>): Promise<boolean> {
    return this.panel.webview.postMessage(message);
  }

  dispose(): void {
    this.panel.dispose();
  }
}
