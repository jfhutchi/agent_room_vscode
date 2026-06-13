import assert from "node:assert/strict";
import test from "node:test";
import {
  DIRECT_SESSION_LIMITATION,
  ORG_POLICY_LIMITATION,
  describeCopilotCapabilities,
  detectCopilotCapabilities,
  type CopilotDetectionInput
} from "../../src/core/CopilotIntegration";

function everythingDetected(): CopilotDetectionInput {
  return {
    copilotExtensionDetected: true,
    copilotChatDetected: true,
    chatParticipantApiAvailable: true,
    languageModelApiAvailable: true,
    workspaceOpen: true
  };
}

test("agent-session flags stay false even when everything else is detected", () => {
  // SPEC §0.4 / §7: honest false beats fake true. No agent-session API
  // exists in @types/vscode 1.91.0, so no input combination may flip these.
  const capabilities = detectCopilotCapabilities(everythingDetected());

  assert.equal(capabilities.canInvokeCopilotAgentSession, false);
  assert.equal(capabilities.canInvokeThirdPartyAgentSession, false);
  assert.equal(capabilities.canReadAgentSessionTranscript, false);
  assert.equal(capabilities.canRenderAgentSessionInCustomWebview, false);
  assert.equal(capabilities.canManageCopilotCliSessions, false);
});

test("the canonical §3.2 direct-session limitation is always present", () => {
  for (const input of [
    everythingDetected(),
    {
      copilotExtensionDetected: false,
      copilotChatDetected: false,
      chatParticipantApiAvailable: false,
      languageModelApiAvailable: false,
      workspaceOpen: false
    }
  ]) {
    const capabilities = detectCopilotCapabilities(input);
    assert.equal(capabilities.limitations.includes(DIRECT_SESSION_LIMITATION), true);
  }
  assert.match(
    DIRECT_SESSION_LIMITATION,
    /Direct Copilot Agent Session orchestration is not exposed through public APIs/
  );
  assert.match(ORG_POLICY_LIMITATION, /not available under your organization's GitHub Copilot policy/);
});

test("extension and chat detection map straight through, driving availability", () => {
  const both = detectCopilotCapabilities(everythingDetected());
  assert.equal(both.copilotExtensionDetected, true);
  assert.equal(both.copilotChatDetected, true);
  assert.equal(both.available, true);

  const none = detectCopilotCapabilities({
    ...everythingDetected(),
    copilotExtensionDetected: false,
    copilotChatDetected: false
  });
  assert.equal(none.available, false);
  assert.match(none.limitations.join("\n"), /Copilot extension not detected/);
  assert.match(none.limitations.join("\n"), /Copilot Chat extension not detected/);
});

test("custom agent generation requires a workspace, nothing else", () => {
  const noWorkspace = detectCopilotCapabilities({ ...everythingDetected(), workspaceOpen: false });
  assert.equal(noWorkspace.canCreateCustomAgents, false);
  assert.match(noWorkspace.limitations.join("\n"), /No workspace folder is open/);

  const noCopilotButWorkspace = detectCopilotCapabilities({
    copilotExtensionDetected: false,
    copilotChatDetected: false,
    chatParticipantApiAvailable: false,
    languageModelApiAvailable: false,
    workspaceOpen: true
  });
  assert.equal(noCopilotButWorkspace.canCreateCustomAgents, true);
});

test("chat participant flag mirrors the typings-backed runtime check", () => {
  assert.equal(
    detectCopilotCapabilities(everythingDetected()).canRegisterChatParticipant,
    true
  );
  assert.equal(
    detectCopilotCapabilities({ ...everythingDetected(), chatParticipantApiAvailable: false })
      .canRegisterChatParticipant,
    false
  );
});

test("capability summary never claims direct session support", () => {
  const summary = describeCopilotCapabilities(detectCopilotCapabilities(everythingDetected()));
  assert.match(summary, /direct agent session orchestration: no/);
  assert.equal(/direct agent session orchestration: yes/.test(summary), false);
});

test("checkedAt is a real timestamp", () => {
  const capabilities = detectCopilotCapabilities(everythingDetected());
  assert.equal(Number.isNaN(Date.parse(capabilities.checkedAt)), false);
});
