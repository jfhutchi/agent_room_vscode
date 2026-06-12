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

test("webview validation rejects unknown commands", () => {
  assert.equal(validateWebviewMessage({ type: "runShell", command: "rm -rf ." }), null);
});

test("webview validation rejects malformed payloads", () => {
  assert.equal(validateWebviewMessage({ type: "sendMessage", text: "" }), null);
  assert.equal(validateWebviewMessage({ type: "updateRoleAssignment", agentId: "atlas" }), null);
  assert.equal(validateWebviewMessage({ type: "switchOperatingMode", mode: "hybrid" }), null);
  assert.equal(validateWebviewMessage({ type: "switchOperatingMode" }), null);
});
