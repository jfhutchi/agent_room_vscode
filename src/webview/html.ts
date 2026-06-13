import * as vscode from "vscode";
import { getNonce } from "./nonce";

export function getAgentRoomHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = getNonce();
  const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "agentRoom.css"));
  const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "agentRoom.js"));
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
    `img-src ${webview.cspSource} data:`,
    "font-src 'none'",
    "connect-src 'none'"
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link nonce="${nonce}" rel="stylesheet" href="${cssUri}">
  <title>Agent Room</title>
</head>
<body>
  <main class="app" aria-label="Agent Room">
    <header class="room-header">
      <div>
        <div class="eyebrow">Agent Room</div>
        <h1 id="workspaceName">Workspace</h1>
      </div>
      <div class="mode-badge" aria-label="Operating mode">
        <div id="modeTitle">Agent Room — Personal Mode</div>
        <div id="modeDescription">Using local Claude Code and Codex CLI providers.</div>
      </div>
      <div class="header-actions">
        <button id="healthButton" type="button">Check Health</button>
        <button id="setupButton" type="button" aria-expanded="false">Room Setup</button>
      </div>
    </header>

    <section class="status-strip" aria-label="Provider status">
      <div id="providerHealth" class="provider-health"></div>
      <div class="workflow-picker">
        <label for="workflowSelect">Workflow</label>
        <select id="workflowSelect"></select>
      </div>
      <div class="safety-picker">
        <label for="safetySelect">Safety</label>
        <select id="safetySelect">
          <option value="readOnly">Read only</option>
          <option value="workspaceWriteWithApproval" selected>Workspace write</option>
          <option value="dangerous">Dangerous</option>
        </select>
      </div>
    </section>

    <section id="advisor" class="advisor hidden" aria-live="polite"></section>

    <section id="copilotPanel" class="copilot-panel hidden" aria-label="Copilot integration">
      <div class="copilot-panel-header">
        <h2>Copilot Integration</h2>
        <button id="copilotCheckButton" type="button">Check Capabilities</button>
      </div>
      <div id="copilotCapabilities" class="copilot-capabilities"></div>
      <ul id="copilotLimitations" class="copilot-limitations"></ul>
    </section>

    <section id="setupPanel" class="setup-panel hidden" aria-label="Room setup">
      <div class="setup-grid">
        <section>
          <h2>Team</h2>
          <div id="teamList" class="team-list"></div>
        </section>
        <section>
          <h2>Roles</h2>
          <div id="roleMatrix" class="role-matrix"></div>
          <div class="profile-actions">
            <button id="saveProfileButton" type="button">Save Profile</button>
            <button id="exportProfileButton" type="button">Export</button>
            <button id="importProfileButton" type="button">Import</button>
            <button id="restoreProfileButton" type="button">Restore Defaults</button>
          </div>
        </section>
      </div>
    </section>

    <section id="transcript" class="transcript" aria-live="polite"></section>

    <footer class="composer">
      <div class="context-row">
        <label><input id="chipSelection" type="checkbox" checked> Selection</label>
        <label><input id="chipGitStatus" type="checkbox" checked> Git</label>
        <label><input id="chipCurrentFile" type="checkbox"> File</label>
      </div>
      <textarea id="composerText" rows="4" placeholder="Ask the room..."></textarea>
      <div class="composer-actions">
        <button id="sendButton" type="button">Send</button>
        <button id="runWorkflowButton" type="button">Run Workflow</button>
        <button id="stopButton" type="button">Stop</button>
        <button id="exportMarkdownButton" type="button">Export MD</button>
        <button id="exportJsonButton" type="button">Export JSON</button>
        <button id="clearButton" type="button">Clear</button>
      </div>
    </footer>
  </main>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}
