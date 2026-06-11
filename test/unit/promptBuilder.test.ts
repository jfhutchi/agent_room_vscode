import assert from "node:assert/strict";
import test from "node:test";
import { buildPrompt } from "../../src/core/PromptBuilder";
import { ROLE_IDS, builtInRoles } from "../../src/core/RoleRegistry";
import { defaultProviders, defaultVirtualAgents } from "../../src/core/VirtualTeamRegistry";
import { AgentRoomMessage, nowIso } from "../../src/core/Types";

function message(id: string, content: string): AgentRoomMessage {
  return {
    id,
    participantKind: "virtualAgent",
    participantId: "atlas",
    displayName: "Atlas",
    providerId: "claudeCodeCli",
    roleIds: [ROLE_IDS.planner],
    roleNames: ["Planner"],
    createdAt: nowIso(),
    status: "complete",
    content
  };
}

test("prompt includes participants, agent identity, roles, workflow step, and latest user message", () => {
  const agent = defaultVirtualAgents().find((entry) => entry.id === "atlas");
  const provider = defaultProviders().find((entry) => entry.id === "claudeCodeCli");
  assert.ok(agent);
  assert.ok(provider);

  const prompt = buildPrompt({
    agent,
    provider,
    roles: builtInRoles().filter((role) => agent.assignedRoleIds.includes(role.id)),
    participants: [{ displayName: "Atlas", providerName: "Claude Code", roleNames: ["Planner"] }],
    workflowName: "Plan -> Review",
    stepName: "Plan",
    stepInstructions: "Create a plan.",
    safetyMode: "readOnly",
    safetyInstruction: "Read only.",
    modelTier: "balanced",
    contextChips: ["selection"],
    transcript: [message("m1", "Earlier note.")],
    latestUserMessage: "Build the extension.",
    workspace: { name: "agent-room" },
    currentFile: { selection: "selected text" },
    maxPromptChars: 20_000
  });

  assert.match(prompt.prompt, /You are: Atlas/);
  assert.match(prompt.prompt, /Planner/);
  assert.match(prompt.prompt, /Plan -> Review/);
  assert.match(prompt.prompt, /Create a plan/);
  assert.match(prompt.prompt, /Build the extension/);
});

test("prompt respects maxPromptChars and truncates older transcript first", () => {
  const agent = defaultVirtualAgents().find((entry) => entry.id === "atlas");
  const provider = defaultProviders().find((entry) => entry.id === "claudeCodeCli");
  assert.ok(agent);
  assert.ok(provider);

  const result = buildPrompt({
    agent,
    provider,
    roles: builtInRoles().filter((role) => agent.assignedRoleIds.includes(role.id)),
    participants: [{ displayName: "Atlas", providerName: "Claude Code", roleNames: ["Planner"] }],
    workflowName: "Manual",
    safetyMode: "readOnly",
    safetyInstruction: "Read only.",
    modelTier: "balanced",
    contextChips: [],
    transcript: [
      message("old", "old message ".repeat(1000)),
      message("new", "new message")
    ],
    latestUserMessage: "Latest request must remain visible.",
    workspace: {},
    maxPromptChars: 2500
  });

  assert.ok(result.prompt.length <= 2500);
  assert.equal(result.truncated, true);
  assert.match(result.prompt, /Latest request must remain visible/);
  assert.doesNotMatch(result.prompt, /old message old message old message/);
});
