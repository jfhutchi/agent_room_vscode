import assert from "node:assert/strict";
import test from "node:test";
import {
  CopilotNativeProvider,
  NO_COPILOT_MODELS_MESSAGE,
  type CopilotChatModelLike
} from "../../src/core/CopilotNativeProvider";
import { ORG_POLICY_LIMITATION } from "../../src/core/CopilotIntegration";
import { ProviderRegistry } from "../../src/core/ProviderRegistry";
import type { ProviderInvocation } from "../../src/core/ProviderTypes";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeModel(partial: Partial<CopilotChatModelLike> = {}): CopilotChatModelLike {
  return {
    id: "copilot-gpt-4o",
    name: "GPT-4o (Copilot)",
    vendor: "copilot",
    family: "gpt-4o",
    version: "1",
    maxInputTokens: 64000,
    sendRequest: async () => ({
      text: (async function* () {
        yield "Hello ";
        yield "from Copilot";
      })()
    }),
    ...partial
  };
}

function makeProvider(models: CopilotChatModelLike[]) {
  const flag = { value: false };
  const provider = new CopilotNativeProvider({
    selectChatModels: async () => models,
    createUserMessage: (content) => content,
    createCancellation: () => ({
      token: flag,
      cancel: () => {
        flag.value = true;
      },
      dispose: () => undefined
    })
  });
  return { provider, cancelledFlag: flag };
}

function invocation(overrides: Partial<ProviderInvocation> = {}): ProviderInvocation {
  return {
    providerId: "copilotNative",
    virtualAgentId: "atlas",
    prompt: "Say hello",
    safetyMode: "readOnly",
    modelTier: "providerDefault",
    timeoutMs: 5000,
    ...overrides
  };
}

test("copilotNative exists only on the Work side of the partition", () => {
  const { provider } = makeProvider([fakeModel()]);
  assert.deepEqual([...provider.supportedModes], ["workCopilotNative"]);

  const work = new ProviderRegistry([], "workCopilotNative");
  work.register(provider);
  assert.equal(work.has("copilotNative"), true);

  const personal = new ProviderRegistry([], "personalLocal");
  assert.throws(() => personal.register(provider), /does not support Personal Mode/);
  assert.equal(personal.has("copilotNative"), false);
  assert.equal(personal.get("copilotNative"), undefined);
});

test("health is honest when no models are exposed", async () => {
  const { provider } = makeProvider([]);
  const health = await provider.healthCheck();

  assert.equal(health.available, true);
  assert.equal(health.configured, false);
  assert.equal(health.authenticatedLikely, false);
  assert.match(health.warnings.join("\n"), /No Copilot chat models are exposed/);
  assert.match(health.warnings.join("\n"), /organization's GitHub Copilot policy/);
});

test("health reports exposed models", async () => {
  const { provider } = makeProvider([fakeModel()]);
  const health = await provider.healthCheck();

  assert.equal(health.configured, true);
  assert.equal(health.authenticatedLikely, true);
  assert.match(health.versionText ?? "", /GPT-4o \(Copilot\) \(gpt-4o\)/);
});

test("runTurn streams and accumulates the model response", async () => {
  const { provider } = makeProvider([fakeModel()]);
  const partials: string[] = [];

  const result = await provider.runTurn(
    invocation({ onPartialText: (textSoFar) => partials.push(textSoFar) })
  );

  assert.equal(result.status, "complete");
  assert.equal(result.finalText, "Hello from Copilot");
  assert.deepEqual(partials, ["Hello ", "Hello from Copilot"]);
  assert.match(result.diagnostics.commandLabel ?? "", /GPT-4o/);
});

test("runTurn with no models errors with the canonical policy limitation", async () => {
  const { provider } = makeProvider([]);
  const result = await provider.runTurn(invocation());

  assert.equal(result.status, "error");
  assert.equal(result.finalText, NO_COPILOT_MODELS_MESSAGE);
  assert.match(result.finalText, /organization's GitHub Copilot policy/);
});

test("a requested model that is not exposed is refused, never substituted silently", async () => {
  const { provider } = makeProvider([fakeModel()]);
  const result = await provider.runTurn(invocation({ concreteModelName: "gpt-5-enterprise" }));

  assert.equal(result.status, "error");
  assert.match(result.finalText, /"gpt-5-enterprise" is not exposed here/);
  assert.equal(result.finalText.includes(ORG_POLICY_LIMITATION), true);
  assert.match(result.finalText, /Available: gpt-4o/);
});

test("aborting mid-stream yields a cancelled result", async () => {
  const abort = new AbortController();
  const model = fakeModel({
    sendRequest: async (_messages, _options, token) => ({
      text: (async function* () {
        yield "first chunk";
        await delay(30);
        if ((token as { value: boolean }).value) throw new Error("Canceled");
        yield "should never arrive";
      })()
    })
  });
  const { provider } = makeProvider([model]);

  const result = await provider.runTurn(
    invocation({
      abortSignal: abort.signal,
      onPartialText: () => abort.abort()
    })
  );

  assert.equal(result.status, "cancelled");
});

test("a model that never answers times out", async () => {
  const model = fakeModel({
    sendRequest: async (_messages, _options, token) => ({
      text: (async function* () {
        yield "x";
        await delay(120);
        if ((token as { value: boolean }).value) throw new Error("Canceled");
        yield "too late";
      })()
    })
  });
  const { provider } = makeProvider([model]);

  const result = await provider.runTurn(invocation({ timeoutMs: 20 }));

  assert.equal(result.status, "timeout");
  assert.equal(result.diagnostics.timedOut, true);
});
