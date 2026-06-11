import assert from "node:assert/strict";
import test from "node:test";
import { COMMAND_IDS } from "../src/commands/commandIds";

test("extension command list includes all required commands", () => {
  assert.equal(COMMAND_IDS.includes("agentRoom.open"), true);
  assert.equal(COMMAND_IDS.includes("agentRoom.checkCliHealth"), true);
  assert.equal(COMMAND_IDS.includes("agentRoom.runFullBuildCycleOnCurrentFile"), true);
  assert.equal(COMMAND_IDS.includes("agentRoom.openSettings"), true);
});
