import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ROLE_IDS } from "../../src/core/RoleRegistry";
import { createDefaultRoomProfile } from "../../src/core/RoomProfileStore";
import { TranscriptStore } from "../../src/core/TranscriptStore";

test("transcript store creates, appends, serializes, and exports markdown", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "agent-room-"));
  try {
    const store = new TranscriptStore({ mode: "workspace", workspaceRoot: workspace });
    const transcript = await store.create({
      operatingMode: "personalLocal",
      workspacePath: workspace,
      workspaceName: "agent-room",
      gitBranch: "main",
      roomProfileSnapshot: createDefaultRoomProfile(),
      workflowId: "manual",
      settingsSnapshot: {}
    });

    await store.appendMessage(transcript.id, {
      participantKind: "virtualAgent",
      participantId: "atlas",
      displayName: "Atlas",
      providerId: "claudeCodeCli",
      roleIds: [ROLE_IDS.planner],
      roleNames: ["Planner"],
      status: "complete",
      content: "Here is a plan."
    });

    const loaded = store.current();
    assert.equal(loaded?.messages.length, 1);
    assert.equal(loaded?.messages[0].providerId, "claudeCodeCli");
    assert.deepEqual(loaded?.messages[0].roleIds, [ROLE_IDS.planner]);

    const markdown = store.exportMarkdown(transcript.id);
    assert.match(markdown, /# Agent Room Transcript/);
    assert.match(markdown, /## Atlas/);

    const json = store.exportJson(transcript.id);
    assert.equal(JSON.parse(json).messages.length, 1);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("messages record mode, provider, model, effort, and roles; exports include them (§14)", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "agent-room-"));
  try {
    const store = new TranscriptStore({ mode: "workspace", workspaceRoot: workspace });
    const transcript = await store.create({
      operatingMode: "personalLocal",
      workspacePath: workspace,
      workspaceName: "agent-room",
      roomProfileSnapshot: createDefaultRoomProfile(),
      workflowId: "planReview",
      settingsSnapshot: {}
    });

    await store.appendMessage(transcript.id, {
      participantKind: "virtualAgent",
      participantId: "atlas",
      displayName: "Atlas",
      providerId: "claudeCodeCli",
      operatingMode: "personalLocal",
      roleIds: [ROLE_IDS.planner],
      roleNames: ["Planner"],
      modelTier: "deepReasoning",
      concreteModelName: "opus",
      effortLevel: "high",
      workflowId: "planReview",
      status: "complete",
      content: "Plan ready."
    });

    const stored = store.current()?.messages[0];
    assert.equal(stored?.operatingMode, "personalLocal");
    assert.equal(stored?.providerId, "claudeCodeCli");
    assert.equal(stored?.modelTier, "deepReasoning");
    assert.equal(stored?.concreteModelName, "opus");
    assert.equal(stored?.effortLevel, "high");
    assert.deepEqual(stored?.roleNames, ["Planner"]);

    const markdown = store.exportMarkdown(transcript.id);
    assert.match(markdown, /Personal Mode · claudeCodeCli · opus · effort: high/);
    assert.match(markdown, /Roles: Planner/);

    const json = JSON.parse(store.exportJson(transcript.id)) as {
      messages: Array<Record<string, unknown>>;
    };
    assert.equal(json.messages[0].concreteModelName, "opus");
    assert.equal(json.messages[0].effortLevel, "high");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("transcript store creates distinct mode-tagged transcript segments", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "agent-room-"));
  try {
    const store = new TranscriptStore({ mode: "workspace", workspaceRoot: workspace });
    const personal = await store.create({
      operatingMode: "personalLocal",
      workspacePath: workspace,
      workspaceName: "agent-room",
      roomProfileSnapshot: createDefaultRoomProfile("personalLocal"),
      workflowId: "manual",
      settingsSnapshot: {}
    });
    const work = await store.create({
      operatingMode: "workCopilotNative",
      workspacePath: workspace,
      workspaceName: "agent-room",
      roomProfileSnapshot: createDefaultRoomProfile("workCopilotNative"),
      workflowId: "manual",
      settingsSnapshot: {}
    });

    assert.notEqual(personal.id, work.id);
    assert.equal(store.current()?.id, work.id);
    assert.equal(store.get(personal.id)?.operatingMode, "personalLocal");
    assert.equal(store.get(work.id)?.operatingMode, "workCopilotNative");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
