import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { CopilotAgentSessionProvider } from "../../src/core/CopilotAgentSessionProvider";
import {
  CopilotCustomAgentProvider,
  CUSTOM_AGENT_TURN_MESSAGE
} from "../../src/core/CopilotCustomAgentProvider";
import { CopilotCustomAgentGenerator } from "../../src/core/CopilotCustomAgentGenerator";
import { DIRECT_SESSION_LIMITATION } from "../../src/core/CopilotIntegration";
import { ProviderRegistry } from "../../src/core/ProviderRegistry";
import { builtInRoles } from "../../src/core/RoleRegistry";
import { defaultVirtualAgents } from "../../src/core/VirtualTeamRegistry";
import type { ProviderInvocation } from "../../src/core/ProviderTypes";

function invocation(): ProviderInvocation {
  return {
    providerId: "copilotCustomAgent",
    virtualAgentId: "scout",
    prompt: "research something",
    safetyMode: "readOnly",
    modelTier: "providerDefault",
    timeoutMs: 1000
  };
}

test("copilotCustomAgent health reports missing files, then generated files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-room-custom-provider-"));
  try {
    const provider = new CopilotCustomAgentProvider({
      workspaceRoot: root,
      customAgentsDirectory: ".github/agents"
    });

    const before = await provider.healthCheck();
    assert.equal(before.available, true);
    assert.equal(before.configured, false);
    assert.match(before.warnings.join("\n"), /Custom agent files not generated yet/);

    const generator = new CopilotCustomAgentGenerator({
      workspaceRoot: root,
      customAgentsDirectory: ".github/agents",
      virtualAgents: defaultVirtualAgents("workCopilotNative"),
      roles: builtInRoles()
    });
    await generator.apply(await generator.plan());

    const after = await provider.healthCheck();
    assert.equal(after.configured, true);
    assert.match(after.versionText ?? "", /5 agent files/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("copilotCustomAgent never fakes a turn — it explains where custom agents run", async () => {
  const provider = new CopilotCustomAgentProvider({
    workspaceRoot: "/workspace",
    customAgentsDirectory: ".github/agents"
  });

  const result = await provider.runTurn(invocation());

  assert.equal(result.status, "error");
  assert.equal(result.finalText, CUSTOM_AGENT_TURN_MESSAGE);
  assert.match(result.finalText, /GitHub Copilot Chat/);
  assert.equal(result.finalText.includes(DIRECT_SESSION_LIMITATION), true);
});

test("copilotAgentSession scaffold is disabled and refuses every turn with the §3.2 string", async () => {
  const provider = new CopilotAgentSessionProvider();
  assert.equal(provider.enabled, false);

  const health = await provider.healthCheck();
  assert.equal(health.available, false);
  assert.deepEqual(health.warnings, [DIRECT_SESSION_LIMITATION]);

  const result = await provider.runTurn(invocation());
  assert.equal(result.status, "error");
  assert.equal(result.finalText, DIRECT_SESSION_LIMITATION);

  // Even when registered in a Work Mode registry, a disabled provider cannot
  // be invoked through it.
  const registry = new ProviderRegistry([provider], "workCopilotNative");
  await assert.rejects(
    registry.runTurn({ ...invocation(), providerId: "copilotAgentSession" }),
    /Provider is disabled: copilotAgentSession/
  );
});

test("both new Copilot providers exist only on the Work side of the partition", () => {
  const customAgent = new CopilotCustomAgentProvider({ customAgentsDirectory: ".github/agents" });
  const agentSession = new CopilotAgentSessionProvider();
  const personal = new ProviderRegistry([], "personalLocal");

  for (const provider of [customAgent, agentSession]) {
    assert.deepEqual([...provider.supportedModes], ["workCopilotNative"]);
    assert.throws(() => personal.register(provider), /does not support Personal Mode/);
    assert.equal(personal.has(provider.id), false);
  }
});
