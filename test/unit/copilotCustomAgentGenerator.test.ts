import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CopilotCustomAgentGenerator,
  CUSTOM_AGENT_FILE_SPECS
} from "../../src/core/CopilotCustomAgentGenerator";
import { builtInRoles } from "../../src/core/RoleRegistry";
import { defaultVirtualAgents } from "../../src/core/VirtualTeamRegistry";

function generator(workspaceRoot: string, customAgentsDirectory = ".github/agents") {
  return new CopilotCustomAgentGenerator({
    workspaceRoot,
    customAgentsDirectory,
    virtualAgents: defaultVirtualAgents("workCopilotNative"),
    roles: builtInRoles()
  });
}

async function withWorkspace(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "agent-room-copilot-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("generates the five SPEC §7 files with every required section", () => {
  const { files, missingAgents } = generator("/workspace").generateFiles();

  assert.deepEqual(missingAgents, []);
  assert.deepEqual(
    files.map((file) => file.fileName).sort(),
    [
      "atlas-planner.agent.md",
      "forge-coder.agent.md",
      "gauge-tester.agent.md",
      "scout-researcher.agent.md",
      "sentinel-reviewer.agent.md"
    ]
  );
  for (const file of files) {
    // §7: name, description, role instructions, expected behavior, safety
    // rules, handoff guidance, expected output format, relationship to the
    // Agent Room virtual team member.
    assert.match(file.content, /^<!-- agent-room:generated content-hash=[0-9a-f]{64} /);
    assert.match(file.content, /\n# /);
    assert.match(file.content, /## Description/);
    assert.match(file.content, /## Role Instructions/);
    assert.match(file.content, /## Expected Behavior/);
    assert.match(file.content, /## Safety Rules/);
    assert.match(file.content, /## Handoff Guidance/);
    assert.match(file.content, /## Expected Output Format/);
    assert.match(file.content, /## Relationship to the Agent Room Virtual Team/);
    assert.match(file.content, /Final Approver/);
  }
  const atlas = files.find((file) => file.fileName === "atlas-planner.agent.md");
  assert.match(atlas?.content ?? "", /Atlas/);
  assert.match(atlas?.content ?? "", /### Planner/);
});

test("write then re-plan round-trips as unchanged", async () => {
  await withWorkspace(async (root) => {
    const gen = generator(root);
    const first = await gen.plan();
    assert.equal(first.entries.every((entry) => entry.action === "create"), true);

    const result = await gen.apply(first);
    assert.equal(result.written.length, CUSTOM_AGENT_FILE_SPECS.length);

    const second = await gen.plan();
    assert.equal(second.entries.every((entry) => entry.action === "skipUnchanged"), true);
    const again = await gen.apply(second);
    assert.deepEqual(again.written, []);
    assert.equal(again.unchanged.length, CUSTOM_AGENT_FILE_SPECS.length);
  });
});

test("team changes update pristine files in place", async () => {
  await withWorkspace(async (root) => {
    const gen = generator(root);
    await gen.apply(await gen.plan());

    const agents = defaultVirtualAgents("workCopilotNative");
    const atlas = agents.find((agent) => agent.id === "atlas");
    assert.ok(atlas);
    atlas.description = "Re-described planning agent for the update test.";
    const changed = new CopilotCustomAgentGenerator({
      workspaceRoot: root,
      customAgentsDirectory: ".github/agents",
      virtualAgents: agents,
      roles: builtInRoles()
    });

    const plan = await changed.plan();
    const atlasEntry = plan.entries.find((entry) => entry.file.fileName === "atlas-planner.agent.md");
    assert.equal(atlasEntry?.action, "update");
    assert.equal(
      plan.entries.filter((entry) => entry.action === "skipUnchanged").length,
      CUSTOM_AGENT_FILE_SPECS.length - 1
    );

    await changed.apply(plan);
    const text = await readFile(path.join(root, ".github", "agents", "atlas-planner.agent.md"), "utf8");
    assert.match(text, /Re-described planning agent/);
  });
});

test("user-edited files are never overwritten without confirmation", async () => {
  await withWorkspace(async (root) => {
    const gen = generator(root);
    await gen.apply(await gen.plan());

    const filePath = path.join(root, ".github", "agents", "forge-coder.agent.md");
    const edited = (await readFile(filePath, "utf8")) + "\nMy local customization.\n";
    await writeFile(filePath, edited, "utf8");

    const plan = await gen.plan();
    const forgeEntry = plan.entries.find((entry) => entry.file.fileName === "forge-coder.agent.md");
    assert.equal(forgeEntry?.action, "skipModified");

    // Default apply: the edit survives byte for byte.
    const result = await gen.apply(plan);
    assert.deepEqual(result.skippedModified, ["forge-coder.agent.md"]);
    assert.deepEqual(result.overwrittenModified, []);
    assert.equal(await readFile(filePath, "utf8"), edited);

    // Only an explicit confirmation flag overwrites.
    const confirmed = await gen.apply(plan, { overwriteModified: true });
    assert.deepEqual(confirmed.overwrittenModified, ["forge-coder.agent.md"]);
    const regenerated = await readFile(filePath, "utf8");
    assert.notEqual(regenerated, edited);
    assert.match(regenerated, /^<!-- agent-room:generated content-hash=/);
  });
});

test("a file without the generation marker is treated as user-owned", async () => {
  await withWorkspace(async (root) => {
    const dir = path.join(root, ".github", "agents");
    const gen = generator(root);
    await gen.apply(await gen.plan());
    await writeFile(
      path.join(dir, "sentinel-reviewer.agent.md"),
      "# My own reviewer agent\n",
      "utf8"
    );

    const plan = await gen.plan();
    const entry = plan.entries.find((e) => e.file.fileName === "sentinel-reviewer.agent.md");
    assert.equal(entry?.action, "skipModified");
  });
});

test("respects a custom customAgentsDirectory", async () => {
  await withWorkspace(async (root) => {
    const gen = generator(root, "tools/copilot-agents");
    await gen.apply(await gen.plan());
    const text = await readFile(
      path.join(root, "tools", "copilot-agents", "atlas-planner.agent.md"),
      "utf8"
    );
    assert.match(text, /Atlas/);
  });
});

test("missing team members are reported, not silently invented", () => {
  const agents = defaultVirtualAgents("workCopilotNative").filter((agent) => agent.id !== "scout");
  const gen = new CopilotCustomAgentGenerator({
    workspaceRoot: "/workspace",
    customAgentsDirectory: ".github/agents",
    virtualAgents: agents,
    roles: builtInRoles()
  });

  const { files, missingAgents } = gen.generateFiles();
  assert.deepEqual(missingAgents, ["scout"]);
  assert.equal(files.length, CUSTOM_AGENT_FILE_SPECS.length - 1);
});
