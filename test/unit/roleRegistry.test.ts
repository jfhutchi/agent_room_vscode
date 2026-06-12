import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_IDS, RoleRegistry } from "../../src/core/RoleRegistry";
import { VirtualTeamRegistry } from "../../src/core/VirtualTeamRegistry";

test("role registry loads built-in roles", () => {
  const registry = new RoleRegistry();

  assert.ok(registry.get(ROLE_IDS.planner));
  assert.ok(registry.get(ROLE_IDS.coder));
  assert.ok(registry.get(ROLE_IDS.finalApprover));
});

test("team members can hold multiple roles and roles can be shared", () => {
  const team = new VirtualTeamRegistry();

  team.assignRole("atlas", ROLE_IDS.coder);
  team.assignRole("sentinel", ROLE_IDS.coder);

  assert.ok(team.get("atlas")?.assignedRoleIds.includes(ROLE_IDS.coder));
  assert.ok(team.get("sentinel")?.assignedRoleIds.includes(ROLE_IDS.coder));
});

test("built-in roles cannot be deleted unless explicitly allowed", () => {
  const registry = new RoleRegistry();

  assert.throws(() => registry.deleteRole(ROLE_IDS.planner), /cannot be deleted/i);
  registry.deleteRole(ROLE_IDS.planner, true);

  assert.equal(registry.get(ROLE_IDS.planner), undefined);
});

test("custom roles can be created, edited, and deleted", () => {
  const registry = new RoleRegistry();
  const custom = registry.createCustomRole({
    name: "Migration Captain",
    description: "Coordinates migration steps.",
    instructions: "Sequence migrations and call out rollback points."
  });

  const edited = registry.updateCustomRole(custom.id, { name: "Migration Lead" });
  assert.equal(edited.name, "Migration Lead");

  registry.deleteRole(custom.id);
  assert.equal(registry.get(custom.id), undefined);
});
