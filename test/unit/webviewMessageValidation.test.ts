import assert from "node:assert/strict";
import test from "node:test";
import { validateWebviewMessage } from "../../src/utils/validation";

test("webview validation accepts known commands", () => {
  assert.deepEqual(validateWebviewMessage({ type: "ready" }), { type: "ready" });
  assert.deepEqual(validateWebviewMessage({ type: "exportTranscript", format: "json" }), {
    type: "exportTranscript",
    format: "json"
  });
  assert.deepEqual(
    validateWebviewMessage({ type: "switchOperatingMode", mode: "workCopilotNative" }),
    { type: "switchOperatingMode", mode: "workCopilotNative" }
  );
});

test("webview validation accepts the Copilot custom agent messages", () => {
  for (const type of [
    "generateCopilotCustomAgents",
    "previewCopilotCustomAgents",
    "openCopilotCustomAgentsFolder",
    "checkCopilotCapabilities"
  ]) {
    assert.deepEqual(validateWebviewMessage({ type }), { type });
  }
});

test("webview validation rejects unknown commands", () => {
  assert.equal(validateWebviewMessage({ type: "runShell", command: "rm -rf ." }), null);
});

test("startOrchestratedBuild requires a non-empty goal", () => {
  assert.deepEqual(validateWebviewMessage({ type: "startOrchestratedBuild", text: "Build a parser" }), {
    type: "startOrchestratedBuild",
    text: "Build a parser"
  });
  assert.equal(validateWebviewMessage({ type: "startOrchestratedBuild", text: "   " }), null);
  assert.equal(validateWebviewMessage({ type: "startOrchestratedBuild" }), null);
});

test("every SPEC §12 allowed message type validates with a well-formed payload", () => {
  // The canonical §12 list, with a minimal valid payload for each.
  const samples: Record<string, object> = {
    ready: {},
    sendMessage: { text: "hello" },
    sendToVirtualAgent: { agentId: "atlas", text: "hi" },
    sendToRole: { roleId: "planner", text: "hi" },
    runWorkflow: { workflowId: "manual", text: "hi" },
    stop: {},
    clearTranscript: {},
    exportTranscript: { format: "markdown" },
    checkHealth: {},
    switchOperatingMode: { mode: "personalLocal" },
    updateUiState: { state: {} },
    toggleContextChip: { chip: "selection", enabled: true },
    updateRoleAssignment: { agentId: "atlas", roleId: "planner", assigned: true },
    saveRoomProfile: {},
    restoreDefaultProfile: {},
    exportRoomProfile: {},
    importRoomProfile: {},
    createCustomRole: { name: "X", description: "d", instructions: "i" },
    updateCustomRole: { roleId: "custom-1" },
    deleteCustomRole: { roleId: "custom-1" },
    applyModelAdvisorRecommendation: { recommendationId: "rec-1" },
    ignoreModelAdvisorRecommendation: { recommendationId: "rec-1" },
    checkCopilotCapabilities: {},
    generateCopilotCustomAgents: {},
    previewCopilotCustomAgents: {},
    openCopilotCustomAgentsFolder: {}
  };
  assert.equal(Object.keys(samples).length, 26);
  for (const [type, payload] of Object.entries(samples)) {
    const validated = validateWebviewMessage({ type, ...payload });
    assert.notEqual(validated, null, `expected §12 message type "${type}" to validate`);
    assert.equal(validated?.type, type);
  }
});

test("webview validation rejects malformed payloads", () => {
  assert.equal(validateWebviewMessage({ type: "sendMessage", text: "" }), null);
  assert.equal(validateWebviewMessage({ type: "updateRoleAssignment", agentId: "atlas" }), null);
  assert.equal(validateWebviewMessage({ type: "switchOperatingMode", mode: "hybrid" }), null);
  assert.equal(validateWebviewMessage({ type: "switchOperatingMode" }), null);
});
