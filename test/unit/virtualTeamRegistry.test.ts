import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_IDS } from "../../src/core/RoleRegistry";
import { AGENT_IDS, VirtualTeamRegistry } from "../../src/core/VirtualTeamRegistry";

test("default team contains required virtual agents", () => {
  const team = new VirtualTeamRegistry();
  const names = team.all().map((agent) => agent.displayName);

  assert.deepEqual(names, ["User", "Atlas", "Forge", "Sentinel", "Gauge", "Scout", "Conductor"]);
});

test("Atlas and Forge share Claude provider while Sentinel and Gauge share Codex provider", () => {
  const team = new VirtualTeamRegistry();
  const shared = team.sharedProviderUsage();

  assert.deepEqual(shared.get("claudeCodeCli"), ["Atlas", "Forge"]);
  assert.deepEqual(shared.get("codexCli"), ["Sentinel", "Gauge"]);
});

test("Scout is disabled by default", () => {
  const team = new VirtualTeamRegistry();

  assert.equal(team.get(AGENT_IDS.scout)?.enabled, false);
});

test("role assignments persist in registry state", () => {
  const team = new VirtualTeamRegistry();

  team.assignRole(AGENT_IDS.gauge, ROLE_IDS.reviewer);
  team.removeRole(AGENT_IDS.gauge, ROLE_IDS.tester);

  assert.ok(team.get(AGENT_IDS.gauge)?.assignedRoleIds.includes(ROLE_IDS.reviewer));
  assert.equal(team.get(AGENT_IDS.gauge)?.assignedRoleIds.includes(ROLE_IDS.tester), false);
});
