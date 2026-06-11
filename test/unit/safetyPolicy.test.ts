import assert from "node:assert/strict";
import test from "node:test";
import { SafetyPolicy } from "../../src/core/SafetyPolicy";

test("dangerous mode is blocked by default", () => {
  const policy = new SafetyPolicy({
    enableDangerousModes: false,
    dangerousModeSelected: false,
    dangerousModeConfirmed: false
  });

  assert.equal(policy.effectiveMode("dangerous"), "workspaceWriteWithApproval");
  assert.equal(policy.checkArgs(["--yolo"], "dangerous").allowed, false);
});

test("read-only instruction is generated", () => {
  const policy = new SafetyPolicy({
    enableDangerousModes: false,
    dangerousModeSelected: false,
    dangerousModeConfirmed: false
  });

  assert.match(policy.instructionFor("readOnly"), /READ-ONLY/);
  assert.equal(policy.codexSandboxFor("readOnly", "workspace-write"), "read-only");
});

test("workspace-write mode warns when reviewer or tester is missing", () => {
  const policy = new SafetyPolicy({
    enableDangerousModes: false,
    dangerousModeSelected: false,
    dangerousModeConfirmed: false
  });

  const result = policy.checkWorkflowFileChanges({
    mode: "workspaceWriteWithApproval",
    hasCoder: true,
    hasReviewer: false,
    hasTester: false
  });

  assert.equal(result.blocked, false);
  assert.equal(result.warnings.length, 2);
});
