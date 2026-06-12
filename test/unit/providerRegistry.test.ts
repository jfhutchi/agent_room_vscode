import assert from "node:assert/strict";
import test from "node:test";
import { ProviderRegistry } from "../../src/core/ProviderRegistry";
import { emptyHealth, type Provider } from "../../src/core/ProviderTypes";
import type { OperatingMode } from "../../src/core/OperatingMode";
import type { ProviderId, ProviderKind, WebResearchSettings } from "../../src/core/Types";
import { ClaudeCodeProvider } from "../../src/core/ClaudeCodeProvider";
import { CodexCliProvider } from "../../src/core/CodexCliProvider";
import { OpenAiWebSearchProvider } from "../../src/core/OpenAiWebSearchProvider";

function fakeProvider(
  id: ProviderId,
  kind: ProviderKind,
  supportedModes: OperatingMode[]
): Provider {
  return {
    id,
    displayName: id,
    kind,
    enabled: true,
    supportedModes,
    healthCheck: async () => emptyHealth(id),
    runTurn: async () => {
      throw new Error("not under test");
    }
  };
}

const personalProviders = (): Provider[] => [
  fakeProvider("claudeCodeCli", "localCli", ["personalLocal"]),
  fakeProvider("codexCli", "localCli", ["personalLocal"]),
  fakeProvider("openAiWebSearch", "apiResearch", ["personalLocal"])
];

test("personal providers register in Personal Mode", () => {
  const registry = new ProviderRegistry(personalProviders(), "personalLocal");
  assert.deepEqual(
    registry.all().map((provider) => provider.id),
    ["claudeCodeCli", "codexCli", "openAiWebSearch"]
  );
});

test("Work Mode registry refuses personal providers - they are NOT REGISTERED", () => {
  for (const provider of personalProviders()) {
    assert.throws(
      () => new ProviderRegistry([provider], "workCopilotNative"),
      /does not support Work Mode/
    );
  }
  const registry = new ProviderRegistry([], "workCopilotNative");
  for (const provider of personalProviders()) {
    assert.throws(() => registry.register(provider), /cannot be registered/);
    assert.equal(registry.has(provider.id), false);
    assert.equal(registry.get(provider.id), undefined);
  }
  assert.deepEqual(registry.all(), []);
});

test("Personal Mode registry refuses Copilot providers", () => {
  const copilot = fakeProvider("copilotNative", "copilot", ["workCopilotNative"]);
  const registry = new ProviderRegistry([], "personalLocal");
  assert.throws(() => registry.register(copilot), /does not support Personal Mode/);
  assert.equal(registry.has("copilotNative"), false);
});

test("the real personal provider classes cannot exist in a Work Mode registry", () => {
  // Not fakes: these are the concrete provider implementations the extension
  // constructs in Personal Mode. Every one declares personalLocal only, so a
  // Work Mode registry refuses each at registration — the §3.4 partition
  // holds for the real objects, not just test doubles.
  const webResearchSettings: WebResearchSettings = {
    enabled: true,
    provider: "openai",
    model: "gpt-test",
    apiKeySource: "environment",
    apiKeyEnvironmentVariable: "OPENAI_API_KEY",
    maxResults: 3,
    requireCitations: true,
    onlyWhenRequested: true,
    allowedDomains: [],
    blockedDomains: [],
    searchFreshness: "auto"
  };
  const realPersonalProviders: Provider[] = [
    new ClaudeCodeProvider({
      executable: "claude",
      timeoutMs: 1000,
      preferJson: true,
      preferStreamJson: false
    }),
    new CodexCliProvider({
      executable: "codex",
      timeoutMs: 1000,
      useJson: true,
      sandbox: "read-only",
      approval: "untrusted"
    }),
    new OpenAiWebSearchProvider({ enabled: true, settings: webResearchSettings })
  ];

  const workRegistry = new ProviderRegistry([], "workCopilotNative");
  for (const provider of realPersonalProviders) {
    assert.deepEqual([...provider.supportedModes], ["personalLocal"]);
    assert.throws(() => workRegistry.register(provider), /cannot be registered/);
    assert.equal(workRegistry.has(provider.id), false);
    assert.equal(workRegistry.get(provider.id), undefined);
  }
  assert.deepEqual(workRegistry.all(), []);
});

test("running a turn against an unregistered cross-mode provider rejects", async () => {
  const registry = new ProviderRegistry([], "workCopilotNative");
  await assert.rejects(
    registry.runTurn({
      providerId: "claudeCodeCli",
      virtualAgentId: "atlas",
      prompt: "hello",
      safetyMode: "readOnly",
      modelTier: "providerDefault",
      timeoutMs: 1000
    }),
    /Provider not registered: claudeCodeCli/
  );
});
