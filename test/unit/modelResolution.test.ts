import assert from "node:assert/strict";
import test from "node:test";
import { resolveConcreteModel } from "../../src/core/ModelResolution";
import type { ModelTierMappings } from "../../src/core/Types";

function mappings(): ModelTierMappings {
  return {
    work: {
      providerDefault: "",
      fast: "company-fast",
      balanced: "",
      deepReasoning: "company-deep",
      coding: "company-code",
      review: "company-review",
      testing: ""
    },
    personal: {
      claude: { fast: "haiku", balanced: "sonnet", deepReasoning: "opus", coding: "sonnet" },
      codex: { fast: "", balanced: "codex-mid", deepReasoning: "codex-deep", coding: "codex-code" },
      webResearch: { research: "gpt-research" }
    }
  };
}

test("Work Mode tiers resolve from the work mappings only", () => {
  assert.equal(resolveConcreteModel(mappings(), "workCopilotNative", "copilotNative", "fast"), "company-fast");
  assert.equal(resolveConcreteModel(mappings(), "workCopilotNative", "copilotNative", "review"), "company-review");
  // Empty mapping means provider default.
  assert.equal(resolveConcreteModel(mappings(), "workCopilotNative", "copilotNative", "balanced"), undefined);
  // Work Mode never reaches into the personal mappings.
  assert.equal(resolveConcreteModel(mappings(), "workCopilotNative", "copilotNative", "coding"), "company-code");
  assert.notEqual(resolveConcreteModel(mappings(), "workCopilotNative", "copilotNative", "coding"), "sonnet");
});

test("Personal Mode resolves per CLI provider", () => {
  assert.equal(resolveConcreteModel(mappings(), "personalLocal", "claudeCodeCli", "deepReasoning"), "opus");
  assert.equal(resolveConcreteModel(mappings(), "personalLocal", "codexCli", "coding"), "codex-code");
  assert.equal(resolveConcreteModel(mappings(), "personalLocal", "codexCli", "fast"), undefined);
  assert.equal(resolveConcreteModel(mappings(), "personalLocal", "openAiWebSearch", "research"), "gpt-research");
});

test("providerDefault and userSelected tiers never force a model", () => {
  assert.equal(resolveConcreteModel(mappings(), "personalLocal", "claudeCodeCli", "providerDefault"), undefined);
  assert.equal(resolveConcreteModel(mappings(), "workCopilotNative", "copilotNative", "userSelected"), undefined);
});

test("tiers without a mapping key resolve to provider default, never invented", () => {
  assert.equal(resolveConcreteModel(mappings(), "personalLocal", "claudeCodeCli", "review"), undefined);
  assert.equal(resolveConcreteModel(mappings(), "personalLocal", "internalConductor", "balanced"), undefined);
});
