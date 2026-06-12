import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { COMMAND_IDS } from "../src/commands/commandIds";

test("extension command list includes all required commands", () => {
  assert.equal(COMMAND_IDS.includes("agentRoom.open"), true);
  assert.equal(COMMAND_IDS.includes("agentRoom.checkCliHealth"), true);
  assert.equal(COMMAND_IDS.includes("agentRoom.switchOperatingMode"), true);
  assert.equal(COMMAND_IDS.includes("agentRoom.runFullBuildCycleOnCurrentFile"), true);
  assert.equal(COMMAND_IDS.includes("agentRoom.openSettings"), true);
});

test("package contributes only the two supported operating modes", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    contributes: { configuration: { properties: Record<string, { enum?: string[]; default?: string }> } };
  };
  const setting = pkg.contributes.configuration.properties["agentRoom.operatingMode"];
  assert.deepEqual(setting.enum, ["workCopilotNative", "personalLocal"]);
  assert.equal(setting.default, "personalLocal");
  assert.equal(setting.enum?.includes("hybrid"), false);
});
