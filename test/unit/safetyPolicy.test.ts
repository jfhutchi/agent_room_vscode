import assert from "node:assert/strict";
import test from "node:test";
import { FORBIDDEN_INTEGRATION_TECHNIQUES, SafetyPolicy } from "../../src/core/SafetyPolicy";

/** The most permissive context a user can configure. */
function fullyArmedPolicy(): SafetyPolicy {
  return new SafetyPolicy({
    enableDangerousModes: true,
    dangerousModeSelected: true,
    dangerousModeConfirmed: true
  });
}

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

test("dangerous mode requires every gate: setting, selection, and confirmation", () => {
  const armed = fullyArmedPolicy();
  assert.equal(armed.effectiveMode("dangerous"), "dangerous");

  const unconfirmed = new SafetyPolicy({
    enableDangerousModes: true,
    dangerousModeSelected: true,
    dangerousModeConfirmed: false
  });
  assert.equal(unconfirmed.effectiveMode("dangerous"), "workspaceWriteWithApproval");
  assert.equal(unconfirmed.checkArgs(["--dangerously-skip-permissions"], "dangerous").allowed, false);
});

test("Work Mode personal-provider fallback is blocked with the separation guard", () => {
  // SPEC §3.4/§17: no safety context — not even fully armed dangerous mode —
  // permits a cross-partition provider.
  const policy = fullyArmedPolicy();

  for (const providerId of ["claudeCodeCli", "codexCli", "openAiWebSearch"]) {
    const decision = policy.checkProviderForMode(providerId, "workCopilotNative");
    assert.equal(decision.allowed, false);
    assert.match(decision.reason ?? "", /This workspace is in Work Mode/);
    assert.match(decision.reason ?? "", /Agent Room: Switch Operating Mode/);
  }
});

test("Personal Mode Copilot-provider fallback is blocked with the separation guard", () => {
  const policy = fullyArmedPolicy();

  for (const providerId of ["copilotNative", "copilotCustomAgent", "copilotAgentSession"]) {
    const decision = policy.checkProviderForMode(providerId, "personalLocal");
    assert.equal(decision.allowed, false);
    assert.match(decision.reason ?? "", /This workspace is in Personal Mode/);
    assert.match(decision.reason ?? "", /Agent Room: Switch Operating Mode/);
  }
});

test("human and internal Conductor providers are allowed in both modes", () => {
  const policy = fullyArmedPolicy();

  for (const providerId of ["human", "internalConductor"]) {
    assert.equal(policy.checkProviderForMode(providerId, "workCopilotNative").allowed, true);
    assert.equal(policy.checkProviderForMode(providerId, "personalLocal").allowed, true);
  }
});

test("Copilot UI scraping, UI automation, and private APIs are blocked unconditionally", () => {
  const policy = fullyArmedPolicy();

  for (const technique of [
    "copilotChatScraping",
    "copilotUiAutomation",
    "privateVsCodeApi",
    "terminalScreenScraping",
    "orgPolicyBypass",
    "chatGptUiAutomation"
  ]) {
    assert.ok((FORBIDDEN_INTEGRATION_TECHNIQUES as readonly string[]).includes(technique));
    const decision = policy.checkIntegrationTechnique(technique);
    assert.equal(decision.allowed, false);
    assert.match(decision.reason ?? "", /forbidden in every mode/);
  }
});
