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
